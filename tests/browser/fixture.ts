import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  expect,
} from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
export const CHANNEL = 'UC0000000000000000000000';
export const VIDEO = 'abcdefghijk';
export const SCHEDULE = 'Scheduled Oct 12, 2030 at 18:00';
export interface StudioState {
  sourceLanguage?: string;
  translations: Record<
    string,
    { title: string; description: string; thumbnail: boolean }
  >;
  visibility: string;
  title: string;
  description: string;
  saves: number;
}
export function studioHtml(
  path: string,
  state: StudioState,
  account = {
    channelId: CHANNEL,
    channelName: 'Fixture teacher',
    videoId: VIDEO,
  },
) {
  const content = path.includes('/channel/');
  const details = path.endsWith('/edit');
  const escaped = (s: string) =>
    s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('"', '&quot;');
  const thumbnail =
    '<img src="https://i9.ytimg.com/vi/abcdefghijk/custom.png?fixture-auth=1" alt="Current thumbnail" width="1280" height="720" />';
  const navigation = `<ytcp-navigation-drawer><a href="/channel/${account.channelId}/videos">Channel content</a><div id="entity-name">${escaped(account.channelName)}</div></ytcp-navigation-drawer>`;
  const script = `<script>
  const persisted=${JSON.stringify(state.translations)};
  const table=document.querySelector('table');
  const send=()=>fetch('https://studio.youtube.com/fixture-save',{method:'POST',body:JSON.stringify(persisted)});
  function action(label,fn){const button=document.createElement('button');button.textContent=label;button.onclick=fn;return button;}
  function dialog(language,kind,edit=false){const d=document.createElement('div');d.setAttribute('role','dialog');d.innerHTML=kind==='thumbnail'?'<h2>Thumbnail translation</h2><input type="file" accept="image/jpeg"/>':'<h2>Title and description translation</h2><textarea aria-label="Enter translated title"></textarea><textarea aria-label="Enter translated description"></textarea>';document.body.append(d);if(kind!=='thumbnail'){d.querySelectorAll('textarea')[0].value=persisted[language].title;d.querySelectorAll('textarea')[1].value=persisted[language].description;}d.append(action(edit?'Save':'Publish',async()=>{if(kind==='thumbnail')persisted[language].thumbnail=!!d.querySelector('input').files.length;else{persisted[language].title=d.querySelectorAll('textarea')[0].value;persisted[language].description=d.querySelectorAll('textarea')[1].value;}await send();d.remove();render();}));d.append(action('Close',()=>d.remove()));}
  function render(){if(!table)return;table.querySelector('tbody').innerHTML='';for(const [language,translation] of Object.entries(persisted)){const row=document.createElement('tr');row.setAttribute('role','row');row.setAttribute('data-language-code',language);for(let i=0;i<5;i++){const cell=document.createElement('td');cell.setAttribute('role','cell');row.append(cell);}row.children[0].textContent=language==='en'?'English':language==='fr'?'French':'Spanish';row.children[1].textContent='Audio untouched';row.children[2].textContent='Subtitles untouched';row.children[3].append(action(translation.title||translation.description?'Edit':'Add',()=>dialog(language,'metadata',!!(translation.title||translation.description))));row.children[4].append(action(translation.thumbnail?'Edit thumbnail':'Add',()=>dialog(language,'thumbnail',translation.thumbnail)));table.querySelector('tbody').append(row);}}
  document.querySelector('#add-language')?.addEventListener('click',()=>{const picker=document.createElement('div');picker.setAttribute('role','dialog');const list=document.createElement('div');list.setAttribute('role','listbox');for(const [code,name] of [['pt','Portuguese'],['en','English'],['fr','French'],['es','Spanish'],['de','German'],['ar','Arabic']]){const opt=document.createElement('button');opt.setAttribute('role','option');opt.setAttribute('test-id',code);opt.setAttribute('aria-disabled',code==='pt'||!!persisted[code]?'true':'false');opt.textContent=name;opt.onclick=()=>{persisted[code]={title:'',description:'',thumbnail:false};picker.remove();render();};list.append(opt);}picker.append(list);document.body.append(picker);const dismiss=e=>{if(e.key==='Escape'){picker.remove();document.removeEventListener('keydown',dismiss);}};document.addEventListener('keydown',dismiss);});render();
  </script>`;
  const body = content
    ? `<main><h1>Channel content</h1><ytcp-video-section-content><ytcp-video-row><a id="video-title" href="/video/${account.videoId}/edit" aria-label="${escaped(state.title)}">${escaped(state.title)}</a><div class="tablecell-visibility">Scheduled</div><div class="tablecell-date">Oct 12, 2030</div></ytcp-video-row></ytcp-video-section-content></main>`
    : details
      ? `<main><h1>Video details</h1><ytcp-video-metadata-editor><div role="textbox" contenteditable="true" aria-label="Add a title that describes your video">${escaped(state.title)}</div><div role="textbox" contenteditable="true" aria-label="Tell viewers about your video">${escaped(state.description)}</div><ytcp-video-thumbnail-editor><div id="autogen-thumb-label">Thumbnail</div>${thumbnail}</ytcp-video-thumbnail-editor></ytcp-video-metadata-editor><ytcp-video-metadata-visibility>${escaped(state.visibility)}</ytcp-video-metadata-visibility></main>`
      : `<main><h1>Languages</h1><h2>Video language: ${state.sourceLanguage ?? 'Not set'}</h2><button id="add-language">Add language</button><ytgn-video-translations-list><table id="ytgn-video-translations-list-table" aria-label="Translations"><thead><tr role="row">${['Language', 'Audio', 'Subtitles', 'Title & description', 'Thumbnail'].map((label) => `<th role="columnheader">${label}</th>`).join('')}</tr></thead><tbody></tbody></table></ytgn-video-translations-list></main>`;
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><style>body{font:16px sans-serif}ytcp-navigation-drawer,ytcp-video-row,ytcp-video-metadata-editor,ytcp-video-metadata-visibility,ytgn-video-translations-list{display:block}button{margin:8px}table{width:100%}td,th{padding:12px}[role=dialog]{position:fixed;inset:20%;background:white;border:1px solid black;padding:24px}textarea{display:block;width:90%;height:80px}</style></head><body>${navigation}${body}${script}</body></html>`;
}
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  studioState: StudioState;
}>({
  context: async ({ browserName }, use) => {
    if (browserName !== 'chromium')
      throw new Error('Extension tests require Chromium.');
    const profile = await mkdtemp(join(tmpdir(), 'localizer-test-'));
    const path = resolve('dist');
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
    });
    await use(context);
    await context.close();
    await rm(profile, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    await use(worker.url().split('/')[2]);
  },
  studioState: async ({ context }, use) => {
    const state: StudioState = {
      translations: {
        fr: {
          title: 'Traduction manuelle',
          description: 'À préserver',
          thumbnail: false,
        },
      },
      sourceLanguage: 'Portuguese',
      visibility: SCHEDULE,
      title: 'Aprender ao teu ritmo',
      description: '00:00 Introdução',
      saves: 0,
    };
    await context.route('https://i9.ytimg.com/**', async (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: await readFile(resolve('tests/fixtures/thumbnail.png')),
      }),
    );
    await context.route('https://studio.youtube.com/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/fixture-save') {
        state.translations = JSON.parse(route.request().postData()!);
        state.saves++;
        await route.fulfill({ status: 200, body: '{}' });
        return;
      }
      await route.fulfill({
        contentType: 'text/html',
        body: studioHtml(url.pathname, state),
      });
    });
    await use(state);
  },
});
export { expect };
export async function send<T>(page: Page, message: unknown): Promise<T> {
  const result = await page.evaluate(
    async (value) => chrome.runtime.sendMessage(value),
    message,
  );
  if (!result?.ok) throw new Error(result?.error ?? 'Command did not respond.');
  return result.data as T;
}
export async function openSelection(context: BrowserContext, id: string) {
  const studio = await context.newPage();
  await studio.goto(`https://studio.youtube.com/channel/${CHANNEL}/videos`);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await studio.bringToFront();
  await panel
    .getByRole('button', { name: 'Read current Studio page' })
    .or(panel.getByRole('button', { name: 'Refresh videos from Studio' }))
    .click();
  await expect(
    panel.getByRole('heading', { name: 'Fixture teacher', exact: true }),
  ).toBeVisible();
  // Resume an existing working tab: Chrome-created tabs can navigate before Playwright attaches interception.
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async (channel) => {
    const tab = (await chrome.tabs.query({})).find(
      (tab) =>
        tab.url === `https://studio.youtube.com/channel/${channel}/videos`,
    )!;
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('youtube-localizer', 1);
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(
      {
        mode: 'paused',
        epoch: 0,
        requestsUsed: 0,
        requestLimit: 30,
        jobIds: [],
        reason: '',
        workingTabId: tab.id,
        channelId: channel,
      },
      'run',
    );
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, CHANNEL);
  return { studio, panel };
}
