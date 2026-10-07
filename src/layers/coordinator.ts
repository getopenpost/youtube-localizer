import { z } from 'zod';
import type { Repository } from '../core/storage';
import { hash } from '../core/model';
import { credentials } from '../platform/credentials';
import { dataUrl, fetchImage, imageAsset } from '../platform/images';
import { pollQueue, submitLayerize } from '../providers/fal';
import { ProviderError } from '../providers/http';
import { inspect } from './bridge';
import type { LayerTemplate, TextLayer } from './model';
export async function recoverTemplates(repo: Repository) {
  for (const template of await repo.templates())
    if (template.state === 'submitting') {
      template.state = template.request ? 'waiting' : 'ambiguous';
      template.error = template.request
        ? undefined
        : 'Preparation interrupted. Check Fal before starting another request.';
      await repo.putTemplate(template);
    }
}
export async function prepareTemplate(
  repo: Repository,
  videoId: string,
  acknowledged = false,
) {
  const epoch = (await repo.run()).epoch;
  const video = await repo.video(videoId);
  const source = video?.thumbnailAssetId
    ? await repo.asset(video.thumbnailAssetId)
    : undefined;
  if (!video || !source) throw new Error('Choose a source thumbnail first.');
  const existing = await repo.template(source.id);
  if (existing?.state === 'ready' || existing?.state === 'waiting')
    return existing;
  if (existing?.state === 'ambiguous' && !acknowledged)
    throw new Error(
      'Check the previous Fal request before accepting another charge.',
    );
  const key = (await credentials()).falKey;
  if (!key) throw new Error('Add your Fal key in Settings.');
  const template: LayerTemplate = {
    id: source.id,
    sourceHash: source.hash,
    width: source.width,
    height: source.height,
    state: 'submitting',
    layers: [],
    approved: false,
    revision: '',
  };
  await repo.putTemplate(template);
  try {
    const image = await dataUrl(source.blob);
    if (!(await repo.isActive(epoch, 'paused'))) {
      template.state = 'error';
      template.error = 'Preparation paused before submission.';
      await repo.putTemplate(template);
      return template;
    }
    template.request = await submitLayerize(key, image);
    template.state = 'waiting';
  } catch (error) {
    template.state =
      error instanceof ProviderError && error.outcome === 'rejected'
        ? 'error'
        : 'ambiguous';
    template.error =
      error instanceof Error ? error.message : 'Preparation outcome unknown.';
  }
  await repo.putTemplate(template);
  return template;
}
export async function pollTemplates(repo: Repository): Promise<boolean> {
  for (const template of await repo.templates()) {
    if (template.state !== 'waiting' || !template.request || template.error)
      continue;
    try {
      const value = await pollQueue(
        template.request,
        (await credentials()).falKey,
      );
      if (!value) continue;
      const parsed = z
        .object({
          image: z.object({ url: z.string().url() }),
          text_html: z.string().max(256000).nullish(),
        })
        .parse(value);
      const background = await imageAsset(
        await fetchImage(parsed.image.url, 'fal'),
      );
      await repo.putAsset(background);
      template.backgroundAssetId = background.id;
      template.width = background.width;
      template.height = background.height;
      template.error = undefined;
      try {
        template.layers = parsed.text_html
          ? await inspect(parsed.text_html, template.width, template.height)
          : [];
      } catch {
        template.layers = [];
        template.error =
          'The background is ready. Add text boxes to rebuild this layout.';
      }
      template.state = 'ready';
      template.approved = false;
      template.revision = await hash(
        JSON.stringify({ background: background.id, layers: template.layers }),
      );
      await repo.putTemplate(template);
      return true;
    } catch (error) {
      template.error =
        error instanceof Error
          ? error.message
          : 'Could not retrieve the saved preparation.';
      await repo.putTemplate(template);
    }
  }
  return false;
}
export async function saveTemplate(
  repo: Repository,
  id: string,
  layers: TextLayer[],
  approved: boolean,
) {
  const template = await repo.template(id);
  if (!template || template.state !== 'ready')
    throw new Error('Wait for thumbnail preparation.');
  const changed = JSON.stringify(template.layers) !== JSON.stringify(layers);
  template.error = undefined;
  template.layers = layers;
  template.approved = approved;
  template.revision = await hash(
    JSON.stringify({ background: template.backgroundAssetId, layers }),
  );
  await repo.putTemplate(template);
  const jobs = await repo.jobs();
  for (const video of await repo.videos())
    if (video.thumbnailAssetId === id) {
      video.thumbnailText = layers.map((layer) => layer.text);
      video.thumbnailTextApproved = approved;
      await repo.putVideo(video);
      for (const job of jobs)
        if (job.videoId === video.id) {
          const textChanged =
            JSON.stringify(job.source.thumbnailText) !==
            JSON.stringify(video.thumbnailText);
          job.source.thumbnailText = video.thumbnailText;
          job.source.thumbnailTextApproved = approved;
          if (textChanged) {
            job.thumbnailStrings = undefined;
            job.wordingApproved = false;
          }
          if (
            job.slots.thumbnail?.generation === 'not-needed' &&
            layers.length &&
            job.slots.thumbnail.application !== 'preserved'
          )
            job.slots.thumbnail.generation = 'queued';
          if (
            (changed || !approved) &&
            job.slots.thumbnail?.generation === 'generated'
          )
            job.slots.thumbnail.application = 'stale';
          await repo.putJob(job);
        }
    }
}
