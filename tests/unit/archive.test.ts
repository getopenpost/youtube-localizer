import { expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Repository } from '../../src/core/storage';
import { exportArchive, importArchive } from '../../src/core/archive';
import {
  defaultSettings,
  hash,
  jobId,
  type Job,
  type Video,
} from '../../src/core/model';
it('roundtrips generated assets as unapproved cache and excludes credentials, signed URLs and verification authority', async () => {
  const repo = new Repository(crypto.randomUUID());
  const blob = new Blob(['fixture-image-bytes'], { type: 'image/jpeg' });
  const assetHash = await hash(blob);
  await repo.putAsset({
    id: assetHash,
    hash: assetHash,
    blob,
    width: 1280,
    height: 720,
  });
  const video: Video = {
    id: 'abcdefghijk',
    channelId: 'UC0000000000000000000000',
    channelName: 'Fixture',
    title: 'Aprender',
    description: 'Source',
    visibility: 'scheduled',
    scheduledAt: '2030-10-12',
    thumbnailUrl: 'https://i9.ytimg.com/signed?token=private-thumbnail-token',
    thumbnailAssetId: assetHash,
    thumbnailTextApproved: false,
    checkedAt: 1,
  };
  await repo.putVideo(video);
  const job: Job = {
    id: jobId(video.channelId, video.id, 'en'),
    channelId: video.channelId,
    videoId: video.id,
    language: 'en',
    sourceLanguage: 'pt',
    source: video,
    glossary: '',
    slots: {
      thumbnail: {
        sourceHash: assetHash,
        generation: 'generated',
        application: 'verified',
        assetId: assetHash,
        assetHash,
        lastEvidence: { state: 'present' },
        verifiedAt: 100,
      },
    },
    wordingApproved: true,
    correction: '',
    createdAt: 1,
    updatedAt: 1,
  };
  await repo.putJob(job);
  await repo.putSettings({
    provider: {
      ...defaultSettings().provider,
      protocol: 'openai',
      preset: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'fixture',
      auth: 'bearer',
      vision: true,
      falModel: 'fal-ai/nano-banana/edit',
      imageResolution: '1K',
      requestLimit: 2,
    },
    rememberCredentials: true,
  });
  await repo.putTemplate({
    id: assetHash,
    sourceHash: assetHash,
    state: 'ready',
    backgroundAssetId: assetHash,
    width: 1280,
    height: 720,
    layers: [],
    approved: true,
    revision: 'saved',
    request: {
      requestId: 'template-receipt',
      model: 'fal-ai/ideogram/v3/layerize-text',
      statusUrl:
        'https://queue.fal.run/fal-ai/ideogram/requests/template-receipt/status',
      responseUrl:
        'https://queue.fal.run/fal-ai/ideogram/requests/template-receipt',
    },
  });
  const reference = {
    id: crypto.randomUUID(),
    name: 'My face',
    assetId: assetHash,
    kind: 'person' as const,
  };
  await repo.putReference(reference);
  const creation = {
    id: crypto.randomUUID(),
    video,
    prompt: 'A thumbnail using my reference',
    references: [reference],
    model: 'gpt-image-2.5-sunburst' as const,
    quality: 'auto' as const,
    state: 'generated' as const,
    assetId: assetHash,
    retryAcknowledged: false,
    createdAt: 1,
  };
  await repo.putCreation(creation);
  const archive = await exportArchive(repo);
  const contents = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  const json = strFromU8(contents['history.json']);
  expect(json).not.toContain('private-thumbnail-token');
  expect(json).not.toContain('rememberCredentials');
  expect(json).not.toContain('api.openai.com');
  expect(json).not.toContain('queue.fal.run');
  const restored = new Repository(crypto.randomUUID());
  await importArchive(restored, archive);
  const result = (await restored.job(job.id))!;
  expect((await restored.reference(reference.id))?.name).toBe('My face');
  expect((await restored.creation(creation.id))?.assetId).toBe(assetHash);
  expect(
    (await restored.creation(creation.id))?.video.thumbnailUrl,
  ).toBeUndefined();
  expect(result.slots.thumbnail?.application).toBe('pending');
  expect(result.slots.thumbnail?.lastEvidence?.state).toBe('unknown');
  expect(result.slots.thumbnail?.verifiedAt).toBeUndefined();
  expect(result.wordingApproved).toBe(false);
  expect((await restored.template(assetHash))?.approved).toBe(false);
  expect((await restored.template(assetHash))?.backgroundAssetId).toBe(
    assetHash,
  );
  expect((await restored.template(assetHash))?.request).toBeUndefined();
  expect((await restored.asset(assetHash))?.blob.size).toBe(blob.size);
  expect((await restored.video(video.id))?.checkedAt).toBeUndefined();
  // Import merges rather than overwriting work already edited on the destination.
  result.slots.thumbnail!.error = 'Local work to preserve';
  await restored.putJob(result);
  await importArchive(restored, archive);
  expect((await restored.job(job.id))?.slots.thumbnail?.error).toBe(
    'Local work to preserve',
  );
  const unsafe = JSON.parse(json);
  unsafe.jobs[0].language = '../../escape';
  unsafe.jobs[0].id = `${video.channelId}/${video.id}/../../escape`;
  const unsafeFiles = {
    ...contents,
    'history.json': strToU8(JSON.stringify(unsafe)),
  };
  await expect(
    importArchive(
      new Repository(crypto.randomUUID()),
      new Blob([zipSync(unsafeFiles) as Uint8Array<ArrayBuffer>]),
    ),
  ).rejects.toThrow();
  contents[`assets/${assetHash}`] = strToU8('tampered');
  const corrupt = new Blob([zipSync(contents) as Uint8Array<ArrayBuffer>]);
  await expect(
    importArchive(new Repository(crypto.randomUUID()), corrupt),
  ).rejects.toThrow('saved hash');
});
