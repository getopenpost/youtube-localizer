import {
  components,
  jobId,
  sourceHashes,
  type Job,
  type Preferences,
  type Snapshot,
  type Video,
} from './model';
import type { Repository } from './storage';
export async function preflightPlan(
  repo: Repository,
  snapshot: Snapshot,
  prefs: Preferences,
) {
  const video = snapshot.video;
  video.sourceHashes = await sourceHashes(video);
  video.checkedAt = Date.now();
  await repo.putVideo(video);
  for (const language of prefs.targetLanguages) {
    const sourceLanguage = video.sourceLanguage ?? prefs.sourceLanguage;
    if (language === sourceLanguage) continue;
    const id = jobId(video.channelId, video.id, language);
    const existing = await repo.job(id);
    const job: Job = existing ?? {
      id,
      channelId: video.channelId,
      videoId: video.id,
      language,
      sourceLanguage,
      source: video,
      glossary: prefs.glossary,
      slots: {},
      wordingApproved: false,
      correction: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    job.enabledComponents = prefs.components;
    const evidence = snapshot.targets[language];
    for (const component of prefs.components) {
      const target = evidence?.[component] ?? { state: 'unknown' as const };
      const slot = job.slots[component];
      if (slot) {
        slot.lastEvidence = target;
        if (slot.sourceHash !== video.sourceHashes[component])
          slot.application = 'stale';
        else if (
          target.state === 'present' &&
          !['verified', 'needs-verification'].includes(slot.application)
        )
          slot.application = 'preserved';
        else if (target.state === 'unknown') {
          slot.application = 'pending';
          slot.error =
            'Studio could not read this component. Check again before generating or applying.';
        }
        if (
          target.state === 'present' &&
          target.value !== undefined &&
          slot.generation === 'generated' &&
          slot.sourceHash === video.sourceHashes[component] &&
          slot.value === target.value &&
          component !== 'thumbnail'
        ) {
          slot.application = 'verified';
          slot.verifiedAt = Date.now();
          slot.error = undefined;
        }
        if (
          target.state === 'missing' &&
          ['verified', 'preserved', 'needs-verification'].includes(
            slot.application,
          )
        ) {
          slot.application = 'pending';
          if (slot.generation === 'not-needed') slot.generation = 'queued';
          slot.error = undefined;
        }
        continue;
      }
      job.slots[component] = {
        sourceHash: video.sourceHashes[component],
        generation:
          target.state === 'present' ||
          (component === 'description' && !video.description.trim())
            ? 'not-needed'
            : 'queued',
        application: target.state === 'present' ? 'preserved' : 'pending',
        lastEvidence: target,
      };
    }
    // Keep the source tied to generated assets. A changed source requires an explicit fresh generation.
    if (
      !components.some(
        (component) => job.slots[component]?.application === 'stale',
      )
    ) {
      job.source = video;
      job.sourceLanguage = sourceLanguage;
      job.glossary = prefs.glossary;
    }
    await repo.putJob(job);
  }
}
export type VideoStatus =
  | 'Not checked'
  | 'Missing languages'
  | 'Complete'
  | 'Source changed'
  | 'Needs attention';
export function videoStatus(
  video: Video,
  jobs: Job[],
  prefs?: Preferences,
): VideoStatus {
  if (!video.checkedAt) return 'Not checked';
  const relevant = jobs.filter(
    (job) =>
      job.videoId === video.id &&
      job.channelId === video.channelId &&
      (!prefs || prefs.targetLanguages.includes(job.language)),
  );
  if (
    prefs?.targetLanguages.some(
      (language) =>
        language !== (video.sourceLanguage ?? prefs.sourceLanguage) &&
        !relevant.some((job) => job.language === language),
    )
  )
    return 'Not checked';
  if (
    relevant.some((job) =>
      components.some((c) => job.slots[c]?.application === 'stale'),
    )
  )
    return 'Source changed';
  if (
    relevant.some((job) =>
      components.some(
        (c) =>
          ['ambiguous', 'error'].includes(job.slots[c]?.generation ?? '') ||
          job.slots[c]?.application === 'needs-verification' ||
          job.slots[c]?.lastEvidence?.state === 'unknown',
      ),
    )
  )
    return 'Needs attention';
  if (
    relevant.length &&
    relevant.every((job) =>
      (prefs?.components ?? components.filter((c) => job.slots[c])).every(
        (c) =>
          ['verified', 'preserved'].includes(job.slots[c]?.application ?? '') ||
          job.slots[c]?.generation === 'not-needed',
      ),
    )
  )
    return 'Complete';
  return relevant.length ? 'Missing languages' : 'Not checked';
}
