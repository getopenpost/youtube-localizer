import { templateSchema } from '../layers/model';
import { zipSync, unzip, strToU8, strFromU8 } from 'fflate';
import { z } from 'zod';
import {
  components,
  hash,
  jobId,
  jobSchema,
  preferencesSchema,
  videoSchema,
  type Asset,
} from './model';
import type { Repository } from './storage';
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 400 * 1024 * 1024;
const exportVideo = (video: z.infer<typeof videoSchema>) => ({
  ...video,
  thumbnailUrl: undefined,
});
const archiveSchema = z.object({
  templates: z.array(templateSchema).max(10000).default([]),
  format: z.literal('youtube-localizer'),
  version: z.literal(1),
  videos: z.array(videoSchema).max(10000),
  jobs: z.array(jobSchema).max(50000),
  preferences: z.array(preferencesSchema).max(1000),
  assets: z
    .array(
      z.object({
        id: z.string().regex(/^[a-f0-9]{64}$/),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        width: z.number().positive().max(16384),
        height: z.number().positive().max(16384),
      }),
    )
    .max(10000),
});
export async function exportArchive(repo: Repository): Promise<Blob> {
  const assets = await repo.assets();
  const manifest = {
    templates: (await repo.templates()).map((template) => ({
      ...template,
      request: undefined,
    })),
    format: 'youtube-localizer',
    version: 1,
    videos: (await repo.videos()).map(exportVideo),
    jobs: (await repo.jobs()).map((job) => ({
      ...job,
      source: exportVideo(job.source),
      falRequest: undefined,
    })),
    preferences: await repo.allPreferences(),
    assets: assets.map(({ blob, ...asset }) => ({ ...asset, type: blob.type })),
  };
  const files: Record<string, Uint8Array> = {
    'history.json': strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const asset of assets)
    files[`assets/${asset.id}`] = new Uint8Array(
      await asset.blob.arrayBuffer(),
    );
  const bytes = zipSync(files, { level: 0 });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: 'application/zip',
  });
}
export async function exportGenerated(
  repo: Repository,
  options?: { jobIds: string[] },
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  for (const job of await repo.jobs()) {
    if (options && !options.jobIds.includes(job.id)) continue;
    const folder = `${job.videoId}/${job.language}`;
    const title = job.slots.title?.value,
      description = job.slots.description?.value;
    if (title !== undefined) files[`${folder}/title.txt`] = strToU8(title);
    if (description !== undefined)
      files[`${folder}/description.txt`] = strToU8(description);
    const asset = job.slots.thumbnail?.assetId
      ? await repo.asset(job.slots.thumbnail.assetId)
      : undefined;
    if (asset)
      files[
        `${folder}/thumbnail.${asset.blob.type === 'image/jpeg' ? 'jpg' : 'png'}`
      ] = new Uint8Array(await asset.blob.arrayBuffer());
  }
  return new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], {
    type: 'application/zip',
  });
}
export async function importArchive(repo: Repository, file: Blob) {
  if (file.size > MAX_ARCHIVE_BYTES)
    throw new Error('This archive is above the 200 MB import limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let expanded = 0;
  const files = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) =>
      unzip(
        bytes,
        {
          filter(entry) {
            expanded += entry.originalSize;
            if (expanded > MAX_UNPACKED_BYTES)
              throw new Error('The archive expands above the 400 MB limit.');
            return (
              entry.name === 'history.json' ||
              /^assets\/[a-f0-9]{64}$/.test(entry.name)
            );
          },
        },
        (error, data) =>
          error
            ? reject(new Error('Could not read this ZIP archive.'))
            : resolve(data),
      ),
  );
  if (!files['history.json'] || files['history.json'].length > 30 * 1024 * 1024)
    throw new Error('This archive has no valid history.');
  const manifest = archiveSchema.parse(
    JSON.parse(strFromU8(files['history.json'])),
  );
  const assets: Asset[] = [];
  for (const asset of manifest.assets) {
    const content = files[`assets/${asset.id}`];
    if (!content || content.length > 10 * 1024 * 1024)
      throw new Error('An archive image is missing or too large.');
    const blob = new Blob([content as Uint8Array<ArrayBuffer>], {
      type: asset.type,
    });
    if ((await hash(blob)) !== asset.hash || asset.id !== asset.hash)
      throw new Error('An archive image does not match its saved hash.');
    assets.push({
      id: asset.id,
      hash: asset.hash,
      width: asset.width,
      height: asset.height,
      blob,
    });
  }
  const assetIds = new Set(assets.map((asset) => asset.id));
  for (const job of manifest.jobs) {
    if (
      job.id !== jobId(job.channelId, job.videoId, job.language) ||
      job.source.channelId !== job.channelId ||
      job.source.id !== job.videoId
    )
      throw new Error(
        'An archive job has mismatched video or channel identifiers.',
      );
    job.source.thumbnailUrl = undefined;
    for (const component of components) {
      const slot = job.slots[component];
      if (!slot) continue;
      if (slot.assetId && !assetIds.has(slot.assetId))
        throw new Error('An archive job refers to a missing image.');
      slot.application = 'pending';
      slot.lastEvidence = { state: 'unknown' };
      slot.verifiedAt = undefined;
      if (['submitting', 'waiting'].includes(slot.generation))
        slot.generation = 'ambiguous';
      slot.error =
        'Imported cache. Run a fresh Studio preflight before generation or application.';
    }
    job.wordingApproved = false;
  }
  for (const video of manifest.videos) {
    video.thumbnailUrl = undefined;
    video.checkedAt = undefined;
  }
  for (const template of manifest.templates) {
    if (
      (template.backgroundAssetId &&
        !assetIds.has(template.backgroundAssetId)) ||
      !assetIds.has(template.id)
    )
      throw new Error('An editable template references a missing image.');
    template.approved = false;
    if (['submitting', 'waiting'].includes(template.state))
      template.state = 'ambiguous';
    template.request = undefined;
  }
  await repo.importCache({
    videos: manifest.videos,
    jobs: manifest.jobs,
    assets,
    preferences: manifest.preferences,
    templates: manifest.templates,
  });
}
