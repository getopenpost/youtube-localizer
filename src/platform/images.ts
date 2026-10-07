import { hash, type Asset } from '../core/model';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export async function imageAsset(
  blob: Blob,
  normalize = false,
): Promise<Asset> {
  if (
    blob.size > MAX_IMAGE_BYTES ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)
  )
    throw new Error('Choose a PNG, JPEG or WebP image below 10 MB.');
  const bitmap = await createImageBitmap(blob);
  if (
    bitmap.width < 1 ||
    bitmap.height < 1 ||
    bitmap.width * bitmap.height > 40_000_000
  ) {
    bitmap.close();
    throw new Error('This image is too large to process.');
  }
  let output = blob,
    width = bitmap.width,
    height = bitmap.height;
  if (normalize) {
    if (Math.abs(width / height - 16 / 9) > 0.12) {
      bitmap.close();
      throw new Error(
        'The generated image is not 16:9. Review it and regenerate before uploading.',
      );
    }
    const canvas = new OffscreenCanvas(1280, 720);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the thumbnail.');
    context.drawImage(bitmap, 0, 0, 1280, 720);
    output = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    width = 1280;
    height = 720;
    if (output.size > 2 * 1024 * 1024)
      throw new Error('The prepared thumbnail exceeds YouTube’s 2 MB limit.');
  }
  bitmap.close();
  const assetHash = await hash(output);
  return { id: assetHash, hash: assetHash, blob: output, width, height };
}
export async function fetchImage(
  url: string,
  kind: 'studio' | 'fal',
): Promise<Blob> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
    throw new Error('Unexpected thumbnail URL.');
  const allowed =
    kind === 'studio'
      ? parsed.hostname.endsWith('.ytimg.com')
      : parsed.hostname.endsWith('.fal.media') ||
        parsed.hostname === 'fal.media' ||
        parsed.hostname === 'storage.googleapis.com';
  if (!allowed) throw new Error('Unexpected thumbnail host.');
  const response = await fetch(parsed.href, {
    credentials: kind === 'studio' ? 'include' : 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error('Could not retrieve the thumbnail. Use another image.');
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES)
    throw new Error('The thumbnail is too large.');
  const blob = await response.blob();
  if (blob.size > MAX_IMAGE_BYTES)
    throw new Error('The thumbnail is too large.');
  return blob;
}
export async function dataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export async function referenceAsset(file: Blob): Promise<Asset> {
  const source = await imageAsset(file);
  const bitmap = await createImageBitmap(source.blob);
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Could not prepare this reference.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return imageAsset(await canvas.convertToBlob({ type: 'image/png' }));
}
