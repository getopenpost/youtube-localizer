import { afterEach, expect, it, vi } from 'vitest';
import { Repository } from '../../src/core/storage';
import { creationSchema } from '../../src/thumbnails/model';
import {
  recoverCreations,
  generateThumbnail,
  pollCreations,
} from '../../src/thumbnails/coordinator';
import * as images from '../../src/platform/images';
import { submitCreation } from '../../src/providers/create-image';
const creation = () =>
  creationSchema.parse({
    id: crypto.randomUUID(),
    video: {
      id: 'abcdefghijk',
      channelId: 'UC0000000000000000000000',
      channelName: 'Fixture',
      title: 'Source',
      description: 'Context',
      visibility: 'scheduled',
    },
    prompt: 'A new thumbnail',
    references: [],
    model: 'openai/gpt-image-2.5/sunburst/edit',
    state: 'submitting',
    createdAt: 1,
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('recovers an interrupted creation as ambiguous and reuses its id without another submission', async () => {
  const repo = new Repository(crypto.randomUUID());
  const value = creation();
  value.requestId = 'saved-openai-request';
  await repo.putCreation(value);
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  await recoverCreations(repo);
  const result = await generateThumbnail(repo, {
    id: value.id,
    videoId: value.video.id,
    prompt: 'Changed caller prompt',
    referenceIds: [],
    useCurrent: false,
    acknowledged: false,
  });
  expect(result.state).toBe('ambiguous');
  expect(result.requestId).toBe('saved-openai-request');
  expect(result.prompt).toBe('A new thumbnail');
  expect(network).not.toHaveBeenCalled();
});
it('rechecks pause after reference serialization and rejects before the paid fetch', async () => {
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  await expect(
    submitCreation(
      creation(),
      'fixture-key',
      [new Blob(['fixture image'], { type: 'image/png' })],
      async () => false,
    ),
  ).rejects.toMatchObject({
    outcome: 'rejected',
    message: 'Generation paused before submission.',
  });
  expect(network).not.toHaveBeenCalled();
});

it('resumes a stored creation receipt after restart and caches the asset without another paid POST', async () => {
  const name = crypto.randomUUID();
  const repo = new Repository(name);
  const value = creation();
  value.falRequest = {
    requestId: 'saved-fal-request',
    model: 'openai/gpt-image-2.5/sunburst/edit',
    statusUrl:
      'https://queue.fal.run/openai/gpt-image-2.5/requests/saved-fal-request/status',
    responseUrl:
      'https://queue.fal.run/openai/gpt-image-2.5/requests/saved-fal-request',
  };
  await repo.putCreation(value);
  vi.stubGlobal('chrome', {
    runtime: { id: 'fixture' },
    storage: {
      local: { get: async () => ({}) },
      session: {
        get: async () => ({
          credentials: { textKey: '', falKey: 'fixture-fal' },
        }),
      },
    },
  });
  const asset = {
    id: 'c'.repeat(64),
    hash: 'c'.repeat(64),
    blob: new Blob(['image'], { type: 'image/jpeg' }),
    width: 1280,
    height: 720,
  };
  vi.spyOn(images, 'imageAsset').mockResolvedValue(asset);
  const network = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    expect(init?.method ?? 'GET').toBe('GET');
    if (String(url).startsWith('https://v3.fal.media/')) {
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
      return new Response('fixture-png', {
        headers: { 'content-type': 'image/png' },
      });
    }
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Key fixture-fal',
    );
    return new Response(
      JSON.stringify(
        String(url).endsWith('/status')
          ? { status: 'COMPLETED' }
          : { images: [{ url: 'https://v3.fal.media/saved-result.png' }] },
      ),
    );
  });
  vi.stubGlobal('fetch', network);
  const restarted = new Repository(name);
  await recoverCreations(restarted);
  expect((await restarted.creation(value.id))?.state).toBe('waiting');
  expect(await pollCreations(restarted)).toBe(true);
  expect(await restarted.creation(value.id)).toMatchObject({
    state: 'generated',
    assetId: asset.id,
    falRequest: { requestId: 'saved-fal-request' },
  });
  expect((await restarted.asset(asset.id))?.width).toBe(1280);
  expect(network).toHaveBeenCalledTimes(3);
  expect(await pollCreations(restarted)).toBe(false);
  expect(network).toHaveBeenCalledTimes(3);
});
