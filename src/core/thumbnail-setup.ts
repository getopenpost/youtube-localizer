import type { Job, ProviderConfig } from './model';

// Preview images do not establish a source or authorize an image edit.
export function thumbnailSetupReason(job: Job, config: ProviderConfig) {
  const slot = job.slots.thumbnail;
  if (
    slot?.generation !== 'queued' ||
    slot.application !== 'pending' ||
    slot.lastEvidence?.state !== 'missing'
  )
    return undefined;
  if (
    job.source.thumbnailTextApproved &&
    job.source.thumbnailText?.length === 0
  )
    return undefined;
  if (!job.source.thumbnailAssetId) return 'Choose a source thumbnail first.';
  if (
    config.imageProvider !== 'layerize' &&
    ((job.source.thumbnailWidth ?? 0) < 1280 ||
      (job.source.thumbnailHeight ?? 0) < 720)
  )
    return 'Choose a source image of at least 1280 × 720.';
  if (!job.source.thumbnailTextApproved)
    return config.imageProvider === 'layerize'
      ? 'Prepare and approve the editable thumbnail first.'
      : 'Read and confirm the source thumbnail text.';
  if (job.thumbnailStrings && !job.wordingApproved)
    return 'Approve the translated thumbnail wording.';
  return undefined;
}

export function canGenerateThumbnail(job: Job, config: ProviderConfig) {
  const slot = job.slots.thumbnail;
  return (
    slot?.generation === 'queued' &&
    slot.application === 'pending' &&
    slot.lastEvidence?.state === 'missing' &&
    !thumbnailSetupReason(job, config)
  );
}
