import { extensionApi } from '../platform/webextension';
import { dataUrl } from '../platform/images';
import { layerSchema, type LayerTemplate } from './model';
async function documentReady() {
  if (!(await extensionApi().offscreen.hasDocument()))
    await extensionApi().offscreen.createDocument({
      url: 'render.html',
      reasons: [
        extensionApi().offscreen.Reason.DOM_PARSER,
        extensionApi().offscreen.Reason.BLOBS,
      ],
      justification:
        'Inspect static text layouts and render cached thumbnails locally.',
    });
}
export async function inspect(html: string, width: number, height: number) {
  if (!extensionApi().offscreen && typeof document !== 'undefined')
    return (await import('./inspect')).inspectOverlay(html, width, height);
  await documentReady();
  const reply = await extensionApi().runtime.sendMessage({
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
  if (!extensionApi().offscreen && typeof document !== 'undefined')
    return (await import('./render')).compose(
      background,
      template.width,
      template.height,
      template.layers,
      translations,
      locale,
    );
  await documentReady();
  const reply = await extensionApi().runtime.sendMessage({
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
