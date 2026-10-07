import type { Creation } from '../thumbnails/model';
import { creationPrompt } from '../thumbnails/model';
import { imageAsset } from '../platform/images';
import { activeRequest, openaiClient } from '../platform/openai-client';
import { ProviderError } from './http';
export async function createImage(
  creation: Creation,
  key: string,
  inputs: Blob[],
  receipt: (id: string) => Promise<void>,
  canSubmit: () => Promise<boolean>,
) {
  let blocked = false;
  const client = openaiClient(key).withOptions({
    fetch: async (url, init) => {
      if (!(await canSubmit())) {
        blocked = true;
        throw new Error('Generation paused before submission.');
      }
      return fetch(url, { ...init, redirect: 'error', credentials: 'omit' });
    },
  });
  return activeRequest(async () => {
    const options = {
      model: creation.model,
      prompt: creationPrompt(creation),
      size: '1280x720',
      quality: creation.quality,
      output_format: 'png' as const,
      stream: true as const,
      partial_images: 0,
      n: 1,
    };
    const request = inputs.length
      ? client.images.edit({
          ...options,
          image: inputs.map(
            (blob, index) =>
              new File(
                [blob],
                `reference-${index + 1}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'}`,
                { type: blob.type },
              ),
          ),
        })
      : client.images.generate(options);
    const { data: stream, response } = await request
      .withResponse()
      .catch((error) => {
        if (blocked)
          throw new ProviderError(
            'Generation paused before submission.',
            'rejected',
          );
        throw error;
      });
    const requestId = response.headers.get('x-request-id');
    if (requestId) await receipt(requestId);
    for await (const event of stream) {
      if (
        event.type !== 'image_edit.completed' &&
        event.type !== 'image_generation.completed'
      )
        continue;
      return imageAsset(
        new Blob(
          [Uint8Array.from(atob(event.b64_json), (c) => c.charCodeAt(0))],
          { type: 'image/png' },
        ),
        true,
      );
    }
    throw new ProviderError(
      'Image stream ended before completion. Check OpenAI before generating again.',
      'ambiguous',
    );
  });
}
