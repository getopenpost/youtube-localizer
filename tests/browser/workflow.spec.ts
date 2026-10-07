import { mkdir, readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import {
  test,
  expect,
  CHANNEL,
  VIDEO,
  SCHEDULE,
  send,
  openSelection,
} from './fixture';
import type { Job } from '../../src/core/model';

test('extension connects the current page, preflights a scheduled video, preserves existing translations, and generates once', async ({
  context,
  extensionId,
  studioState,
}) => {
  let paidRequests = 0;
  await context.route(
    'https://api.openai.com/v1/chat/completions',
    async (route) => {
      paidRequests++;
      await route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Learn at your own pace',
                  description: '00:00 Introduction',
                  thumbnailStrings: [],
                }),
              },
            },
          ],
        }),
      });
    },
  );
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() =>
    chrome.storage.session.set({
      credentials: { textKey: 'fixture-text-key', falKey: '' },
    }),
  );
  const { panel } = await openSelection(context, extensionId);
  await send(panel, {
    type: 'preferences',
    preferences: {
      channelId: CHANNEL,
      sourceLanguage: 'pt',
      targetLanguages: ['en', 'fr'],
      components: ['title', 'description'],
      glossary: 'OpenPost',
    },
  });
  await panel.locator('.video-row input').check();
  await panel
    .getByRole('button', { name: 'Check missing translations' })
    .click();
  await expect(
    panel.getByText('Preflight finished.', { exact: false }),
  ).toBeVisible();
  const review = await context.newPage();
  await review.goto(`chrome-extension://${extensionId}/review.html`);
  await expect(
    review.getByText('Already present', { exact: true }),
  ).toHaveCount(2);
  await review
    .getByRole('button', { name: 'Generate missing', exact: true })
    .click();
  await expect(review.getByLabel('English title', { exact: true })).toHaveValue(
    'Learn at your own pace',
  );
  await send(review, { type: 'pause' });
  await review.reload();
  await expect(
    review.getByLabel('English description', { exact: true }),
  ).toHaveValue('00:00 Introduction');
  await review
    .getByRole('button', { name: 'Generate missing', exact: true })
    .click();
  await expect(
    review.getByText('Generation finished.', { exact: false }),
  ).toBeVisible();
  expect(paidRequests).toBe(1);
  expect(studioState.saves).toBe(0);
  expect(studioState.visibility).toBe(SCHEDULE);
  expect(studioState.translations.fr.title).toBe('Traduction manuelle');
  const violations = (
    await new AxeBuilder({ page: review })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
  ).violations;
  expect(violations).toEqual([]);
  await mkdir('.impeccable/review', { recursive: true });
  await review.setViewportSize({ width: 1440, height: 900 });
  await review.screenshot({
    path: '.impeccable/review/desktop.png',
    fullPage: true,
  });
  await review.setViewportSize({ width: 390, height: 844 });
  await review.screenshot({
    path: '.impeccable/review/mobile.png',
    fullPage: true,
  });
  expect(
    await review.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('writes an approved text pair, reloads the saved fields, and leaves schedule and manual French content unchanged', async ({
  context,
  extensionId,
  studioState,
}) => {
  const { panel } = await openSelection(context, extensionId);
  await send(panel, {
    type: 'preferences',
    preferences: {
      channelId: CHANNEL,
      sourceLanguage: 'pt',
      targetLanguages: ['en', 'fr'],
      components: ['title', 'description'],
      glossary: '',
    },
  });
  await send(panel, {
    type: 'preflight',
    channelId: CHANNEL,
    videoIds: [VIDEO],
  });
  const englishId = `${CHANNEL}/${VIDEO}/en`;
  // Seed a provider-produced result at the real IndexedDB persistence boundary.
  await panel.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('youtube-localizer', 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction('jobs', 'readwrite');
    const store = tx.objectStore('jobs');
    const request = store.get(id);
    request.onsuccess = () => {
      const job = request.result as Job;
      job.slots.title = {
        ...job.slots.title!,
        generation: 'generated',
        application: 'pending',
        value: 'Learn at your own pace',
      };
      job.slots.description = {
        ...job.slots.description!,
        generation: 'generated',
        application: 'pending',
        value: '00:00 Introduction',
      };
      store.put(job);
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, englishId);
  await send(panel, {
    type: 'approve',
    jobId: englishId,
    component: 'title',
    approved: true,
  });
  await send(panel, {
    type: 'approve',
    jobId: englishId,
    component: 'description',
    approved: true,
  });
  await send(panel, { type: 'apply', jobIds: [englishId] });
  await expect
    .poll(() => studioState.translations.en?.description)
    .toBe('00:00 Introduction');
  expect(studioState.translations.en.title).toBe('Learn at your own pace');
  expect(studioState.visibility).toBe(SCHEDULE);
  expect(studioState.title).toBe('Aprender ao teu ritmo');
  expect(studioState.translations.fr).toEqual({
    title: 'Traduction manuelle',
    description: 'À préserver',
    thumbnail: false,
  });
  const review = await context.newPage();
  await review.goto(`chrome-extension://${extensionId}/review.html`);
  await expect(
    review.getByText('Verified in Studio', { exact: true }),
  ).toHaveCount(2);
});

test('rejects a changed source before writing and keeps the generated component', async ({
  context,
  extensionId,
  studioState,
}) => {
  const { panel } = await openSelection(context, extensionId);
  await send(panel, {
    type: 'preferences',
    preferences: {
      channelId: CHANNEL,
      sourceLanguage: 'pt',
      targetLanguages: ['en'],
      components: ['title'],
      glossary: '',
    },
  });
  await send(panel, {
    type: 'preflight',
    channelId: CHANNEL,
    videoIds: [VIDEO],
  });
  const id = `${CHANNEL}/${VIDEO}/en`;
  await panel.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('youtube-localizer', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction('jobs', 'readwrite');
    const request = tx.objectStore('jobs').get(id);
    request.onsuccess = () => {
      const job = request.result as Job;
      job.slots.title = {
        ...job.slots.title!,
        generation: 'generated',
        application: 'approved',
        value: 'Learn',
      };
      tx.objectStore('jobs').put(job);
    };
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, id);
  studioState.title = 'Manually changed source';
  await send(panel, { type: 'apply', jobIds: [id] });
  await expect(
    panel
      .getByRole('status')
      .filter({ hasText: /source, visibility or schedule changed/i }),
  ).toBeVisible();
  const review = await context.newPage();
  await review.goto(`chrome-extension://${extensionId}/review.html`);
  await expect(
    review
      .getByRole('article')
      .getByText(/source, visibility or schedule changed/i),
  ).toBeVisible();
  expect(studioState.saves).toBe(0);
  await expect(review.getByLabel('English title', { exact: true })).toHaveValue(
    'Learn',
  );
});

test('outside Studio has a usable empty state and narrow settings stay accessible in light and dark', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.setViewportSize({ width: 340, height: 850 });
  await expect(
    panel.getByRole('button', { name: 'Open YouTube Studio' }),
  ).toBeVisible();
  const pages = ['sidepanel.html', 'options.html', 'review.html'];
  for (const mode of ['light', 'dark'] as const)
    for (const page of pages) {
      await panel.emulateMedia({ colorScheme: mode });
      await panel.goto(`chrome-extension://${extensionId}/${page}`);
      await expect(panel.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await panel.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page: panel })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
});

test('thumbnail workflow uses approved words, caches a 1280×720 image, and uploads without claiming byte verification', async ({
  context,
  extensionId,
  studioState,
}) => {
  let submissions = 0;
  let polls = 0;
  await context.route('https://api.openai.com/v1/chat/completions', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Learn',
                description: '00:00 Introduction',
                thumbnailStrings: ['LEARN'],
              }),
            },
          },
        ],
      }),
    }),
  );
  await context.route('https://queue.fal.run/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      submissions++;
      const body = request.postDataJSON();
      expect(body.prompt).toContain('"from":"APRENDER","to":"LEARN"');
      expect(body.image_urls[0]).toMatch(/^data:image\/png;base64,/);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          request_id: 'fixture-receipt',
          status_url:
            'https://queue.fal.run/fal-ai/nano-banana-pro/requests/fixture-receipt/status',
          response_url:
            'https://queue.fal.run/fal-ai/nano-banana-pro/requests/fixture-receipt',
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/status')) {
      polls++;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        images: [{ url: 'https://v3.fal.media/fixture.png' }],
      }),
    });
  });
  await context.route('https://v3.fal.media/fixture.png', async (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: await readFile('tests/fixtures/thumbnail.png'),
    }),
  );
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() =>
    chrome.storage.session.set({
      credentials: { textKey: 'fixture-text-key', falKey: 'fixture-fal-key' },
    }),
  );
  const { panel, studio } = await openSelection(context, extensionId);
  await send(panel, {
    type: 'preferences',
    preferences: {
      channelId: CHANNEL,
      sourceLanguage: 'pt',
      targetLanguages: ['en'],
      components: ['thumbnail'],
      glossary: '',
    },
  });
  await send(panel, {
    type: 'preflight',
    channelId: CHANNEL,
    videoIds: [VIDEO],
  });
  await send(panel, {
    type: 'source-text',
    videoId: VIDEO,
    strings: ['APRENDER'],
  });
  const id = `${CHANNEL}/${VIDEO}/en`;
  await send(panel, { type: 'generate', jobIds: [id] });
  const review = await context.newPage();
  await review.goto(`chrome-extension://${extensionId}/review.html`);
  await expect(review.getByLabel('English thumbnail text 1')).toHaveValue(
    'LEARN',
  );
  expect(submissions).toBe(0);
  await review.getByLabel('Use these exact words in the image').check();
  await review
    .getByRole('button', { name: 'Generate missing', exact: true })
    .click();
  await expect(
    review.getByAltText('English generated thumbnail'),
  ).toBeVisible();
  expect(submissions).toBe(1);
  expect(polls).toBe(1);
  await review.getByLabel('Approved', { exact: true }).check();
  await studio.bringToFront();
  await send(review, { type: 'apply', jobIds: [id] });
  await expect.poll(() => studioState.translations.en?.thumbnail).toBe(true);
  await expect(
    review.getByText('Needs verification', { exact: true }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  expect(studioState.visibility).toBe(SCHEDULE);
  await send(review, {
    type: 'preflight',
    channelId: CHANNEL,
    videoIds: [VIDEO],
  });
  await expect(
    review.getByText('Needs verification', { exact: true }),
  ).toBeVisible();
});

