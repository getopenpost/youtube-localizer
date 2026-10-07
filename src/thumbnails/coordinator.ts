import type { Repository } from '../core/storage';
import { credentials } from '../platform/credentials';
import { ProviderError } from '../providers/http';
import { createImage } from '../providers/create-image';
import { creationSchema } from './model';
export async function recoverCreations(repo: Repository) {
  for (const creation of await repo.creations()) {
    if (creation.state !== 'submitting') continue;
    creation.state = 'ambiguous';
    creation.error =
      'Generation interrupted. Check OpenAI before accepting another charge.';
    await repo.putCreation(creation);
  }
}
export async function generateThumbnail(
  repo: Repository,
  input: {
    id: string;
    videoId: string;
    prompt: string;
    referenceIds: string[];
    useCurrent: boolean;
    acknowledged: boolean;
  },
) {
  const previous = await repo.creation(input.id);
  if (previous) return previous;
  const earlier = (await repo.creations()).filter(
    (c) => c.video.id === input.videoId,
  );
  if (earlier.some((c) => c.state === 'submitting'))
    throw new Error('Wait for the current thumbnail request.');
  if (
    earlier.some((c) => c.state === 'ambiguous' && !c.retryAcknowledged) &&
    !input.acknowledged
  )
    throw new Error(
      'Check OpenAI and accept a possible second charge before generating again.',
    );
  const epoch = (await repo.run()).epoch;
  const video = await repo.video(input.videoId);
  if (!video) throw new Error('Open this video from Studio first.');
  const settings = (await repo.settings()).provider;
  const keys = await credentials();
  const key =
    keys.imageKey ||
    (settings.protocol === 'openai' &&
    settings.baseUrl.replace(/\/$/, '') === 'https://api.openai.com/v1'
      ? keys.textKey
      : '');
  if (!key) throw new Error('Add an OpenAI API key in Settings.');
  const references = await Promise.all(
    input.referenceIds.map(async (id) => {
      const reference = await repo.reference(id);
      if (!reference)
        throw new Error(
          'A selected reference was removed. Select your references again.',
        );
      return reference;
    }),
  );
  const creation = creationSchema.parse({
    id: input.id,
    video,
    prompt: input.prompt,
    references,
    sourceAssetId: input.useCurrent ? video.thumbnailAssetId : undefined,
    model: settings.imageModel,
    quality: settings.imageQuality,
    state: 'submitting',
    createdAt: Date.now(),
  });
  if (input.useCurrent && !creation.sourceAssetId)
    throw new Error(
      'The current thumbnail is not cached. Uncheck it or choose a saved reference.',
    );
  const assets = await Promise.all(
    [
      ...references.map((r) => r.assetId),
      ...(creation.sourceAssetId ? [creation.sourceAssetId] : []),
    ].map(async (id) => {
      const asset = await repo.asset(id);
      if (!asset)
        throw new Error('A reference image is missing. Add it again.');
      return asset.blob;
    }),
  );
  await repo.putCreation(creation);
  if (!(await repo.isActive(epoch, 'paused'))) {
    creation.state = 'error';
    creation.error = 'Generation paused before submission.';
    await repo.putCreation(creation);
    return creation;
  }
  if (input.acknowledged)
    for (const old of earlier.filter((c) => c.state === 'ambiguous')) {
      old.retryAcknowledged = true;
      await repo.putCreation(old);
    }
  try {
    const asset = await createImage(
      creation,
      key,
      assets,
      async (id) => {
        creation.requestId = id;
        await repo.putCreation(creation);
      },
      () => repo.isActive(epoch, 'paused'),
    );
    await repo.putAsset(asset);
    creation.assetId = asset.id;
    creation.state = 'generated';
  } catch (error) {
    creation.state =
      error instanceof ProviderError && error.outcome === 'rejected'
        ? 'error'
        : 'ambiguous';
    creation.error =
      error instanceof Error ? error.message : 'Generation outcome unknown.';
  }
  await repo.putCreation(creation);
  return creation;
}
