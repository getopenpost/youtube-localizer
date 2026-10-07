import { describe, it, expect, vi } from 'vitest';
import { Repository } from '../../src/core/storage';
import { preflightPlan, videoStatus } from '../../src/core/planner';
import { Runner, type GenerationProvider } from '../../src/core/runner';
import {
  jobId,
  preferencesSchema,
  type Job,
  type Snapshot,
  type Video,
} from '../../src/core/model';
import { ProviderError } from '../../src/providers/http';
const channel = 'UC0000000000000000000000';
const source = (): Video => ({
  id: 'abcdefghijk',
  channelId: channel,
  channelName: 'Fixture teacher',
  title: 'Aprender',
  description: '00:00 Introdução',
  visibility: 'scheduled',
  scheduledAt: '2030-10-12T18:00:00Z',
  sourceLanguage: 'pt',
  thumbnailTextApproved: true,
  thumbnailText: ['APRENDER'],
  thumbnailAssetId: 'source',
  thumbnailWidth: 1280,
  thumbnailHeight: 720,
});
async function setup(
  targetState: 'missing' | 'unknown' | 'present' = 'missing',
) {
  const name = crypto.randomUUID();
  const repo = new Repository(name);
  const snapshot: Snapshot = {
    video: source(),
    languages: ['pt', 'en'],
    targets: {
      en: {
        title: { state: targetState },
        description: { state: targetState },
        thumbnail: { state: targetState },
      },
    },
  };
  const prefs = preferencesSchema.parse({
    channelId: channel,
    targetLanguages: ['en'],
    components: ['title', 'description', 'thumbnail'],
  });
  await preflightPlan(repo, snapshot, prefs);
  const id = jobId(channel, 'abcdefghijk', 'en');
  await repo.putRun({
    mode: 'generate',
    epoch: 1,
    requestsUsed: 0,
    requestLimit: 10,
    jobIds: [id],
    reason: '',
  });
  const provider: GenerationProvider = {
    translate: vi.fn(async () => ({
      title: 'Learn',
      description: '00:00 Introduction',
      thumbnailStrings: ['LEARN'],
    })),
    submitImage: vi.fn(async () => ({
      requestId: 'receipt-1',
      model: 'fal-ai/nano-banana/edit',
      statusUrl:
        'https://queue.fal.run/fal-ai/nano-banana/requests/receipt-1/status',
      responseUrl:
        'https://queue.fal.run/fal-ai/nano-banana/requests/receipt-1',
    })),
    pollImage: vi.fn(async () => 'https://fal.media/result.jpg'),
    storeImage: vi.fn(async () => ({ id: 'result', hash: 'result-hash' })),
  };
  const apply = vi.fn(async () => ({
    evidence: { state: 'present' as const, value: 'Learn' },
  }));
  return {
    repo,
    name,
    id,
    provider,
    apply,
    runner: new Runner(repo, provider, { apply }),
    prefs,
  };
}
async function getJob(repo: Repository, id: string): Promise<Job> {
  return (await repo.job(id))!;
}
describe('durable localization workflow', () => {
  it('does not pay for unknown or already present targets', async () => {
    for (const state of ['unknown', 'present'] as const) {
      const { repo, provider, runner, prefs } = await setup(state);
      await runner.tick();
      expect(provider.translate).not.toHaveBeenCalled();
      expect(provider.submitImage).not.toHaveBeenCalled();
      expect(
        videoStatus(
          (await repo.video('abcdefghijk'))!,
          await repo.jobs(),
          prefs,
        ),
      ).toBe(state === 'unknown' ? 'Needs attention' : 'Complete');
    }
  });
  it('resumes a queued Fal result from a persisted receipt without a second submission', async () => {
    const { repo, name, id, provider, runner } = await setup();
    await runner.tick();
    let job = await getJob(repo, id);
    job.wordingApproved = true;
    await repo.putJob(job);
    await runner.tick();
    expect(provider.submitImage).toHaveBeenCalledTimes(1);
    const restarted = new Runner(new Repository(name), provider, {
      apply: vi.fn(),
    });
    await restarted.recover();
    await restarted.tick();
    job = await getJob(repo, id);
    expect(provider.submitImage).toHaveBeenCalledTimes(1);
    expect(job.slots.thumbnail?.assetId).toBe('result');
    expect(job.slots.thumbnail?.generation).toBe('generated');
    expect((await repo.run()).requestsUsed).toBe(2);
  });
  it('stops new paid requests after pause while preserving a received result', async () => {
    const { repo, id, provider, runner } = await setup();
    provider.translate = vi.fn(async () => {
      await repo.pause();
      return {
        title: 'Learn',
        description: '00:00 Introduction',
        thumbnailStrings: ['LEARN'],
      };
    });
    await runner.tick();
    await runner.tick();
    expect((await getJob(repo, id)).slots.title?.value).toBe('Learn');
    expect(provider.submitImage).not.toHaveBeenCalled();
    expect((await repo.run()).mode).toBe('paused');
  });
  it('does not resubmit an ambiguous paid request after a restart', async () => {
    const { repo, id, provider, runner } = await setup();
    provider.translate = vi.fn(async () => {
      throw new ProviderError('Connection lost', 'ambiguous');
    });
    await runner.tick();
    await repo.putRun({ ...(await repo.run()), mode: 'generate' });
    await runner.recover();
    await runner.tick();
    expect(provider.translate).toHaveBeenCalledTimes(1);
    expect((await getJob(repo, id)).slots.title?.generation).toBe('ambiguous');
  });
  it('recovers a crash before the receipt as ambiguous, and a crash during application as unverified', async () => {
    const { repo, id, provider, runner } = await setup();
    const job = await getJob(repo, id);
    job.slots.title!.generation = 'submitting';
    job.slots.thumbnail!.generation = 'generated';
    job.slots.thumbnail!.application = 'applying';
    await repo.putJob(job);
    await runner.recover();
    await runner.tick();
    const recovered = await getJob(repo, id);
    expect(recovered.slots.title?.generation).toBe('ambiguous');
    expect(recovered.slots.thumbnail?.application).toBe('needs-verification');
    expect(provider.translate).not.toHaveBeenCalled();
  });
  it('enforces the paid request limit before submitting another generation', async () => {
    const { repo, id, provider, runner } = await setup();
    await repo.putRun({ ...(await repo.run()), requestLimit: 1 });
    await runner.tick();
    const job = await getJob(repo, id);
    job.wordingApproved = true;
    await repo.putJob(job);
    await runner.tick();
    expect(provider.submitImage).not.toHaveBeenCalled();
    expect((await repo.run()).mode).toBe('paused');
    expect((await repo.run()).reason).toContain('Request limit');
  });
  it('reuses generated assets and marks source changes stale while preserving manual Studio translations', async () => {
    const { repo, id, runner, prefs } = await setup();
    await runner.tick();
    const before = await getJob(repo, id);
    const video = source();
    video.title = 'Outro título';
    await preflightPlan(
      repo,
      {
        video,
        languages: ['en'],
        targets: {
          en: {
            title: { state: 'present', value: 'Learn' },
            description: { state: 'present' },
            thumbnail: { state: 'missing' },
          },
        },
      },
      prefs,
    );
    const after = await getJob(repo, id);
    expect(after.slots.title?.value).toBe(before.slots.title?.value);
    expect(after.slots.title?.application).toBe('stale');
    expect(after.slots.description?.application).toBe('preserved');
    expect(videoStatus(video, [after], prefs)).toBe('Source changed');
  });
  it('requires fresh exact text verification and never claims processed thumbnail bytes were verified', async () => {
    const { repo, id, runner, apply } = await setup();
    const job = await getJob(repo, id);
    job.slots.title = {
      ...job.slots.title!,
      generation: 'generated',
      application: 'approved',
      value: 'Learn',
    };
    job.slots.thumbnail = {
      ...job.slots.thumbnail!,
      generation: 'generated',
      application: 'approved',
      assetId: 'result',
    };
    await repo.putJob(job);
    await repo.putRun({ ...(await repo.run()), mode: 'apply' });
    await runner.tick();
    expect((await getJob(repo, id)).slots.title?.application).toBe('verified');
    apply.mockResolvedValue({
      evidence: { state: 'present', value: undefined as unknown as string },
    });
    await runner.tick();
    expect((await getJob(repo, id)).slots.thumbnail?.application).toBe(
      'needs-verification',
    );
  });
});

