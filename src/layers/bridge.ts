import { dataUrl } from '../platform/images';
import { layerSchema, type LayerTemplate } from './model';
async function documentReady() {
  if (!(await chrome.offscreen.hasDocument()))
    await chrome.offscreen.createDocument({
      url: 'render.html',
      reasons: [
        chrome.offscreen.Reason.DOM_PARSER,
        chrome.offscreen.Reason.BLOBS,
      ],
      justification:
        'Inspect static text layouts and render cached thumbnails locally.',
    });
}
export async function inspect(html: string, width: number, height: number) {
  await documentReady();
  const reply = await chrome.runtime.sendMessage({
    type: 'layer-inspect',
    html,
    width,
    height,
  });
  if (!reply?.ok)
    throw new Error(reply?.error ?? 'Could not inspect text layers.');
  return layerSchema.array().parse(reply.data);
}
export async function render(
  template: LayerTemplate,
  background: Blob,
  translations: string[],
  locale: string,
) {
  await documentReady();
  const reply = await chrome.runtime.sendMessage({
    type: 'layer-render',
    background: await dataUrl(background),
    width: template.width,
    height: template.height,
    layers: template.layers,
    translations,
    locale,
  });
  if (!reply?.ok)
    throw new Error(reply?.error ?? 'Could not render text layers.');
  const match = String(reply.data).match(/^data:image\/png;base64,(.+)$/);
  if (!match) throw new Error('Unreadable rendered thumbnail.');
  return new Blob([Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0))], {
    type: 'image/png',
  });
}
