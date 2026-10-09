import { mkdir } from 'node:fs/promises';
import { test, expect, openSelection } from './fixture';

test('Settings Save persists the connection and reports success or denied permissions', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await page.getByLabel('API key', { exact: true }).fill('fixture-text-key');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('API key', { exact: true })).toHaveAttribute(
    'placeholder',
    'Saved. Leave blank to keep.',
  );
  await page.evaluate(() => {
    chrome.permissions.request = async () => false;
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText('Provider access was declined.', { exact: true }).first(),
  ).toBeVisible();
  await page.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await page.getByLabel('Remember keys on this device').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  // An extension reload or browser restart clears storage.session.
  await page.evaluate(() => chrome.storage.session.remove('credentials'));
  await page.reload();
  await expect(page.getByLabel('API key', { exact: true })).toHaveAttribute(
    'placeholder',
    'Saved. Leave blank to keep.',
  );
  await expect(page.getByLabel('Remember keys on this device')).toBeChecked();
  await page.getByText('Backup & keys', { exact: true }).click();
  await page.getByLabel('API key', { exact: true }).fill('fixture-unsaved-key');
  await page.getByRole('button', { name: 'Forget keys', exact: true }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await page.reload();
  await expect(page.getByLabel('API key', { exact: true })).toHaveAttribute(
    'placeholder',
    'Paste your API key',
  );
});

test('Custom endpoint is editable in setup and OpenRouter preconfigures the saved connection', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await page.getByLabel('Text provider').selectOption('custom');
  await expect(page.getByLabel('Base URL')).toBeVisible();
  await page.getByLabel('Base URL').fill('https://custom.example/v1');
  await page.getByLabel('API key', { exact: true }).fill('fixture-custom-key');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Base URL')).toHaveValue(
    'https://custom.example/v1',
  );
  await page.getByLabel('Text provider').selectOption('openrouter');
  await expect(page.getByLabel('Text model', { exact: true })).toHaveValue(
    'openai/gpt-4.1-mini',
  );
  await page
    .getByLabel('API key', { exact: true })
    .fill('fixture-openrouter-key');
  await page.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Text provider')).toHaveValue('openrouter');
  const result = await page.evaluate(async () => {
    const request = indexedDB.open('youtube-localizer', 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const value = await new Promise<{ provider: { baseUrl: string } }>(
      (resolve) => {
        const r = db.transaction('meta').objectStore('meta').get('settings');
        r.onsuccess = () => resolve(r.result);
      },
    );
    db.close();
    return value.provider.baseUrl;
  });
  expect(result).toBe('https://openrouter.ai/api/v1');
  await expect(
    page.getByRole('combobox', { name: /^Thumbnails/ }),
  ).toContainText('Ideogram 4.5 Edit');
  await expect(page.getByLabel('Fal key')).toBeVisible();
  await mkdir('.impeccable/review', { recursive: true });
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    animations: 'disabled',
    path: '.impeccable/review/settings-desktop.png',
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme-scheme',
    'dark',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: 'disabled',
    path: '.impeccable/review/settings-mobile-dark.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('invalid language preferences cannot partially save the connection, while valid channel choices persist', async ({
  context,
  extensionId,
  studioState,
}) => {
  void studioState;
  await openSelection(context, extensionId);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByLabel('Source language')).toBeVisible();
  await page.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await page.getByRole('checkbox', { name: /^titles$/i }).uncheck();
  await page.getByRole('checkbox', { name: /^descriptions$/i }).uncheck();
  await page.getByLabel('Text model', { exact: true }).fill('do-not-save');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('region', { name: /Notifications/ }),
  ).toContainText(/component/i);
  await page.reload();
  await expect(page.getByLabel('Text model', { exact: true })).toHaveValue(
    'gpt-4.1-mini',
  );
  await page.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await page
    .getByRole('button', { name: 'Remove Spanish', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Remove French', exact: true })
    .click();
  await page.getByLabel('Search target languages').fill('German');
  await page.getByRole('checkbox', { name: 'German', exact: true }).check();
  await page.getByRole('checkbox', { name: /^thumbnails$/i }).check();
  await page
    .getByRole('combobox', { name: /^Thumbnails/ })
    .selectOption('ideogram/v4.5/edit');
  await page.getByLabel('API key', { exact: true }).fill('fixture-text');
  await page.getByLabel('Fal key').fill('fixture-fal');
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByLabel('Translation notes').fill('Keep OpenPost unchanged.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Remove German', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove Spanish', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: /^thumbnails$/i }),
  ).toBeChecked();
  await expect(page.getByRole('combobox', { name: /^Thumbnails/ })).toHaveValue(
    'ideogram/v4.5/edit',
  );
  await page.getByText('Advanced', { exact: true }).click();
  await expect(page.getByLabel('Translation notes')).toHaveValue(
    'Keep OpenPost unchanged.',
  );
});
