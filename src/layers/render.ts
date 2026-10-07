import type { TextLayer } from './model';
function lines(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
  locale: string,
): string[] {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    let segments: string[];
    try {
      segments = [
        ...new Intl.Segmenter(locale, { granularity: 'word' }).segment(
          paragraph,
        ),
      ].map((part) => part.segment);
    } catch {
      segments = paragraph.split(/(?<=\s)/);
    }
    for (const segment of segments) {
      if (line && context.measureText(line + segment).width > width) {
        result.push(line.trim());
        line = segment.trimStart();
      } else line += segment;
    }
    result.push(line.trim());
  }
  return result;
}
export async function compose(
  background: Blob,
  width: number,
  height: number,
  layers: TextLayer[],
  translations: string[],
  locale: string,
): Promise<Blob> {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 40_000_000
  )
    throw new Error('This layout is too large to render.');
  if (translations.length !== layers.length)
    throw new Error('Keep one translation per text layer.');
  const bitmap = await createImageBitmap(background);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not open the thumbnail canvas.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  await Promise.all(
    layers.map((layer) =>
      document.fonts.load(
        `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}"`,
        translations.join(' '),
      ),
    ),
  );
  await document.fonts.ready;
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    const text = translations[index];
    if (!text.trim()) throw new Error('Fill every text layer.');
    let size = layer.fontSize;
    let wrapped: string[] = [];
    let fits = false;
    for (; size >= 6; size -= 1) {
      context.letterSpacing = `${layer.letterSpacing}px`;
      context.font = `${layer.fontStyle} ${layer.fontWeight} ${size}px "${layer.fontFamily}", sans-serif`;
      wrapped = lines(context, text, layer.width, locale);
      if (
        wrapped.length * size * layer.lineHeight <= layer.height &&
        wrapped.every((line) => context.measureText(line).width <= layer.width)
      ) {
        fits = true;
        break;
      }
    }
    if (!fits)
      throw new Error(
        `Text does not fit layer ${index + 1}. Shorten it or adjust the layout.`,
      );
    context.save();
    context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.fillStyle = layer.color;
    context.textAlign = layer.align;
    context.textBaseline = 'middle';
    context.direction = /^(ar|he|fa|ur)(-|$)/.test(locale) ? 'rtl' : 'ltr';
    const x =
      layer.align === 'left'
        ? -layer.width / 2
        : layer.align === 'right'
          ? layer.width / 2
          : 0;
    for (let line = 0; line < wrapped.length; line++) {
      const y = (line - (wrapped.length - 1) / 2) * size * layer.lineHeight;
      if (layer.strokeWidth) {
        context.lineWidth = layer.strokeWidth;
        context.strokeStyle = layer.strokeColor;
        context.lineJoin = 'round';
        context.strokeText(wrapped[line], x, y);
      }
      context.fillText(wrapped[line], x, y);
    }
    context.restore();
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('Could not render the thumbnail.')),
      'image/png',
    ),
  );
}
