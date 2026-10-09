import {
  canonicalCode,
  codeFromName,
  languageName,
  studioCode,
} from '../core/languages';
import type {
  Component,
  Evidence,
  Snapshot,
  StudioContext,
  Video,
} from '../core/model';

const STUDIO_ORIGIN = 'https://studio.youtube.com';
const unknown = (): Evidence => ({ state: 'unknown' });
const text = (element: Element | null) => element?.textContent?.trim() ?? '';
const visible = (element: Element) =>
  !element.closest('[hidden],[aria-hidden="true"]') &&
  element.getBoundingClientRect().width > 0 &&
  element.getBoundingClientRect().height > 0;
export function all(
  selector: string,
  root: Document | Element = document,
): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(visible);
}
function button(label: string, root: Document | Element = document) {
  const found = all('button,[role="button"]', root).filter(
    (el) =>
      (el.getAttribute('aria-label') ?? text(el)) === label &&
      !el.querySelector('button,[role="button"]'),
  );
  if (found.length !== 1)
    throw new Error(
      `Studio’s ${label} control is unreadable. Check the working tab.`,
    );
  if (
    found[0].getAttribute('aria-disabled') === 'true' ||
    found[0].hasAttribute('disabled')
  )
    throw new Error(`Studio’s ${label} control is disabled.`);
  return found[0];
}
async function waitFor<T>(
  read: () => T | undefined,
  timeout = 12000,
): Promise<T> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(
    'Studio did not finish loading. Check the working tab, then retry.',
  );
}
export function channelIdentity(): { channelId: string; channelName: string } {
  const links = all(
    'ytcp-navigation-drawer a[href*="/channel/"], a#home-button[href*="/channel/"]',
  );
  const ids = new Set(
    links
      .map(
        (link) =>
          link.getAttribute('href')?.match(/\/channel\/(UC[\w-]{22})/)?.[1],
      )
      .filter((id): id is string => !!id),
  );
  const path = location.pathname.match(/\/channel\/(UC[\w-]{22})/)?.[1];
  if (path) ids.add(path);
  if (ids.size !== 1)
    throw new Error(
      'Cannot identify one channel. Open its Content page in Studio.',
    );
  const drawer = document.querySelector('ytcp-navigation-drawer');
  const name =
    text(drawer?.querySelector('#entity-name') ?? null) ||
    drawer?.querySelector('img')?.getAttribute('alt') ||
    'Your channel';
  return {
    channelId: [...ids][0],
    channelName: location.pathname.startsWith('/video/')
      ? 'Your channel'
      : name,
  };
}
function assertEnglish() {
  if (
    document.documentElement.lang &&
    !document.documentElement.lang.startsWith('en')
  )
    throw new Error(
      'This version supports Studio in English. Change Studio’s language to English and retry.',
    );
}
function assertScope(channel: string, video: string) {
  assertEnglish();
  if (
    location.origin !== STUDIO_ORIGIN ||
    channelIdentity().channelId !== channel ||
    location.pathname.split('/')[2] !== video
  )
    throw new Error(
      'The Studio account, channel or video changed. The batch has paused.',
    );
}
function classifyVisibility(value: string): Video['visibility'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('scheduled')) return 'scheduled';
  if (normalized.includes('unlisted')) return 'unlisted';
  if (normalized.includes('private')) return 'private';
  if (normalized.includes('public') || normalized.includes('published'))
    return 'published';
  return 'unknown';
}
export async function discover(): Promise<StudioContext> {
  assertEnglish();
  const identity = channelIdentity();
  const videoId = location.pathname.match(/^\/video\/([\w-]{11})\//)?.[1];
  if (videoId) {
    const drawer = document.querySelector('ytcp-navigation-drawer');
    const image = drawer?.querySelector<HTMLImageElement>('img');
    const title =
      text(drawer?.querySelector('#entity-name') ?? null) ||
      image?.alt.replace(/^Video thumbnail: /, '') ||
      'Current video';
    return {
      ...identity,
      scope: 'video',
      videos: [
        {
          ...identity,
          id: videoId,
          title: title.slice(0, 100),
          description: '',
          thumbnailUrl: image?.src,
          visibility: 'unknown',
          thumbnailTextApproved: false,
        },
      ],
    };
  }
  if (!location.pathname.includes('/videos'))
    throw new Error(
      'Open Studio’s Content page or an individual video to select videos.',
    );
  await waitFor(
    () =>
      document.querySelector('ytcp-video-row') ??
      (document.querySelector('ytcp-video-section-content') ? true : undefined),
  );
  const videos = all('ytcp-video-row').flatMap((row) => {
    const anchor = row.querySelector<HTMLAnchorElement>('a#video-title');
    const id = anchor
      ?.getAttribute('href')
      ?.match(/\/video\/([\w-]{11})\//)?.[1];
    if (!id || !anchor) return [];
    const visibility = classifyVisibility(
      text(row.querySelector('.tablecell-visibility')),
    );
    return [
      {
        ...identity,
        id,
        title: (anchor.getAttribute('aria-label') || text(anchor)).slice(
          0,
          100,
        ),
        description: '',
        thumbnailUrl: (() => {
          const image = row.querySelector<HTMLImageElement>(
            '#thumbnail-anchor img, ytcp-thumbnail img',
          );
          return (
            image?.currentSrc ||
            image?.src ||
            image?.getAttribute('data-src') ||
            undefined
          );
        })(),
        visibility,
        scheduledAt:
          visibility === 'scheduled'
            ? text(row.querySelector('.tablecell-date'))
            : undefined,
        thumbnailTextApproved: false,
      } satisfies Video,
    ];
  });
  return { ...identity, videos, scope: 'page' };
}
export async function readThumbnailContext(
  channel: string,
  videoId: string,
): Promise<Video> {
  assertScope(channel, videoId);
  const editor = await waitFor(
    () => document.querySelector('ytcp-video-metadata-editor') ?? undefined,
  );
  const titleBox = await waitFor(() =>
    all('[contenteditable="true"][role="textbox"],textarea', editor).find((e) =>
      (e.getAttribute('aria-label') ?? '').includes('Add a title'),
    ),
  );
  const descBox = all(
    '[contenteditable="true"][role="textbox"],textarea',
    editor,
  ).find((e) => (e.getAttribute('aria-label') ?? '').includes('Tell viewers'));
  if (!descBox) throw new Error('The source description is unreadable.');
  const value = (el: HTMLElement) =>
    el instanceof HTMLTextAreaElement ? el.value : el.innerText;
  const visibilityRoot = document.querySelector(
    'ytcp-video-metadata-visibility',
  );
  const visibilityLabel = text(visibilityRoot).replace(/\s+/g, ' ');
  const visibility = classifyVisibility(visibilityLabel);
  const scheduledAt = visibility === 'scheduled' ? visibilityLabel : undefined;
  const thumbnail = all(
    'ytcp-video-metadata-editor img,ytcp-navigation-drawer img',
  )
    .filter((el) => el instanceof HTMLImageElement && !!el.src)
    .map((el) => el as HTMLImageElement)
    .sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
  return {
    ...channelIdentity(),
    id: videoId,
    title: value(titleBox),
    description: value(descBox),
    thumbnailUrl: thumbnail?.src,
    visibility,
    scheduledAt,
    thumbnailTextApproved: false,
  };
}
export async function readDetails(
  channel: string,
  videoId: string,
): Promise<Video> {
  const video = await readThumbnailContext(channel, videoId);
  if (video.visibility === 'unknown')
    throw new Error(
      'Studio’s visibility or schedule is unreadable. Open the video details and retry.',
    );
  if (video.visibility === 'scheduled' && !/\d/.test(video.scheduledAt ?? ''))
    throw new Error('Could not read the schedule. No changes will be applied.');
  return video;
}
function translationsTable() {
  const table = document.querySelector<HTMLElement>(
    'ytgn-video-translations-list table[aria-label="Translations"],table#ytgn-video-translations-list-table',
  );
  if (!table || !visible(table)) return;
  const headings = all('[role="columnheader"]', table).map(text);
  if (
    !headings.includes('Title & description') ||
    !headings.includes('Thumbnail') ||
    !headings.includes('Language')
  )
    throw new Error(
      'Studio’s translations table has changed. No writes will be attempted.',
    );
  return table;
}
function languageRows(table: HTMLElement) {
  return all('[role="row"]', table).filter(
    (row) => all('[role="cell"]', row).length > 0,
  );
}
function rowLanguage(row: HTMLElement) {
  const cell = all('[role="cell"]', row)[0];
  const code =
    row.getAttribute('data-language-code') ||
    cell?.getAttribute('data-language-code');
  return code
    ? canonicalCode(code)
    : codeFromName(
        text(cell?.querySelector('.language-name') ?? cell ?? null).replace(
          /\s*\(video language\)\s*$/i,
          '',
        ),
      );
}
function columnCell(table: HTMLElement, row: HTMLElement, label: string) {
  const labels = all('[role="columnheader"]', table).map(text);
  const index = labels.indexOf(label);
  return all('[role="cell"]', row)[index];
}
function cellEvidence(cell: HTMLElement | undefined): Evidence {
  if (!cell) return unknown();
  const content = text(cell);
  const actions = all('button,[role="button"]', cell).map(
    (el) => el.getAttribute('aria-label') || text(el),
  );
  if (
    actions.some((label) =>
      /^Add(?: title| translation| thumbnail)?$/i.test(label),
    )
  )
    return { state: 'missing' };
  if (
    actions.some((label) => /^Edit\b/.test(label)) ||
    /\bPublished\b/.test(content) ||
    cell.querySelector('img[src]')
  )
    return { state: 'present' };
  // Drafts and processing are existing content too. Never replace them.
  if (/\bDraft\b|\bProcessing\b/.test(content)) return { state: 'present' };
  return unknown();
}
async function pickerOptions() {
  button('Add language').click();
  const options = await waitFor(() => {
    const found = all('[role="option"][test-id]');
    return found.length ? found : undefined;
  });
  const result = options.map((option) => ({
    code: canonicalCode(option.getAttribute('test-id')!),
    enabled: option.getAttribute('aria-disabled') !== 'true',
  }));
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
    }),
  );
  // Studio's text-menu close uses a click outside the menu in some versions.
  if (all('[role="option"][test-id]').length)
    document.querySelector<HTMLElement>('main h1')?.click();
  await waitFor(() =>
    all('[role="option"][test-id]').length === 0 ? true : undefined,
  );
  return result;
}
export async function readTranslations(
  channel: string,
  videoId: string,
  languages: string[],
): Promise<Omit<Snapshot, 'video'> & { sourceLanguage?: string }> {
  assertScope(channel, videoId);
  const table = await waitFor(translationsTable);
  if (all('[role="dialog"]', document).some((el) => !el.contains(table)))
    throw new Error(
      'Close the unexpected Studio dialog before checking translations.',
    );
  const rows = languageRows(table);
  const picker = await pickerOptions();
  assertScope(channel, videoId);
  const targets: Snapshot['targets'] = {};
  for (const language of languages) {
    const row = rows.find((r) => rowLanguage(r) === language);
    if (!row) {
      const available =
        picker.find((option) => option.code === language)?.enabled === true;
      targets[language] = {
        title: { state: available ? 'missing' : 'unknown' },
        description: { state: available ? 'missing' : 'unknown' },
        thumbnail: { state: available ? 'missing' : 'unknown' },
      };
      continue;
    }
    const metadata = cellEvidence(
      columnCell(table, row, 'Title & description'),
    );
    const saved =
      metadata.state === 'present'
        ? await new StudioWriter(async () => false).readText(
            channel,
            videoId,
            language,
          )
        : undefined;
    targets[language] = {
      title: saved
        ? {
            state: saved.title.trim() ? 'present' : 'missing',
            value: saved.title,
          }
        : metadata,
      description: saved
        ? {
            state: saved.description.trim() ? 'present' : 'missing',
            value: saved.description,
          }
        : { ...metadata },
      thumbnail: cellEvidence(columnCell(table, row, 'Thumbnail')),
    };
  }
  const heading = all('h2')
    .map(text)
    .find((value) => value.startsWith('Video language:'));
  const sourceLanguage = heading
    ? codeFromName(heading.replace(/^Video language:\s*/, ''))
    : undefined;
  return { targets, languages: picker.map((x) => x.code), sourceLanguage };
}
export interface WriteRequest {
  channelId: string;
  videoId: string;
  language: string;
  component: Component;
  value?: string;
  companionValue?: string;
  imageData?: string;
  expectedSource: { title: string; description: string };
  epoch: number;
}
export class StudioWriter {
  constructor(private readonly active: (epoch: number) => Promise<boolean>) {}
  private async guard(request: WriteRequest) {
    assertScope(request.channelId, request.videoId);
    if (document.visibilityState !== 'visible')
      throw new Error(
        'Keep the dedicated Studio working tab visible during application.',
      );
    if (!(await this.active(request.epoch)))
      throw new Error('Application paused before the next change.');
  }
  async apply(request: WriteRequest): Promise<Evidence> {
    await this.guard(request);
    const table = await waitFor(translationsTable);
    const current = await readTranslations(request.channelId, request.videoId, [
      request.language,
    ]);
    if (
      current.targets[request.language][request.component].state !== 'missing'
    )
      return current.targets[request.language][request.component];
    let row = languageRows(table).find(
      (r) => rowLanguage(r) === request.language,
    );
    if (!row) {
      await this.guard(request);
      button('Add language').click();
      const option = await waitFor(() =>
        all('[role="option"][test-id]').find(
          (e) => e.getAttribute('test-id') === studioCode(request.language),
        ),
      );
      if (option.getAttribute('aria-disabled') === 'true')
        throw new Error(
          `${languageName(request.language)} is unavailable in Studio.`,
        );
      await this.guard(request);
      option.click();
      row = await waitFor(() =>
        languageRows(table).find((r) => rowLanguage(r) === request.language),
      );
    }
    const cell = columnCell(
      table,
      row,
      request.component === 'thumbnail' ? 'Thumbnail' : 'Title & description',
    );
    if (
      !cell ||
      (request.component === 'thumbnail' &&
        cellEvidence(cell).state !== 'missing')
    )
      return cellEvidence(cell);
    await this.guard(request);
    const add = all('button,[role="button"]', cell).filter((el) =>
      (request.component === 'thumbnail' ? /^Add\b/ : /^(Add|Edit)\b/).test(
        el.getAttribute('aria-label') || text(el),
      ),
    );
    if (add.length !== 1)
      throw new Error('Could not identify the missing translation control.');
    add[0].click();
    const dialog = await waitFor(() => {
      const dialogs = all('[role="dialog"]');
      return dialogs.length === 1 ? dialogs[0] : undefined;
    });
    if (request.component === 'thumbnail')
      return this.uploadThumbnail(dialog, request);
    return this.writeMetadata(dialog, request);
  }
  private async writeMetadata(
    dialog: HTMLElement,
    request: WriteRequest,
  ): Promise<Evidence> {
    const fields = all(
      'textarea,input:not([type="file"]),[contenteditable="true"]',
      dialog,
    );
    const title = fields.find((el) =>
      /translated title|title.*translation|Enter translated title/i.test(
        el.getAttribute('aria-label') || el.getAttribute('placeholder') || '',
      ),
    );
    const description = fields.find((el) =>
      /translated description|description.*translation|Enter translated description/i.test(
        el.getAttribute('aria-label') || el.getAttribute('placeholder') || '',
      ),
    );
    if (!title || !description)
      throw new Error(
        'Studio’s translated title and description fields are unreadable. Close the dialog and retry.',
      );
    const field = request.component === 'title' ? title : description;
    const read = (el: HTMLElement) =>
      el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
        ? el.value
        : el.innerText;
    if (read(field).trim())
      throw new Error('This translation now exists. It has been preserved.');
    if (
      (request.component === 'title' && (request.value?.length ?? 0) > 100) ||
      (request.component === 'description' &&
        (request.value?.length ?? 0) > 5000)
    )
      throw new Error('The translation exceeds YouTube’s field limit.');
    if (!request.value?.trim())
      throw new Error('Approve nonempty translation text before application.');
    await this.guard(request);
    const fill = (target: HTMLElement, value: string) => {
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement
      ) {
        const prototype =
          target instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(
          target,
          value,
        );
      } else target.textContent = value;
      target.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: value,
        }),
      );
      target.dispatchEvent(new Event('change', { bubbles: true }));
    };
    fill(field, request.value);
    const companion = request.component === 'title' ? description : title;
    if (request.companionValue?.trim() && !read(companion).trim()) {
      await this.guard(request);
      fill(companion, request.companionValue);
    }
    await this.guard(request);
    const publish = all('button,[role="button"]', dialog).filter(
      (el) =>
        ['Publish', 'Save'].includes(
          el.getAttribute('aria-label') || text(el),
        ) && !el.querySelector('button,[role="button"]'),
    );
    if (
      publish.length !== 1 ||
      publish[0].getAttribute('aria-disabled') === 'true' ||
      publish[0].hasAttribute('disabled')
    )
      throw new Error(
        'Studio’s translation save control is unreadable or disabled.',
      );
    await this.guard(request);
    publish[0].click();
    await waitFor(() => (visible(dialog) ? undefined : true));
    return { state: 'present', value: request.value };
  }
  private async uploadThumbnail(
    dialog: HTMLElement,
    request: WriteRequest,
  ): Promise<Evidence> {
    if (!/thumbnail/i.test(text(dialog)))
      throw new Error(
        'The thumbnail dialog is unreadable. No file was uploaded.',
      );
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input || !request.imageData?.startsWith('data:image/jpeg;base64,'))
      throw new Error(
        'The thumbnail upload control or prepared JPEG is unavailable.',
      );
    const bytes = Uint8Array.from(atob(request.imageData.split(',')[1]), (c) =>
      c.charCodeAt(0),
    );
    if (bytes.length > 2 * 1024 * 1024)
      throw new Error('The thumbnail is above YouTube’s upload limit.');
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([bytes], `${request.language}.jpg`, { type: 'image/jpeg' }),
    );
    await this.guard(request);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const save = await waitFor(() => {
      const found = all('button,[role="button"]', dialog).filter(
        (e) =>
          ['Save', 'Publish', 'Done'].includes(
            e.getAttribute('aria-label') || text(e),
          ) &&
          !e.querySelector('button,[role="button"]') &&
          !e.hasAttribute('disabled') &&
          e.getAttribute('aria-disabled') !== 'true',
      );
      return found.length === 1 ? found[0] : undefined;
    });
    await this.guard(request);
    save.click();
    await waitFor(() => (visible(dialog) ? undefined : true));
    return { state: 'present' };
  }
  async readText(
    channel: string,
    video: string,
    language: string,
  ): Promise<{ title: string; description: string } | undefined> {
    assertScope(channel, video);
    const table = await waitFor(translationsTable);
    const row = languageRows(table).find((r) => rowLanguage(r) === language);
    if (!row) return;
    const cell = columnCell(table, row, 'Title & description');
    if (!cell) return;
    const edit = all('button,[role="button"]', cell).filter((el) =>
      /^Edit\b/.test(el.getAttribute('aria-label') || text(el)),
    );
    if (edit.length !== 1) return;
    edit[0].click();
    const dialog = await waitFor(() =>
      all('[role="dialog"]').find((e) => /title|description/i.test(text(e))),
    );
    const fields = all(
      'textarea,input:not([type="file"]),[contenteditable="true"]',
      dialog,
    );
    const find = (pattern: RegExp) =>
      fields.find((el) =>
        pattern.test(
          el.getAttribute('aria-label') || el.getAttribute('placeholder') || '',
        ),
      );
    const title = find(/translated title|title.*translation/i),
      description = find(/translated description|description.*translation/i);
    const read = (el: HTMLElement) =>
      el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
        ? el.value
        : el.innerText;
    const result =
      title && description
        ? { title: read(title), description: read(description) }
        : undefined;
    const close = all('button,[role="button"]', dialog).find((el) =>
      ['Close', 'Cancel'].includes(el.getAttribute('aria-label') || text(el)),
    );
    if (!close)
      throw new Error('Close the translation dialog before continuing.');
    close.click();
    await waitFor(() => (visible(dialog) ? undefined : true));
    return result;
  }
}
