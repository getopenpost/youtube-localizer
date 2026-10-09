import { test, expect, openSelection, send, CHANNEL, VIDEO } from './fixture';
import type { Job } from '../../src/core/model';

test('video-list thumbnails load before checking or opening videos', async ({
  context,
  extensionId,
  studioState,
}) => {
  void studioState;
  const { studio, panel } = await openSelection(context, extensionId);
  const image = panel.getByRole('img', {
    name: 'Thumbnail for Aprender ao teu ritmo',
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBeGreaterThan(0);
  expect(new URL(studio.url()).pathname).toBe(`/channel/${CHANNEL}/videos`);
});

test('a lost session key blocks generation without failing queued translations or consuming a request', async ({
  context,
  extensionId,
  studioState,
}) => {
  void studioState;
  const { panel } = await openSelection(context, extensionId);
  await send(panel, {
    type: 'preflight',
    channelId: CHANNEL,
    videoIds: [VIDEO],
  });
  const ids = [`${CHANNEL}/${VIDEO}/en`];
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    await chrome.storage.session.set({
      credentials: { textKey: 'fixture-key', falKey: '' },
    });
    await chrome.storage.session.remove('credentials');
  });
  await expect(send(panel, { type: 'generate', jobIds: ids })).rejects.toThrow(
    /text provider API key/i,
  );
  const state = await panel.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('youtube-localizer', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const jobs = await new Promise<Job[]>((resolve) => {
      const r = db.transaction('jobs').objectStore('jobs').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    const run = await new Promise<{ mode: string; requestsUsed: number }>(
      (resolve) => {
        const r = db.transaction('meta').objectStore('meta').get('run');
        r.onsuccess = () => resolve(r.result);
      },
    );
    db.close();
    return {
      generations: jobs.flatMap((job) =>
        Object.values(job.slots).map((slot) => slot?.generation),
      ),
      run,
    };
  });
  expect(state.generations).not.toContain('error');
  expect(state.generations).not.toContain('submitting');
  expect(state.run.mode).toBe('paused');
  expect(state.run.requestsUsed).toBe(0);
});
