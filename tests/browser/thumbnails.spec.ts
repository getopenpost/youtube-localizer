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
  const image = await readFile('tests/fixtures/thumbnail.png');
  await context.route('https://v3.fal.media/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: image }),
  );
  await context.route('https://queue.fal.run/**', async (route) => {
    const url = route.request().url();
    expect(route.request().headers().authorization).toBe('Key fixture-fal-key');
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (url.endsWith('/edit')) {
        edits++;
        expect(url).toBe(
          'https://queue.fal.run/openai/gpt-image-2.5/sunburst/edit',
        );
        expect(body.prompt).toContain('"name":"Face","role":"person"');
        expect(body.prompt).toContain(studioState.title);
        expect(body.prompt).not.toContain('"name":"Brand"');
        expect(body.image_urls).toHaveLength(1);
      } else {
        generations++;
        expect(url).toBe(
          'https://queue.fal.run/openai/gpt-image-2.5/sunburst/text-to-image',
        );
        expect(body.image_size).toEqual({ width: 1280, height: 720 });
        expect(body.prompt).toContain('00:00 Introdução');
      }
      const id = 'creation-' + (edits + generations);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          request_id: id,
          status_url:
            'https://queue.fal.run/openai/gpt-image-2.5/requests/' +
            id +
            '/status',
          response_url:
            'https://queue.fal.run/openai/gpt-image-2.5/requests/' + id,
        }),
      });
    } else {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          url.endsWith('/status')
            ? { status: 'COMPLETED' }
            : { images: [{ url: 'https://v3.fal.media/created.png' }] },
        ),
      });
    }
  });
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() =>
    chrome.storage.session.set({
      credentials: { textKey: '', falKey: 'fixture-fal-key' },
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
  // Native Chrome permission dialogs are outside the DOM fixture. Simulate the user's grant.
  await composer.evaluate(() => {
    chrome.permissions.request = async (permissions) => {
      if (
        JSON.stringify(permissions.origins) !==
        JSON.stringify([
          'https://queue.fal.run/*',
          'https://*.fal.media/*',
          'https://storage.googleapis.com/*',
        ])
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
  await expect(composer.getByLabel('Name for Brand')).toHaveValue('Brand');
  await composer.getByLabel('Name for Brand').fill('Channel brand');
  await composer.getByLabel('Role for Brand').click();
  await expect(composer.getByLabel('Name for Channel brand')).toHaveValue(
    'Channel brand',
  );
  await composer.getByLabel('Role for Channel brand').selectOption('style');
  await composer.reload();
  await composer.getByText('Manage references', { exact: true }).click();
  await expect(composer.getByLabel('Name for Channel brand')).toHaveValue(
    'Channel brand',
  );
  await expect(composer.getByLabel('Role for Channel brand')).toHaveValue(
    'style',
  );
  await composer
    .getByRole('button', {
      name: 'Remove reference Channel brand',
      exact: true,
    })
    .click();
  await expect(composer.getByLabel('Use reference Channel brand')).toHaveCount(
    0,
  );
  expect(
    (
      await new AxeBuilder({ page: composer })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await mkdir('.impeccable/review', { recursive: true });
  await expect(
    composer.getByRole('button', { name: 'Generate', exact: true }),
  ).toBeEnabled();
  await composer.setViewportSize({ width: 1440, height: 900 });
  await composer.screenshot({
    animations: 'disabled',
    path: '.impeccable/review/composer-desktop.png',
    fullPage: true,
  });
  await composer.emulateMedia({ colorScheme: 'dark' });
  await expect(composer.locator('html')).toHaveAttribute(
    'data-theme-scheme',
    'dark',
  );
  await composer.setViewportSize({ width: 390, height: 844 });
  await composer.screenshot({
    animations: 'disabled',
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
