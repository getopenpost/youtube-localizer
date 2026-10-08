import { extensionApi } from '../platform/webextension';
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
import { renderedLayoutIsCurrent } from '../layers/current';
import { z } from 'zod';
import type { Repository } from '../core/storage';
import { dataUrl, fetchImage } from '../platform/images';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export class StudioBridge {
  constructor(private readonly repo: Repository) {}
  private async send(tabId: number, message: unknown): Promise<unknown> {
    const result = await extensionApi().tabs.sendMessage(tabId, message);
    if (!result?.ok)
      throw new Error(
        result?.error ??
          'Studio did not respond. Reload the working tab and retry.',
      );
    return result.data;
  }
  async discover(channelId?: string): Promise<StudioContext> {
    const account = channelId ? await this.repo.account(channelId) : undefined;
    const tabs = await extensionApi().tabs.query(
      channelId ? {} : { active: true, currentWindow: true },
    );
    const candidates = tabs.filter(
      (tab) =>
        tab.id &&
        tab.url?.startsWith('https://studio.youtube.com/') &&
        (!account ||
          new URL(tab.url!).searchParams.get('authuser') ===
            (account.authuser ?? null)),
    );
    for (const tab of candidates.sort(
      (a, b) =>
        Number(b.id === account?.tabId) - Number(a.id === account?.tabId),
    )) {
      try {
        const context = studioContextSchema.parse(
          await this.send(tab.id!, { type: 'discover' }),
        );
        if (channelId && context.channelId !== channelId) continue;
        await this.repo.putAccount({
          channelId: context.channelId,
          channelName: context.channelName,
          tabId: tab.id,
          authuser: new URL(tab.url!).searchParams.get('authuser') ?? undefined,
        });
        await this.repo.selectChannel(context.channelId);
        return context;
      } catch (error) {
        if (!channelId) throw error;
      }
    }
    throw new Error(
      channelId
        ? 'Open this account’s channel in Studio, then read its current page.'
        : 'Open YouTube Studio and select its tab, then read the current page.',
    );
  }
  async composerVideo(tabId: number): Promise<Video> {
    const tab = await extensionApi().tabs.get(tabId);
    const url = tab.url ? new URL(tab.url) : undefined;
    const id = url?.pathname.match(/^\/video\/([\w-]{11})\/edit\/?$/)?.[1];
    if (url?.origin !== 'https://studio.youtube.com' || !id)
      throw new Error('Open a video’s details in Studio first.');
    const context = studioContextSchema.parse(
      await this.send(tabId, { type: 'discover' }),
    );
    const video = videoSchema.parse(
      await this.send(tabId, {
        type: 'thumbnail-context',
        channelId: context.channelId,
        videoId: id,
      }),
    );
    if (
      (await extensionApi().tabs.get(tabId)).url !== tab.url ||
      video.id !== id ||
      video.channelId !== context.channelId
    )
      throw new Error(
        'Studio changed. Open the composer again from this video.',
      );
    const previous = await this.repo.account(video.channelId);
    video.channelName = previous?.channelName ?? context.channelName;
    await this.repo.putAccount({
      channelId: video.channelId,
      channelName: video.channelName,
      tabId,
      authuser: url.searchParams.get('authuser') ?? undefined,
    });
    await this.repo.selectChannel(video.channelId);
    return video;
  }
  async workingTab(channelId: string): Promise<number> {
    const account = await this.repo.account(channelId);
    if (!account)
      throw new Error('Connect this channel from its Studio tab first.');
    let tabId = account.tabId;
    if (tabId) {
      let tab: chrome.tabs.Tab | undefined;
      try {
        tab = await extensionApi().tabs.get(tabId);
      } catch {
        tabId = undefined;
      }
      if (tab) {
        if (
          !tab.url?.startsWith('https://studio.youtube.com/') ||
          new URL(tab.url).searchParams.get('authuser') !==
            (account.authuser ?? null)
        )
          throw new Error(
            'The Studio account changed. Read its current page before continuing.',
          );
        const current = studioContextSchema.parse(
          await this.send(tabId!, { type: 'discover' }),
        );
        if (current.channelId !== channelId)
          throw new Error(
            'The Studio account changed. Read its current page before continuing.',
          );
      }
    }
    if (!tabId) {
      const url = new URL(
        `https://studio.youtube.com/channel/${channelId}/videos`,
      );
      if (account.authuser !== undefined)
        url.searchParams.set('authuser', account.authuser);
      const tab = await extensionApi().tabs.create({
        url: url.href,
        active: true,
      });
      if (!tab.id) throw new Error('Could not open Studio.');
      tabId = tab.id;
      await delay(1200);
      account.tabId = tabId;
      await this.repo.putAccount(account);
    }
    const run = await this.repo.run();
    await this.repo.putRun({
      ...run,
      workingTabId: tabId,
      channelId,
      authuser: account.authuser,
    });
    return tabId;
  }
  async showWorkingTab(channelId: string): Promise<void> {
    const tabId = await this.workingTab(channelId);
    await extensionApi().tabs.update(tabId, { active: true });
    const tab = await extensionApi().tabs.get(tabId);
    await extensionApi().windows.update(tab.windowId, { focused: true });
  }
  private async navigate(
    tabId: number,
    channelId: string,
    videoId: string,
    route: 'edit' | 'translations',
  ) {
    const tab = await extensionApi().tabs.get(tabId);
    if (!tab.url?.startsWith('https://studio.youtube.com/'))
      throw new Error(
        'The dedicated Studio working tab changed. Check it before continuing.',
      );
    const run = await this.repo.run();
    const authuser = new URL(tab.url!).searchParams.get('authuser');
    if (
      run.workingTabId !== tabId ||
      run.channelId !== channelId ||
      authuser !== (run.authuser ?? null)
    )
      throw new Error(
        'The working Studio account changed. Check this channel again.',
      );
    const current = await this.send(tabId, { type: 'discover' }).then((value) =>
      studioContextSchema.parse(value),
    );
    if (current.channelId !== channelId)
      throw new Error('The working channel changed. The batch has paused.');
    const destination = new URL(
      `https://studio.youtube.com/video/${videoId}/${route}`,
    );
    if (authuser !== null) destination.searchParams.set('authuser', authuser);
    const url = destination.href;
    await extensionApi().tabs.update(tabId, { url });
    let lastError = 'Studio did not load.';
    for (let attempt = 0; attempt < 50; attempt++) {
      await delay(200);
      try {
        const loaded = await extensionApi().tabs.get(tabId);
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
    if (
      component === 'thumbnail' &&
      !(await renderedLayoutIsCurrent(this.repo, job))
    )
      throw new Error(
        'The editable layout changed. Render the thumbnail again before applying it.',
      );
    const run = await this.repo.run();
    if (!run.workingTabId || run.channelId !== job.channelId)
      throw new Error(
        'Run a preflight check to open the dedicated Studio working tab.',
      );
    const tab = await extensionApi().tabs.get(run.workingTabId);
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
