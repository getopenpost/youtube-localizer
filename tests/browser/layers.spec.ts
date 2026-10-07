import { readFile, mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, CHANNEL, VIDEO, send, openSelection } from './fixture';
import type { Job } from '../../src/core/model';
test('prepares text layers once, resumes its saved receipt, then renders German and Arabic locally across reloads', async ({
  context,
  extensionId,
  studioState,
}) => {
  let paid = 0,
    textPaid = 0,
    external = 0,
    completed = false;
  await context.route('https://api.openai.com/**', async (route) => {
    textPaid++;
    await route.abort();
  });
  await context.route('https://example.com/**', async (route) => {
    external++;
    await route.abort();
  });
  await context.route('https://v3.fal.media/**', async (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: await readFile('tests/fixtures/thumbnail.png'),
    }),
  );
  await context.route('https://queue.fal.run/**', async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST') {
      paid++;
      expect(url).toBe(
        'https://queue.fal.run/fal-ai/ideogram/v3/layerize-text',
      );
      expect(route.request().postDataJSON().image_url).toMatch(
        /^data:image\/png;base64,/,
      );
      await route.fulfill({
        json: {
          request_id: 'layer-fixture',
          status_url:
            'https://queue.fal.run/fal-ai/ideogram/requests/layer-fixture/status',
          response_url:
            'https://queue.fal.run/fal-ai/ideogram/requests/layer-fixture',
        },
      });
    } else if (url.endsWith('/status'))
      await route.fulfill({
        json: { status: completed ? 'COMPLETED' : 'IN_PROGRESS' },
      });
    else
      await route.fulfill({
        json: {
          image: { url: 'https://v3.fal.media/background.png' },
          text_html:
            '<img src="https://example.com/leak"><script>fetch("https://example.com/execute")</script><div style="position:absolute;left:100px;top:430px;width:1080px;height:180px;font-size:96px;font-weight:600;font-family:sans-serif;color:#ffe100;text-align:center;background:url(https://example.com/style)">Aprender<br>ao teu ritmo</div>',
        },
      });
  });
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() =>
    chrome.storage.session.set({
      credentials: { textKey: '', imageKey: '', falKey: 'fixture-fal' },
    }),
  );
  const { panel, studio } = await openSelection(context, extensionId);
  await send(panel, {
    type: 'settings',
    settings: { provider: { imageProvider: 'layerize' } },
  });
  await send(panel, {
    type: 'preferences',
    preferences: {
      channelId: CHANNEL,
      sourceLanguage: 'pt',
      targetLanguages: ['en', 'de', 'ar'],
      components: ['thumbnail'],
      glossary: '',
    },
  });
  await send(panel, {
    type: 'preflight',
    channelId: CHANNEL,
    videoIds: [VIDEO],
  });
  const review = await context.newPage();
  await review.goto(`chrome-extension://${extensionId}/review.html`);
  await review.getByRole('button', { name: 'Prepare text layers' }).click();
  await expect.poll(() => paid).toBe(1);
  await expect(review.getByText('Preparing editable text…')).toBeVisible();
  await review.reload();
  await send(review, { type: 'prepare-template', videoId: VIDEO });
  expect(paid).toBe(1);
  completed = true;
  await send(review, { type: 'prepare-template', videoId: VIDEO });
  await expect(review.getByLabel('Layer 1 source text')).toHaveValue(
    'Aprender\nao teu ritmo',
  );
  await expect(
    review.getByRole('img', {
      name: `Editable thumbnail preview for ${studioState.title}`,
    }),
  ).toBeVisible();
  await review.getByRole('button', { name: 'Approve layout' }).click();
  for (const [name, words] of [
    ['English', 'Learn at your own pace'],
    ['German', 'Lerne in deinem eigenen Tempo'],
    ['Arabic', 'تعلّم بالسرعة التي تناسبك'],
  ]) {
    await review.getByLabel(`${name} thumbnail text 1`).fill(words);
    await review
      .locator('.wording-review')
      .filter({ has: review.getByLabel(`${name} thumbnail text 1`) })
      .getByRole('checkbox')
      .check();
  }
  await review
    .getByRole('button', { name: 'Generate missing', exact: true })
    .click();
  await expect(
    review.getByRole('img', { name: 'Arabic generated thumbnail' }),
  ).toBeVisible();
  await expect(
    review.getByRole('button', { name: 'Generate missing', exact: true }),
  ).toBeEnabled();
  expect(paid).toBe(1);
  expect(textPaid).toBe(0);
  expect(external).toBe(0);
  expect(studioState.saves).toBe(0);
  const images = await review.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('youtube-localizer', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const values = await new Promise<Job[]>((resolve) => {
      const r = db.transaction('jobs').objectStore('jobs').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    const run = await new Promise<{ requestsUsed: number }>((resolve) => {
      const r = db.transaction('meta').objectStore('meta').get('run');
      r.onsuccess = () => resolve(r.result);
    });
    const assets = await Promise.all(
      values.map(
        (j) =>
          new Promise<{ width: number; height: number; blob: Blob }>(
            (resolve) => {
              const r = db
                .transaction('assets')
                .objectStore('assets')
                .get(j.slots.thumbnail!.assetId!);
              r.onsuccess = () => resolve(r.result);
            },
          ),
      ),
    );
    db.close();
    return {
      byLanguage: Object.fromEntries(
        values.map((j) => [j.language, j.slots.thumbnail?.assetId]),
      ),
      ids: values.map((j) => j.slots.thumbnail?.assetId),
      counts: run.requestsUsed,
      dimensions: assets.map((a) => [a.width, a.height, a.blob.type]),
    };
  });
  expect(new Set(images.ids).size).toBe(3);
  expect(images.counts).toBe(0);
  expect(images.dimensions).toEqual([
    [1280, 720, 'image/jpeg'],
    [1280, 720, 'image/jpeg'],
    [1280, 720, 'image/jpeg'],
  ]);
  await review.reload();
  await review
    .getByRole('button', { name: 'Generate missing', exact: true })
    .click();
  await expect(
    review.getByRole('button', { name: 'Generate missing', exact: true }),
  ).toBeEnabled();
  expect(paid).toBe(1);
  expect(textPaid).toBe(0);
  await send(review, {
    type: 'approve',
    jobId: `${CHANNEL}/${VIDEO}/en`,
    component: 'thumbnail',
    approved: true,
  });
  // Simulate a restart after the layout checkpoint and before job invalidation.
  await review.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('youtube-localizer', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    const r = store.openCursor();
    r.onsuccess = () => {
      const cursor = r.result;
      if (!cursor) return;
      if (String(cursor.key).startsWith('template:'))
        cursor.update({
          ...cursor.value,
          revision: 'new-layout-after-interruption',
        });
      cursor.continue();
    };
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await expect(
    send(review, {
      type: 'approve',
      jobId: `${CHANNEL}/${VIDEO}/en`,
      component: 'thumbnail',
      approved: true,
    }),
  ).rejects.toThrow('layout changed');
  await studio.bringToFront();
  await send(review, { type: 'apply', jobIds: [`${CHANNEL}/${VIDEO}/en`] });
  await expect(review.locator('.component-error')).toContainText(
    'editable layout changed',
  );
  expect(studioState.saves).toBe(0);
  await review.getByText('Adjust layout', { exact: true }).click();
  await expect(
    review.getByRole('combobox', { name: 'Font', exact: true }),
  ).toHaveValue('sans-serif');
  await review.getByLabel('Layer fontSize', { exact: true }).fill('84');
  await review.getByRole('button', { name: 'Approve layout' }).click();
  await expect(review.getByText('Source changed', { exact: true })).toHaveCount(
    3,
  );
  await review
    .getByRole('button', { name: 'Generate missing', exact: true })
    .click();
  await expect
    .poll(() =>
      review.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open('youtube-localizer', 1);
          r.onsuccess = () => resolve(r.result);
        });
        const job = await new Promise<Job>((resolve) => {
          const r = db.transaction('jobs').objectStore('jobs').get(id);
          r.onsuccess = () => resolve(r.result);
        });
        db.close();
        return job.slots.thumbnail?.assetId;
      }, `${CHANNEL}/${VIDEO}/en`),
    )
    .not.toBe(images.byLanguage.en);
  await expect(
    review.getByRole('button', { name: 'Generate missing', exact: true }),
  ).toBeEnabled();
  expect(paid).toBe(1);
  expect(textPaid).toBe(0);
  expect(
    (
      await new AxeBuilder({ page: review })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await mkdir('.impeccable/review', { recursive: true });
  await review.setViewportSize({ width: 1440, height: 900 });
  await review.screenshot({
    path: '.impeccable/review/layers-desktop.png',
    fullPage: true,
  });
  await review.emulateMedia({ colorScheme: 'dark' });
  await review.setViewportSize({ width: 390, height: 844 });
  await review.screenshot({
    path: '.impeccable/review/layers-mobile-dark.png',
    fullPage: true,
  });
  expect(
    await review.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const textBox = review.getByRole('combobox', { name: /^Text box/ });
  await expect(textBox).toBeVisible();
  const priorCount = await textBox.locator('option').count();
  expect(priorCount).toBeGreaterThan(0);
  await review
    .getByRole('button', { name: 'Add text box', exact: true })
    .click();
  await expect(textBox).toHaveValue(String(priorCount));
  await expect(
    review.getByLabel('Layer fontSize', { exact: true }),
  ).toBeVisible();
  await review
    .getByRole('combobox', { name: 'Font', exact: true })
    .selectOption('Geist');
  expect(
    await review.evaluate(
      async () => (await document.fonts.load('400 16px "Geist"')).length,
    ),
  ).toBeGreaterThan(0);
});
