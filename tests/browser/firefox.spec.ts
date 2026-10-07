import { test, expect } from '@playwright/test';
import { mkdtemp, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchFirefox } from './firefox';
test('Firefox native options, private credentials and local DOM composition work in the installed package', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'localizer-firefox-'));
  const addon = join(dir, 'addon');
  await cp('dist-firefox', addon, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(addon, 'manifest.json'), 'utf8'),
  );
  manifest.host_permissions.push('https://api.openai.com/*');
  await writeFile(join(addon, 'manifest.json'), JSON.stringify(manifest));
  const { context, debuggerApi, background, target } = await launchFirefox(
    join(dir, 'profile'),
    addon,
  );
  try {
    const bg = (text: string) =>
      debuggerApi.evaluate(background.consoleActor, text);
    await bg(
      "browser.tabs.create({url:browser.runtime.getURL('options.html')})",
    );
    const options = await target('options.html');
    const evaluate = (text: string) =>
      debuggerApi.evaluate(options.consoleActor, text);
    await expect
      .poll(() =>
        evaluate(
          "JSON.stringify({title:document.querySelector('h1')?.textContent,theme:document.documentElement.dataset.themeId,session:typeof browser.storage.session})",
        ),
      )
      .toBe(
        JSON.stringify({
          title: 'Settings',
          theme: 'dither',
          session: 'object',
        }),
      );
    const keys = await evaluate(
      `(async()=>{const driver=await import(browser.runtime.getURL('credentials.js'));await driver.saveCredentials({textKey:'fixture-firefox-key',imageKey:'',falKey:''},true);await browser.storage.session.remove('credentials');const loaded=await driver.credentials();const local=await browser.storage.local.get('credentials');await driver.forgetCredentials();return JSON.stringify({textKey:loaded.textKey,local:local.credentials??null,cleared:(await driver.credentials()).textKey})})()`,
    );
    expect(JSON.parse(String(keys))).toEqual({
      textKey: 'fixture-firefox-key',
      local: null,
      cleared: '',
    });
    const composed = await bg(
      `(async()=>{const inspect=await import(browser.runtime.getURL('layer-inspect.js'));const render=await import(browser.runtime.getURL('layer-render.js'));const layers=await inspect.inspectOverlay('<div style="position:absolute;left:20px;top:20px;width:600px;height:140px;font-size:84px;font-family:Geist">HELLO</div>',1280,720);const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;canvas.getContext('2d').fillRect(0,0,1280,720);const source=await new Promise(r=>canvas.toBlob(r));const output=await render.compose(source,1280,720,layers,['HALLO'],'de');const image=await createImageBitmap(output);return JSON.stringify({text:layers[0].text,width:image.width,height:image.height,type:output.type})})()`,
    );
    expect(JSON.parse(String(composed))).toEqual({
      text: 'HELLO',
      width: 1280,
      height: 720,
      type: 'image/png',
    });
  } finally {
    debuggerApi.close();
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
});
