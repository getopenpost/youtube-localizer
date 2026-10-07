import {
  snapshotSchema,
  studioContextSchema,
  videoSchema,
  hash,
  type Component,
  type Evidence,
  type Job,
  type Snapshot,
  type StudioContext,
  type Video,
} from '../core/model';
import { z } from 'zod';
import type { Repository } from '../core/storage';
import { dataUrl, fetchImage } from '../platform/images';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export class StudioBridge {
  constructor(private readonly repo: Repository) {}
  private async send(tabId: number, message: unknown): Promise<unknown> {
    const result = await chrome.tabs.sendMessage(tabId, message);
    if (!result?.ok)
      throw new Error(
        result?.error ??
          'Studio did not respond. Reload the working tab and retry.',
      );
    return result.data;
  }
  async discover(): Promise<StudioContext> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !tab.url?.startsWith('https://studio.youtube.com/'))
      throw new Error(
        'Open YouTube Studio and select its tab, then refresh the video list.',
      );
    return studioContextSchema.parse(
      await this.send(tab.id, { type: 'discover' }),
    );
  }
  async workingTab(channelId: string): Promise<number> {
    const run = await this.repo.run();
    if (run.workingTabId) {
      try {
        const tab = await chrome.tabs.get(run.workingTabId);
        if (
          tab.url?.startsWith('https://studio.youtube.com/') &&
          run.channelId === channelId
        )
          return run.workingTabId;
      } catch {
        /* A closed working tab is replaced only by an explicit preflight. */
      }
    }
    const tab = await chrome.tabs.create({
      url: `https://studio.youtube.com/channel/${channelId}/videos`,
      active: true,
    });
    if (!tab.id) throw new Error('Could not open a Studio working tab.');
    const current = await this.repo.run();
    current.workingTabId = tab.id;
    current.channelId = channelId;
    await this.repo.putRun(current);
    await delay(1200);
    return tab.id;
  }
  private async navigate(
    tabId: number,
    channelId: string,
    videoId: string,
    route: 'edit' | 'translations',
  ) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url?.startsWith('https://studio.youtube.com/'))
      throw new Error(
        'The dedicated Studio working tab changed. Check it before continuing.',
      );
    const current = await this.send(tabId, { type: 'discover' }).then((value) =>
      studioContextSchema.parse(value),
    );
    if (current.channelId !== channelId)
      throw new Error('The working channel changed. The batch has paused.');
    const url = `https://studio.youtube.com/video/${videoId}/${route}`;
    await chrome.tabs.update(tabId, { url });
    let lastError = 'Studio did not load.';
    for (let attempt = 0; attempt < 50; attempt++) {
      await delay(200);
      try {
        const loaded = await chrome.tabs.get(tabId);
        if (loaded.status !== 'complete' || loaded.url !== url) continue;
        const context = studioContextSchema.parse(
          await this.send(tabId, { type: 'discover' }),
        );
        if (context.channelId !== channelId)
          throw new Error('The working channel changed.');
        return;
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : 'Studio did not load.';
      }
    }
    throw new Error(lastError);
  }
  async snapshot(
    tabId: number,
    channelId: string,
    videoId: string,
    languages: string[],
  ): Promise<Snapshot> {
    await this.navigate(tabId, channelId, videoId, 'edit');
    const video = videoSchema.parse(
      await this.send(tabId, { type: 'details', channelId, videoId }),
    );
    await this.navigate(tabId, channelId, videoId, 'translations');
    const translation = z
      .object({
        targets: snapshotSchema.shape.targets,
        languages: z.array(z.string()),
        sourceLanguage: z.string().optional(),
      })
      .parse(
        await this.send(tabId, {
          type: 'translations',
          channelId,
          videoId,
          languages,
        }),
      );
    video.sourceLanguage = translation.sourceLanguage;
    return {
      video,
      targets: translation.targets,
      languages: translation.languages,
    };
  }
  async apply(
    job: Job,
    component: Component,
    epoch: number,
  ): Promise<{
    evidence: Evidence;
    video: Video;
    companionEvidence?: Evidence;
    wrote: boolean;
  }> {
    const run = await this.repo.run();
    if (!run.workingTabId || run.channelId !== job.channelId)
      throw new Error(
        'Run a preflight check to open the dedicated Studio working tab.',
      );
    const tab = await chrome.tabs.get(run.workingTabId);
    if (!tab.active)
      throw new Error(
        'Select the dedicated Studio working tab before applying translations.',
      );
    const snapshot = await this.snapshot(
      run.workingTabId,
      job.channelId,
      job.videoId,
      [job.language],
    );
    const source = job.source;
    if (
      snapshot.video.title !== source.title ||
      snapshot.video.description !== source.description ||
      snapshot.video.visibility !== source.visibility ||
      snapshot.video.scheduledAt !== source.scheduledAt
    )
      throw new Error(
        'The source, visibility or schedule changed. Check this video again before applying.',
      );
    if (component === 'thumbnail') {
      if (!source.studioThumbnailHash || !snapshot.video.thumbnailUrl)
        throw new Error(
          'The current Studio thumbnail cannot be rechecked. Run preflight again before application.',
        );
      const currentHash = await hash(
        await fetchImage(snapshot.video.thumbnailUrl, 'studio'),
      );
      if (currentHash !== source.studioThumbnailHash)
        throw new Error(
          'The source thumbnail changed. Recheck this video before applying.',
        );
    }
    const evidence = snapshot.targets[job.language][component];
    if (evidence.state !== 'missing')
      return { evidence, video: snapshot.video, wrote: false };
    if (!(await this.repo.isActive(epoch, 'apply')))
      throw new Error('Application paused.');
    const slot = job.slots[component];
    if (!slot) throw new Error('No approved component.');
    const asset = slot.assetId
      ? await this.repo.asset(slot.assetId)
      : undefined;
    const companionComponent = component === 'title' ? 'description' : 'title';
    const companion =
      component === 'thumbnail' ? undefined : job.slots[companionComponent];
    const companionValue =
      companion?.application === 'approved' &&
      snapshot.targets[job.language][companionComponent].state === 'missing'
        ? companion.value
        : undefined;
    await this.send(run.workingTabId, {
      type: 'write',
      channelId: job.channelId,
      videoId: job.videoId,
      language: job.language,
      component,
      value: slot.value,
      companionValue,
      imageData: asset ? await dataUrl(asset.blob) : undefined,
      expectedSource: { title: source.title, description: source.description },
      epoch,
    });
    // Navigation reloads persisted Studio state, rather than trusting the dialog's save event.
    await this.navigate(
      run.workingTabId,
      job.channelId,
      job.videoId,
      'translations',
    );
    const fresh = z.object({ targets: snapshotSchema.shape.targets }).parse(
      await this.send(run.workingTabId, {
        type: 'translations',
        channelId: job.channelId,
        videoId: job.videoId,
        languages: [job.language],
      }),
    );
    let verified: Evidence = fresh.targets[job.language][component];
    let companionEvidence: Evidence | undefined;
    if (component !== 'thumbnail' && verified.state === 'present') {
      const metadata = z
        .object({ title: z.string(), description: z.string() })
        .optional()
        .parse(
          await this.send(run.workingTabId, {
            type: 'read-text',
            channelId: job.channelId,
            videoId: job.videoId,
            language: job.language,
          }),
        );
      verified = metadata
        ? { state: 'present', value: metadata[component] }
        : { state: 'unknown' };
      if (companionValue !== undefined)
        companionEvidence = metadata
          ? { state: 'present', value: metadata[companionComponent] }
          : { state: 'unknown' };
    }
    await this.navigate(run.workingTabId, job.channelId, job.videoId, 'edit');
    const after = videoSchema.parse(
      await this.send(run.workingTabId, {
        type: 'details',
        channelId: job.channelId,
        videoId: job.videoId,
      }),
    );
    if (
      after.visibility !== source.visibility ||
      after.scheduledAt !== source.scheduledAt ||
      after.title !== source.title ||
      after.description !== source.description
    )
      throw new Error(
        'The source, visibility or schedule changed during application. Stop and inspect Studio.',
      );
    return { evidence: verified, video: after, companionEvidence, wrote: true };
  }
}
