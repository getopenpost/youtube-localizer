import type { Creation } from '../thumbnails/model';
import { creationPrompt } from '../thumbnails/model';
import { dataUrl } from '../platform/images';
import { falImageModelSchema } from '../core/providers';
import { submitFalImage } from './fal';
export async function submitCreation(
  creation: Creation,
  key: string,
  inputs: Blob[],
  canSubmit: () => Promise<boolean>,
) {
  const images = await Promise.all(inputs.map(dataUrl));
  return submitFalImage(
    falImageModelSchema.parse(creation.model),
    key,
    creationPrompt(creation),
    images,
    {
      quality: creation.quality,
      resolution: creation.resolution,
      precision: creation.precision,
    },
    canSubmit,
  );
}
