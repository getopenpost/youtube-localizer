import { components, type Component, type Job } from './model';
import type { Repository } from './storage';
import { renderedLayoutIsCurrent } from '../layers/current';

export function canApproveResult(job: Job, component: Component): boolean {
  const slot = job.slots[component];
  return (
    !!slot &&
    slot.generation === 'generated' &&
    slot.application === 'pending' &&
    slot.lastEvidence?.state === 'missing' &&
    (component === 'thumbnail' ? !!slot.assetId : !!slot.value?.trim())
  );
}
export function canApproveWording(job: Job): boolean {
  const slot = job.slots.thumbnail;
  return (
    !!slot &&
    !job.wordingApproved &&
    job.source.thumbnailTextApproved &&
    !!job.source.thumbnailText?.length &&
    job.thumbnailStrings?.length === job.source.thumbnailText.length &&
    job.thumbnailStrings.every((value) => !!value.trim()) &&
    slot.lastEvidence?.state === 'missing' &&
    ['queued', 'generated'].includes(slot.generation) &&
    !['preserved', 'stale', 'verified', 'applying'].includes(slot.application)
  );
}
export function approvalCount(job: Job, enabled: Component[]): number {
  return (
    enabled.filter((component) => canApproveResult(job, component)).length +
    Number(enabled.includes('thumbnail') && canApproveWording(job))
  );
}
export async function approveAll(repo: Repository, ids: string[]) {
  const jobs = await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const job = await repo.job(id);
      if (!job)
        throw new Error('This job no longer exists. Check the video again.');
      return job;
    }),
  );
  if (new Set(jobs.map((job) => job.channelId)).size !== 1)
    throw new Error('Approve one channel at a time.');
  let approved = 0,
    wordings = 0;
  for (const job of jobs) {
    const prefs = await repo.preferences(job.channelId);
    if (prefs && !prefs.targetLanguages.includes(job.language)) continue;
    const enabled = prefs?.components ?? job.enabledComponents ?? components;
    let changed = false;
    for (const component of enabled) {
      if (!canApproveResult(job, component)) continue;
      if (
        component === 'thumbnail' &&
        !(await renderedLayoutIsCurrent(repo, job))
      )
        continue;
      job.slots[component]!.application = 'approved';
      approved++;
      changed = true;
    }
    if (enabled.includes('thumbnail') && canApproveWording(job)) {
      job.wordingApproved = true;
      wordings++;
      changed = true;
    }
    if (changed) await repo.putJob(job);
  }
  return { approved, wordings };
}
