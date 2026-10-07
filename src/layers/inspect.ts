import DOMPurify from 'dompurify';
import { layerSchema, type TextLayer } from './model';
const properties = new Set([
  'position',
  'left',
  'top',
  'right',
  'bottom',
  'width',
  'height',
  'max-width',
  'max-height',
  'margin',
  'margin-left',
  'margin-top',
  'padding',
  'padding-left',
  'padding-top',
  'display',
  'font-size',
  'font-weight',
  'font-family',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'color',
  'transform',
  'transform-origin',
  'white-space',
  'word-break',
  'overflow-wrap',
  '-webkit-text-stroke',
  '-webkit-text-stroke-width',
  '-webkit-text-stroke-color',
  'box-sizing',
]);
export async function inspectOverlay(
  html: string,
  width: number,
  height: number,
): Promise<TextLayer[]> {
  if (html.length > 256000)
    throw new Error('Layerize returned an oversized text overlay.');
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'div',
      'span',
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'br',
      'b',
      'strong',
      'i',
      'em',
    ],
    ALLOWED_ATTR: ['style'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'img', 'svg', 'math', 'link'],
    RETURN_DOM_FRAGMENT: true,
  });
  for (const element of clean.querySelectorAll<HTMLElement>('[style]')) {
    const safe = document.createElement('div').style;
    for (const property of [...element.style]) {
      const value = element.style.getPropertyValue(property);
      if (
        properties.has(property) &&
        value.length < 512 &&
        !/url\s*\(|expression\s*\(|@|var\s*\(/i.test(value)
      )
        safe.setProperty(property, value);
    }
    element.style.cssText = safe.cssText;
  }
  const root = document.createElement('div');
  root.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;font:600 48px Geist,sans-serif`;
  root.append(clean);
  document.body.append(root);
  await document.fonts.ready;
  try {
    const blocks = [
      ...root.querySelectorAll<HTMLElement>('div,p,h1,h2,h3,h4,span'),
    ].filter(
      (element) =>
        element.textContent?.trim() &&
        !element.querySelector('div,p,h1,h2,h3,h4'),
    );
    const top = blocks.filter(
      (element) =>
        !blocks.some(
          (parent) => parent !== element && parent.contains(element),
        ),
    );
    const origin = root.getBoundingClientRect();
    return top.slice(0, 30).map((element, index) => {
      const style = getComputedStyle(element);
      const rotation = style.transform.startsWith('matrix(')
        ? (Math.atan2(
            Number(style.transform.slice(7).split(',')[1]),
            Number(style.transform.slice(7).split(',')[0]),
          ) *
            180) /
          Math.PI
        : 0;
      const transform = element.style.transform;
      element.style.transform = 'none';
      const box = element.getBoundingClientRect();
      element.style.transform = transform;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.fillStyle = style.color;
      const color = context.fillStyle as string;
      const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const hex = rgb
        ? '#' +
          rgb
            .slice(1, 4)
            .map((value) => Number(value).toString(16).padStart(2, '0'))
            .join('')
        : color;
      const families = style.fontFamily
        .split(',')
        .map((value) => value.trim().replaceAll(/["']/g, ''));
      const family =
        families.find((name) =>
          ['Geist', 'Arial', 'Georgia', 'serif', 'sans-serif'].includes(name),
        ) ?? 'sans-serif';
      const text = element.cloneNode(true) as HTMLElement;
      for (const br of text.querySelectorAll('br')) br.replaceWith('\n');
      return layerSchema.parse({
        id: `text-${index + 1}`,
        text: text.textContent!.trim(),
        x: box.left - origin.left,
        y: box.top - origin.top,
        width: Math.max(box.width, 1),
        height: Math.max(box.height, parseFloat(style.fontSize) * 1.2),
        fontSize: parseFloat(style.fontSize) || 48,
        fontFamily: family,
        fontWeight: Number(style.fontWeight) || 600,
        fontStyle: style.fontStyle === 'italic' ? 'italic' : 'normal',
        letterSpacing: parseFloat(style.letterSpacing) || 0,
        rotation,
        strokeWidth: parseFloat(style.webkitTextStrokeWidth) || 0,
        color: /^#[a-f\d]{6}$/i.test(hex) ? hex : '#ffffff',
        align: ['left', 'right'].includes(style.textAlign)
          ? style.textAlign
          : 'center',
        lineHeight:
          parseFloat(style.lineHeight) / parseFloat(style.fontSize) || 1.2,
      });
    });
  } finally {
    root.remove();
  }
}
