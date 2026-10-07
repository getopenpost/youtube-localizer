import '@fontsource/geist/400.css';
import '@fontsource/geist/600.css';
import { z } from 'zod';
import { compose } from './render';
import { inspectOverlay } from './inspect';
import { layerSchema } from './model';
import { dataUrl } from '../platform/images';
const schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('layer-inspect'),
    html: z.string().max(256000),
    width: z.number().positive().max(10000),
    height: z.number().positive().max(10000),
  }),
  z.object({
    type: z.literal('layer-render'),
    background: z.string().max(15000000),
    width: z.number().positive().max(10000),
    height: z.number().positive().max(10000),
    layers: z.array(layerSchema).max(30),
    translations: z.array(z.string().max(200)).max(30),
    locale: z.string(),
  }),
]);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url?.startsWith('https:'))
    return;
  const parsed = schema.safeParse(message);
  if (!parsed.success) return;
  const value = parsed.data;
  const task = async () => {
    if (value.type === 'layer-inspect')
      return inspectOverlay(value.html, value.width, value.height);
    const match = value.background.match(
      /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/,
    );
    if (!match) throw new Error('Invalid cached background.');
    const blob = new Blob(
      [Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))],
      { type: match[1] },
    );
    return dataUrl(
      await compose(
        blob,
        value.width,
        value.height,
        value.layers,
        value.translations,
        value.locale,
      ),
    );
  };
  void task()
    .then((data) => reply({ ok: true, data }))
    .catch((error) =>
      reply({
        ok: false,
        error: error instanceof Error ? error.message : 'Layer render failed.',
      }),
    );
  return true;
});
