import { readFile, mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, CHANNEL, VIDEO, SCHEDULE, send } from './fixture';
test('Studio launches a video-aware composer, references stay local until selected generation, and variants survive reopening', async ({
  context,
  extensionId,
  studioState,
}) => {
  let edits = 0,
    generations = 0;
  const image = (await readFile('tests/fixtures/thumbnail.png')).toString(
    'base64',
  );
  await context.route('https://api.openai.com/v1/images/**', async (route) => {
    expect(route.request().headers().authorization).toBe(
      'Bearer fixture-image-key',
    );
    if (route.request().url().endsWith('/edits')) {
      edits++;
      const body = route.request().postData()!;
      expect(body).toContain('gpt-image-2.5-sunburst');
      expect(body).toContain('"name":"Face","role":"person"');
      expect(body).toContain(studioState.title);
      expect(body).not.toContain('"name":"Brand"');
      expect(body.match(/filename="reference-/g)).toHaveLength(1);
      await route.fulfill({
        contentType: 'text/event-stream',
        headers: { 'x-request-id': 'creation-edit' },
        body: `event: image_edit.completed\ndata: ${JSON.stringify({ type: 'image_edit.completed', b64_json: image })}\n\n`,
      });
    } else {
      generations++;
      expect(route.request().url()).toBe(
        'https://api.openai.com/v1/images/generations',
      );
      const body = route.request().postDataJSON();
      expect(body.model).toBe('gpt-image-2.5-sunburst');
      expect(body.size).toBe('1280x720');
      expect(body.prompt).toContain('00:00 Introdução');
      await route.fulfill({
        contentType: 'text/event-stream',
        body: `event: image_generation.completed\ndata: ${JSON.stringify({ type: 'image_generation.completed', b64_json: image })}\n\n`,
      });
    }
  });
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() =>
    chrome.storage.session.set({
      credentials: { imageKey: 'fixture-image-key', textKey: '', falKey: '' },
    }),
  );
  const studio = await context.newPage();
  await studio.goto(
    `https://studio.youtube.com/video/${VIDEO}/edit?authuser=1`,
  );
  await expect(
    studio.getByRole('button', { name: 'Generate', exact: true }),
  ).toHaveCount(1);
  const created = context.waitForEvent('page');
  await studio.getByRole('button', { name: 'Generate', exact: true }).click();
  const composer = await created;
  await composer.waitForURL(
    `chrome-extension://${extensionId}/thumbnail.html?video=${VIDEO}&channel=${CHANNEL}`,
  );
  await expect(
    composer.getByRole('heading', { name: studioState.title }),
  ).toBeVisible();
  await composer.getByText('Video context', { exact: true }).click();
  await expect(
    composer.getByText('00:00 Introdução', { exact: true }),
  ).toBeVisible();
  // Native Chrome permission dialogs are outside the DOM fixture. Simulate the user's grant.
  await composer.evaluate(() => {
    chrome.permissions.request = async (permissions) => {
      if (
        JSON.stringify(permissions.origins) !==
        JSON.stringify(['https://api.openai.com/*'])
      )
        throw new Error('Unexpected image-provider permission.');
      return true;
    };
  });
  const png = await readFile('tests/fixtures/thumbnail.png');
  await composer.getByLabel('Add reference images').setInputFiles([
    { name: 'Face.png', mimeType: 'image/png', buffer: png },
    { name: 'Brand.png', mimeType: 'image/png', buffer: png },
  ]);
  await expect(composer.getByLabel('Use reference Face')).toBeChecked();
  await expect(composer.getByLabel('Use reference Brand')).toBeChecked();
  expect(edits).toBe(0);
  expect(generations).toBe(0);
  await composer.getByLabel('Use reference Brand').uncheck();
  await composer
    .getByLabel('What should it look like?')
    .fill('Show me beside a bright learning diagram. Headline: APRENDER.');
  await composer.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(
    composer.getByAltText(`Generated thumbnail for ${studioState.title}`),
  ).toBeVisible();
  expect(edits).toBe(1);
  expect(generations).toBe(0);
  await composer.reload();
  await composer.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await expect(composer.getByLabel('What should it look like?')).toHaveValue(
    'Show me beside a bright learning diagram. Headline: APRENDER.',
  );
  await expect(composer.getByLabel('Use reference Face')).toBeChecked();
  await expect(
    composer.getByAltText(`Generated thumbnail for ${studioState.title}`),
  ).toBeVisible();
  expect(edits).toBe(1);
  const received = composer.waitForEvent('download');
  await composer.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await received).suggestedFilename()).toBe(`${VIDEO}-thumbnail.jpg`);
  await composer.getByLabel('Use reference Face').uncheck();
  await composer.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(
    composer.getByRole('button', { name: /View thumbnail from/ }),
  ).toHaveCount(2);
  expect(generations).toBe(1);
  expect(edits).toBe(1);
  await composer
    .getByRole('button', { name: 'Use for localization', exact: true })
    .click();
  await expect(
    composer.getByRole('button', { name: 'Selected for localization' }),
  ).toBeVisible();
  expect(studioState.saves).toBe(0);
  expect(studioState.visibility).toBe(SCHEDULE);
  await composer.getByText('Manage references', { exact: true }).click();
  await composer
    .getByRole('button', { name: 'Remove reference Brand', exact: true })
    .click();
  await expect(composer.getByLabel('Use reference Brand')).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page: composer })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await mkdir('.impeccable/review', { recursive: true });
  await composer.setViewportSize({ width: 1440, height: 900 });
  await composer.screenshot({
    path: '.impeccable/review/composer-desktop.png',
    fullPage: true,
  });
  await composer.emulateMedia({ colorScheme: 'dark' });
  await composer.setViewportSize({ width: 390, height: 844 });
  await composer.screenshot({
    path: '.impeccable/review/composer-mobile-dark.png',
    fullPage: true,
  });
  expect(
    await composer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await studio.goto(
    `https://studio.youtube.com/video/${VIDEO}/translations?authuser=1`,
  );
  await expect(
    studio.getByRole('button', { name: 'Generate', exact: true }),
  ).toHaveCount(0);
  expect(new URL(studio.url()).searchParams.get('authuser')).toBe('1');
});

