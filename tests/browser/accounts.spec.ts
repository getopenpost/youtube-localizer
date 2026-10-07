import {
  test,
  expect,
  CHANNEL,
  send,
  openSelection,
  studioHtml,
} from './fixture';
const OTHER_CHANNEL = 'UC1111111111111111111111';
const OTHER_VIDEO = 'lmnopqrstuv';
test('keeps channels and preferences separate and preserves observed account context on navigation', async ({
  context,
  extensionId,
  studioState,
}) => {
  const { studio, panel } = await openSelection(context, extensionId);
  await send(panel, {
    type: 'preferences',
    preferences: {
      channelId: CHANNEL,
      sourceLanguage: 'pt',
      targetLanguages: ['en'],
      components: ['title'],
      glossary: 'first',
    },
  });
  const other = {
    ...studioState,
    title: 'Second account video',
    translations: {},
    saves: 0,
  };
  await context.route('https://studio.youtube.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('authuser') !== '1') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      contentType: 'text/html',
      body: studioHtml(url.pathname, other, {
        channelId: OTHER_CHANNEL,
        channelName: 'Second channel',
        videoId: OTHER_VIDEO,
      }),
    });
  });
  const second = await context.newPage();
  await second.goto(
    `https://studio.youtube.com/channel/${OTHER_CHANNEL}/videos?authuser=1`,
  );
  await second.bringToFront();
  await panel
    .getByRole('button', { name: 'Refresh videos from Studio' })
    .click();
  await expect(
    panel.getByRole('heading', { name: 'Second channel' }),
  ).toBeVisible();
  await send(panel, {
    type: 'preferences',
    preferences: {
      channelId: OTHER_CHANNEL,
      sourceLanguage: 'pt',
      targetLanguages: ['es'],
      components: ['title'],
      glossary: 'second',
    },
  });
  await panel.getByLabel('YouTube account / channel').selectOption(CHANNEL);
  await expect(
    panel.getByRole('heading', { name: 'Fixture teacher' }),
  ).toBeVisible();
  await expect(panel.locator('.language-summary')).toContainText('English');
  await panel
    .getByLabel('YouTube account / channel')
    .selectOption(OTHER_CHANNEL);
  await expect(panel.locator('.language-summary')).toContainText('Spanish');
  await send(panel, {
    type: 'preflight',
    channelId: OTHER_CHANNEL,
    videoIds: [OTHER_VIDEO],
  });
  expect(new URL(second.url()).searchParams.get('authuser')).toBe('1');
  expect(studio.url()).toContain(`/channel/${CHANNEL}/videos`);
  const review = await context.newPage();
  await review.goto(`chrome-extension://${extensionId}/review.html`);
  await expect(
    review.getByRole('heading', { name: 'Second account video' }),
  ).toBeVisible();
  await second.goto(
    `https://studio.youtube.com/channel/${OTHER_CHANNEL}/videos?authuser=0`,
  );
  await expect(
    send(panel, {
      type: 'preflight',
      channelId: OTHER_CHANNEL,
      videoIds: [OTHER_VIDEO],
    }),
  ).rejects.toThrow('account changed');
  expect(studioState.saves).toBe(0);
  expect(other.saves).toBe(0);
});