it('a new target language generates only the newly missing work', async () => {
  const { repo, id, provider, runner, prefs } = await setup();
  await runner.tick();
  const video = source();
  const missing = {
    title: { state: 'missing' as const },
    description: { state: 'missing' as const },
    thumbnail: { state: 'missing' as const },
  };
  await preflightPlan(
    repo,
    { video, targets: { en: missing, es: missing }, languages: ['en', 'es'] },
    { ...prefs, targetLanguages: ['en', 'es'] },
  );
  await repo.putRun({
    ...(await repo.run()),
    jobIds: [id, jobId(channel, video.id, 'es')],
  });
  await runner.tick();
  expect(provider.translate).toHaveBeenCalledTimes(2);
  expect((await getJob(repo, id)).slots.title?.value).toBe('Learn');
  expect(
    (await getJob(repo, jobId(channel, video.id, 'es'))).slots.title
      ?.generation,
  ).toBe('generated');
});
it('turning off thumbnails preserves their cache but sends no further image requests', async () => {
  const { repo, id, provider, runner, prefs } = await setup();
  await runner.tick();
  const job = await getJob(repo, id);
  job.wordingApproved = true;
  await repo.putJob(job);
  const missing = {
    title: { state: 'missing' as const },
    description: { state: 'missing' as const },
    thumbnail: { state: 'missing' as const },
  };
  await preflightPlan(
    repo,
    { video: source(), targets: { en: missing }, languages: ['en'] },
    { ...prefs, components: ['title'] },
  );
  await runner.tick();
  expect(provider.submitImage).not.toHaveBeenCalled();
  expect((await getJob(repo, id)).thumbnailStrings).toEqual(['LEARN']);
});
it('a source thumbnail confirmed to contain no text does not create paid image copies', async () => {
  const { repo, id, provider, runner } = await setup();
  const job = await getJob(repo, id);
  job.source.thumbnailText = [];
  await repo.putJob(job);
  provider.translate = vi.fn(async () => ({
    title: 'Learn',
    description: '00:00 Introduction',
    thumbnailStrings: [],
  }));
  await runner.tick();
  await runner.tick();
  expect(provider.submitImage).not.toHaveBeenCalled();
  expect((await getJob(repo, id)).slots.thumbnail?.generation).toBe(
    'not-needed',
  );
});
