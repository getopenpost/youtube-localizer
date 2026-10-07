import { imageAsset } from '../platform/images';
import { activeRequest, openaiClient } from '../platform/openai-client';
import { ProviderError } from './http';
import { imagePrompt } from './image-prompt';
import type { Job, ProviderConfig } from '../core/model';
export interface ImageResult {
  assetId: string;
  hash: string;
  provider: string;
  requestId?: string;
}
export async function editImage(
  job: Job,
  config: ProviderConfig,
  key: string,
  source: Blob,
  save: (blob: Blob) => Promise<{ id: string; hash: string }>,
  receipt: (id: string) => Promise<void>,
): Promise<ImageResult> {
  const client = openaiClient(key);
  return activeRequest(async () => {
    const { data: stream, response } = await client.images
      .edit({
        model: config.imageModel,
        image: new File([source], 'thumbnail.png', { type: source.type }),
        prompt: imagePrompt(job),
        size: '1280x720',
        quality: config.imageQuality,
        output_format: 'png',
        stream: true,
        partial_images: 0,
      })
      .withResponse();
    const requestId = response.headers.get('x-request-id') ?? undefined;
    if (requestId) await receipt(requestId);
    for await (const event of stream) {
      if (event.type !== 'image_edit.completed') continue;
      const bytes = Uint8Array.from(atob(event.b64_json), (character) =>
        character.charCodeAt(0),
      );
      const normalized = await imageAsset(
        new Blob([bytes], { type: 'image/png' }),
        true,
      );
      const asset = await save(normalized.blob);
      return {
        assetId: asset.id,
        hash: asset.hash,
        provider: config.imageModel,
        requestId,
      };
    }
    throw new ProviderError(
      'Image stream ended before completion. Check OpenAI before retrying.',
      'ambiguous',
    );
  });
}