test('thumbnail text extraction is cached across reopening the workspace without another paid request', async ({
  context,
  extensionId,
  studioState,
}) => {
  let requests = 0;
  await context.route('https://api.openai.com/v1/chat/completions', (route) => {
    requests++;
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          { message: { content: JSON.stringify({ strings: ['APRENDER'] }) } },
        ],
      }),
    });
  });
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() =>
    chrome.storage.session.set({
      credentials: { textKey: 'fixture-text-key', falKey: '' },
    }),
  );
  const { panel } = await openSelection(context, extensionId);
  await send(panel, {
    type: 'preferences',
    preferences: {
      channelId: CHANNEL,
      sourceLanguage: 'pt',
      targetLanguages: ['en'],
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
  await review
    .getByRole('button', { name: 'Read with AI · paid', exact: true })
    .click();
  await expect(
    review.getByLabel('Source thumbnail text for Aprender ao teu ritmo'),
  ).toHaveValue('APRENDER');
  await expect(
    review.getByRole('button', { name: 'Use saved extraction', exact: true }),
  ).toBeVisible();
  await review.reload();
  await review
    .getByRole('button', { name: 'Use saved extraction', exact: true })
    .click();
  await expect(
    review.getByLabel('Source thumbnail text for Aprender ao teu ritmo'),
  ).toHaveValue('APRENDER');
  expect(requests).toBe(1);
  expect(studioState.saves).toBe(0);
});

test('preflight requires a saved channel fallback when Studio does not declare a source language', async ({
  context,
  extensionId,
  studioState,
}) => {
  studioState.sourceLanguage = undefined;
  const { panel } = await openSelection(context, extensionId);
  await expect(
    send(panel, { type: 'preflight', channelId: CHANNEL, videoIds: [VIDEO] }),
  ).rejects.toThrow('Confirm the source language');
  const review = await context.newPage();
  await review.goto(`chrome-extension://${extensionId}/review.html`);
  await expect(
    review.getByText('Nothing to review yet', { exact: true }),
  ).toBeVisible();
  expect(studioState.saves).toBe(0);
});
