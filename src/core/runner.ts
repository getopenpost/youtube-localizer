import {
  components,
  hash,
  type Component,
  type Evidence,
  type FalRequest,
  type Job,
  type ProviderConfig,
} from './model';
import type { Repository } from './storage';
import type { Translation } from '../providers/text';
import { ProviderError } from '../providers/http';
export interface GenerationProvider {
  translate(job: Job, config: ProviderConfig): Promise<Translation>;
  submitImage(job: Job, config: ProviderConfig): Promise<FalRequest>;
  pollImage(request: FalRequest): Promise<string | undefined>;
  storeImage(url: string): Promise<{ id: string; hash: string }>;
}
export interface ApplicationProvider {
  apply(
    job: Job,
    component: Component,
    epoch: number,
  ): Promise<{
    evidence: Evidence;
    companionEvidence?: Evidence;
    wrote?: boolean;
  }>;
}
export class Runner {
  constructor(
    private readonly repo: Repository,
    private readonly generation: GenerationProvider,
    private readonly application: ApplicationProvider,
  ) {}
  async recover() {
    for (const video of await this.repo.videos()) {
      if (video.extractionStatus === 'submitting') {
        video.extractionStatus = 'ambiguous';
        await this.repo.putVideo(video);
      }
    }
    for (const job of await this.repo.jobs()) {
      let changed = false;
      for (const component of components) {
        const slot = job.slots[component];
        if (!slot) continue;
        if (slot.generation === 'submitting') {
          slot.generation =
            component === 'thumbnail' && job.falRequest
              ? 'waiting'
              : 'ambiguous';
          slot.error =
            slot.generation === 'ambiguous'
              ? 'The browser stopped before a receipt was saved. Check your provider dashboard. This request will not be resubmitted automatically.'
              : undefined;
          changed = true;
        }
        if (slot.application === 'applying') {
          slot.application = 'needs-verification';
          slot.error =
            'The browser stopped during application. Recheck Studio before any further write.';
          changed = true;
        }
      }
      if (changed) await this.repo.putJob(job);
    }
  }
  async tick(): Promise<boolean> {
    const run = await this.repo.run();
    if (run.mode === 'paused') return false;
    const jobs = (
      await Promise.all(run.jobIds.map((id) => this.repo.job(id)))
    ).filter((job): job is Job => !!job);
    try {
      if (run.mode === 'apply') {
        for (const job of jobs)
          for (const component of job.enabledComponents ?? components) {
            const slot = job.slots[component];
            if (
              !slot ||
              slot.application !== 'approved' ||
              slot.generation !== 'generated'
            )
              continue;
            if (!(await this.repo.isActive(run.epoch, 'apply'))) return false;
            slot.application = 'applying';
            await this.repo.putJob(job);
            try {
              const result = await this.application.apply(
                job,
                component,
                run.epoch,
              );
              slot.lastEvidence = result.evidence;
              if (result.evidence.state === 'missing')
                throw new Error(
                  'Studio still reports this component as missing. Keep the generated result and retry application after checking Studio.',
                );
              const exact =
                component !== 'thumbnail' &&
                result.evidence.state === 'present' &&
                result.evidence.value === slot.value;
              slot.application =
                result.wrote === false && result.evidence.state === 'present'
                  ? 'preserved'
                  : exact
                    ? 'verified'
                    : result.evidence.state === 'present' &&
                        result.evidence.value !== undefined
                      ? 'preserved'
                      : 'needs-verification';
              if (component === 'thumbnail' && result.wrote !== false)
                slot.application = 'needs-verification';
              slot.verifiedAt = exact ? Date.now() : undefined;
              slot.error =
                slot.application === 'needs-verification'
                  ? 'Studio saved a thumbnail or unreadable result. Visually verify it in Studio; image processing prevents exact byte verification.'
                  : undefined;
              const companion =
                job.slots[component === 'title' ? 'description' : 'title'];
              if (
                component !== 'thumbnail' &&
                companion &&
                result.companionEvidence &&
                companion.application === 'approved'
              ) {
                companion.lastEvidence = result.companionEvidence;
                companion.application =
                  result.companionEvidence.value === companion.value
                    ? 'verified'
                    : 'needs-verification';
                companion.verifiedAt =
                  companion.application === 'verified' ? Date.now() : undefined;
              }
            } catch (error) {
              slot.application = 'needs-verification';
              slot.error =
                error instanceof Error ? error.message : 'Application stopped.';
              await this.repo.pause(slot.error);
            }
            await this.repo.putJob(job);
            return true;
          }
        await this.repo.pause(
          'Approved items have been processed. Review any items that need verification.',
        );
        return false;
      }
      const config = (await this.repo.settings()).provider;
      // Recover completed Fal requests before sending any new paid requests.
      for (const job of jobs) {
        const slot = job.slots.thumbnail;
        if (slot?.generation !== 'waiting' || !job.falRequest) continue;
        try {
          const url = await this.generation.pollImage(job.falRequest);
          if (!url) continue;
          const asset = await this.generation.storeImage(url);
          slot.assetId = asset.id;
          slot.assetHash = asset.hash;
          slot.generation = 'generated';
          slot.error = undefined;
          await this.repo.putJob(job);
          return true;
        } catch (error) {
          slot.error =
            error instanceof Error
              ? error.message
              : 'Could not retrieve the existing result.';
          await this.repo.putJob(job);
          await this.repo.pause(slot.error);
          return false;
        }
      }
      for (const job of jobs) {
        const pendingText = (['title', 'description'] as const).filter(
          (component) => {
            const slot = job.slots[component];
            return (
              (job.enabledComponents ?? components).includes(component) &&
              slot?.generation === 'queued' &&
              slot.lastEvidence?.state === 'missing' &&
              slot.application === 'pending'
            );
          },
        );
        const thumbnail = job.slots.thumbnail;
        const needsWording =
          (job.enabledComponents ?? components).includes('thumbnail') &&
          thumbnail?.generation === 'queued' &&
          thumbnail.lastEvidence?.state === 'missing' &&
          thumbnail.application === 'pending' &&
          !job.thumbnailStrings &&
          job.source.thumbnailTextApproved &&
          (job.source.thumbnailText?.length ?? 0) > 0;
        if (!pendingText.length && !needsWording) continue;
        // Preflight never authorizes a blind retry of any paid request in the same text bundle.
        if (
          (['title', 'description'] as const).some(
            (c) => job.slots[c]?.generation === 'ambiguous',
          )
        )
          continue;
        await this.repo.consumeRequest(run.epoch);
        for (const component of pendingText)
          job.slots[component]!.generation = 'submitting';
        if (needsWording) thumbnail!.generation = 'submitting';
        await this.repo.putJob(job);
        if (!(await this.repo.isActive(run.epoch, 'generate'))) {
          for (const component of pendingText)
            job.slots[component]!.generation = 'queued';
          if (needsWording) thumbnail!.generation = 'queued';
          await this.repo.putJob(job);
          return false;
        }
        try {
          const result = await this.generation.translate(job, config);
          const settingsHash = await hash(JSON.stringify(config));
          for (const component of pendingText)
            Object.assign(job.slots[component]!, {
              value: result[component],
              generation: 'generated',
              provider: `${config.protocol}:${config.model}`,
              settingsHash,
              assetHash: await hash(result[component]),
              error: undefined,
            });
          if (needsWording) thumbnail!.generation = 'queued';
          if (job.source.thumbnailTextApproved)
            job.thumbnailStrings = result.thumbnailStrings;
        } catch (error) {
          const status =
            error instanceof ProviderError && error.outcome === 'rejected'
              ? 'error'
              : 'ambiguous';
          for (const component of pendingText)
            Object.assign(job.slots[component]!, {
              generation: status,
              error:
                error instanceof Error
                  ? error.message
                  : 'Generation outcome unknown.',
            });
          if (needsWording)
            Object.assign(thumbnail!, {
              generation: status,
              error:
                error instanceof Error
                  ? error.message
                  : 'Generation outcome unknown.',
            });
          await this.repo.pause(
            'Generation stopped. Review the provider outcome before retrying.',
          );
        }
        await this.repo.putJob(job);
        return true;
      }
      for (const job of jobs) {
        const slot = job.slots.thumbnail;
        if (
          !(job.enabledComponents ?? components).includes('thumbnail') ||
          !slot ||
          slot.generation !== 'queued' ||
          slot.application !== 'pending' ||
          slot.lastEvidence?.state !== 'missing'
        )
          continue;
        if (
          job.source.thumbnailTextApproved &&
          job.source.thumbnailText?.length === 0
        ) {
          slot.generation = 'not-needed';
          await this.repo.putJob(job);
          return true;
        }
        if (!job.wordingApproved || !job.source.thumbnailAssetId) continue;
        if (
          (job.source.thumbnailWidth ?? 0) < 1280 ||
          (job.source.thumbnailHeight ?? 0) < 720
        )
          throw new Error(
            'Choose a source image of at least 1280 × 720 before paying for image edits.',
          );
        await this.repo.consumeRequest(run.epoch);
        slot.generation = 'submitting';
        await this.repo.putJob(job);
        if (!(await this.repo.isActive(run.epoch, 'generate'))) {
          slot.generation = 'queued';
          await this.repo.putJob(job);
          return false;
        }
        try {
          const receipt = await this.generation.submitImage(job, config);
          // This is the receipt checkpoint. A subsequent wake polls it, never submits again.
          job.falRequest = receipt;
          slot.generation = 'waiting';
          slot.provider = receipt.model;
          slot.settingsHash = await hash(JSON.stringify(config));
          slot.error = undefined;
        } catch (error) {
          slot.generation =
            error instanceof ProviderError && error.outcome === 'rejected'
              ? 'error'
              : 'ambiguous';
          slot.error =
            error instanceof Error
              ? error.message
              : 'Fal submission outcome unknown.';
          await this.repo.pause(slot.error);
        }
        await this.repo.putJob(job);
        return true;
      }
      if (jobs.some((job) => job.slots.thumbnail?.generation === 'waiting'))
        return false;
      await this.repo.pause(
        jobs.some(
          (job) =>
            (job.enabledComponents ?? components).includes('thumbnail') &&
            job.slots.thumbnail?.generation === 'queued' &&
            job.slots.thumbnail.application === 'pending',
        )
          ? 'Generation finished. Review the results and approve thumbnail wording to continue images.'
          : 'Generation finished. Review the results before applying.',
      );
    } catch (error) {
      await this.repo.pause(
        error instanceof Error ? error.message : 'The run stopped.',
      );
    }
    return false;
  }
}
