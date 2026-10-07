import type { Job } from '../core/model';
import type { Repository } from '../core/storage';
export async function renderedLayoutIsCurrent(repo: Repository, job: Job) {
  const slot = job.slots.thumbnail;
  if (slot?.provider !== 'ideogram-layerize/local') return true;
  const video = await repo.video(job.videoId);
  if (
    !video?.thumbnailAssetId ||
    video.thumbnailAssetId !== job.source.thumbnailAssetId
  )
    return false;
  const template = await repo.template(video.thumbnailAssetId);
  return (
    !!template?.approved &&
    template.state === 'ready' &&
    template.revision === slot.templateRevision
  );
}
