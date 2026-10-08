import type { Repository } from '../core/storage';
import { credentials } from '../platform/credentials';
import { ProviderError } from '../providers/http';
import { submitCreation } from '../providers/create-image';
import { pollImage } from '../providers/fal';
import { fetchImage, imageAsset } from '../platform/images';
import { creationSchema } from './model';
export async function recoverCreations(repo: Repository) {
  for (const creation of await repo.creations()) {
    if (creation.state !== 'submitting') continue;
    creation.state = creation.falRequest ? 'waiting' : 'ambiguous';
    creation.error = creation.falRequest
      ? undefined
      : 'Generation interrupted. Check the provider before accepting another charge.';
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
  if (earlier.some((c) => ['submitting', 'waiting'].includes(c.state)))
    throw new Error('Wait for the current thumbnail request.');
  if (
    earlier.some((c) => c.state === 'ambiguous' && !c.retryAcknowledged) &&
    !input.acknowledged
  )
    throw new Error(
      'Check the provider and accept a possible second charge before generating again.',
    );
  const epoch = (await repo.run()).epoch;
  const video = await repo.video(input.videoId);
  if (!video) throw new Error('Open this video from Studio first.');
  const settings = (await repo.settings()).provider;
  const keys = await credentials();
  const key = keys.falKey;
  if (!key) throw new Error('Add a Fal API key in Settings.');
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
    model: settings.falModel,
    quality:
      settings.falModel === 'ideogram/v4.5/edit'
        ? settings.ideogramQuality
        : settings.imageQuality,
    resolution: settings.imageResolution,
    precision: settings.ideogramPrecision,
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
    creation.falRequest = await submitCreation(creation, key, assets, () =>
      repo.isActive(epoch, 'paused'),
    );
    creation.requestId = creation.falRequest.requestId;
    creation.state = 'waiting';
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

export async function pollCreations(repo: Repository): Promise<boolean> {
  const key = (await credentials()).falKey;
  if (!key) return false;
  for (const creation of await repo.creations()) {
    if (creation.state !== 'waiting' || !creation.falRequest) continue;
    try {
      const url = await pollImage(creation.falRequest, key);
      if (!url) continue;
      const asset = await imageAsset(await fetchImage(url, 'fal'), true);
      await repo.putAsset(asset);
      creation.assetId = asset.id;
      creation.state = 'generated';
      creation.error = undefined;
      await repo.putCreation(creation);
      return true;
    } catch (error) {
      creation.error =
        error instanceof Error
          ? error.message
          : 'Could not retrieve the saved Fal request.';
      await repo.putCreation(creation);
    }
  }
  return false;
}