test('an ambiguous thumbnail request requires acknowledgment before another paid generation', async ({
  context,
  studioState,
}) => {
  const studio = await context.newPage();
  await studio.goto(`https://studio.youtube.com/video/${VIDEO}/edit`);
  const created = context.waitForEvent('page');
  await studio.getByRole('button', { name: 'Generate', exact: true }).click();
  const composer = await created;
  await composer.waitForURL(/thumbnail.html/);
  await composer.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('youtube-localizer', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const video = await new Promise<unknown>((resolve) => {
      const r = db
        .transaction('videos')
        .objectStore('videos')
        .get('abcdefghijk');
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(
      {
        id: '22222222-2222-4222-8222-222222222222',
        video,
        prompt: 'Interrupted fixture',
        references: [],
        model: 'gpt-image-2.5-sunburst',
        quality: 'auto',
        state: 'ambiguous',
        requestId: 'paid-fixture',
        createdAt: Date.now(),
      },
      'creation:22222222-2222-4222-8222-222222222222',
    );
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await composer.reload();
  await expect(
    composer.getByRole('button', { name: 'Generate', exact: true }),
  ).toBeDisabled();
  await expect(
    send(composer, {
      type: 'thumbnail-generate',
      id: '33333333-3333-4333-8333-333333333333',
      videoId: VIDEO,
      prompt: 'Try again',
      referenceIds: [],
      useCurrent: false,
      acknowledged: false,
    }),
  ).rejects.toThrow('possible second charge');
  expect(studioState.saves).toBe(0);
});
