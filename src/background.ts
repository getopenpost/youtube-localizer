import { defaultRun, hash, preferencesSchema, type Job } from './core/model';
import { repository as repo } from './core/storage';
import { preflightPlan } from './core/planner';
import { Runner } from './core/runner';
import { StudioBridge } from './studio/bridge';
import { credentials, restrictStorage } from './platform/credentials';
import { commandSchema, type Command } from './platform/messages';
import { dataUrl, fetchImage, imageAsset } from './platform/images';
import { extractThumbnailText, translate } from './providers/text';
import { pollImage, submitImage } from './providers/fal';
import { ProviderError } from './providers/http';
const bridge = new StudioBridge(repo);
const runner = new Runner(
  repo,
  {
    async translate(job, config) {
      return translate(job, config, (await credentials()).textKey);
    },
    async submitImage(job, config) {
      const asset = job.source.thumbnailAssetId
        ? await repo.asset(job.source.thumbnailAssetId)
        : undefined;
      if (!asset)
        throw new Error(
          'Cache or choose a source thumbnail before generating.',
        );
      return submitImage(
        job,
        config,
        (await credentials()).falKey,
        await dataUrl(asset.blob),
      );
    },
    async pollImage(request) {
      return pollImage(request, (await credentials()).falKey);
    },
    async storeImage(url) {
      const asset = await imageAsset(await fetchImage(url, 'fal'), true);
      await repo.putAsset(asset);
      return asset;
    },
  },
  bridge,
);
const ready = (async () => {
  await restrictStorage();
  await navigator.locks.request('localizer-coordinator', () =>
    runner.recover(),
  );
})();
let advancing = false;
const kick = () => {
  if (advancing) return;
  advancing = true;
  void ready
    .then(() =>
      navigator.locks.request('localizer-coordinator', async () => {
        while (await runner.tick()) {
          /* Every operation persists before this continuation. */
        }
      }),
    )
    .catch(() =>
      repo.pause(
        'The coordinator stopped. Open the extension and check the run.',
      ),
    )
    .finally(() => {
      advancing = false;
    });
};
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.alarms.create('localizer-tick', { periodInMinutes: 0.5 });
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create('localizer-tick', { periodInMinutes: 0.5 });
  kick();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'localizer-tick') kick();
});
async function getJob(id: string): Promise<Job> {
  const job = await repo.job(id);
  if (!job) throw new Error('This job no longer exists. Run preflight again.');
  return job;
}
async function assertPaused() {
  if ((await repo.run()).mode !== 'paused')
    throw new Error('Pause the run before editing its settings or results.');
}
async function execute(value: Command): Promise<unknown> {
  switch (value.type) {
    case 'discover': {
      const context = await bridge.discover();
      for (const video of context.videos) {
        const existing = await repo.video(video.id);
        await repo.putVideo(
          existing ? { ...existing, channelName: video.channelName } : video,
        );
      }
      return context;
    }
    case 'preflight': {
      await assertPaused();
      const savedPreferences = await repo.preferences(value.channelId);
      const preferences =
        savedPreferences ??
        preferencesSchema.parse({ channelId: value.channelId });
      if (!preferences.targetLanguages.length)
        throw new Error(
          'Choose target languages in channel preferences first.',
        );
      const tab = await bridge.workingTab(value.channelId);
      for (const id of value.videoIds) {
        const known = await repo.video(id);
        if (!known || known.channelId !== value.channelId)
          throw new Error(
            'This video does not belong to the selected channel.',
          );
        const snapshot = await bridge.snapshot(
          tab,
          value.channelId,
          id,
          preferences.targetLanguages,
        );
        if (!snapshot.video.sourceLanguage && !savedPreferences)
          throw new Error(
            'Confirm the source language in channel preferences.',
          );
        if (snapshot.video.thumbnailUrl) {
          try {
            const asset = await imageAsset(
              await fetchImage(snapshot.video.thumbnailUrl, 'studio'),
            );
            await repo.putAsset(asset);
            snapshot.video.thumbnailAssetId = asset.id;
            snapshot.video.studioThumbnailHash = asset.hash;
            snapshot.video.thumbnailOrigin = 'studio';
            snapshot.video.sourceHashes = {
              title: await hash(snapshot.video.title),
              description: await hash(snapshot.video.description),
              thumbnail: asset.hash,
            };
            snapshot.video.thumbnailWidth = asset.width;
            snapshot.video.thumbnailHeight = asset.height;
          } catch {
            /* Text-only preflight remains usable. The UI explains image recovery. */
          }
        }
        const old = await repo.video(id);
        if (
          old?.studioThumbnailHash &&
          old.studioThumbnailHash === snapshot.video.studioThumbnailHash
        ) {
          if (old.thumbnailOrigin === 'chosen') {
            snapshot.video.thumbnailAssetId = old.thumbnailAssetId;
            snapshot.video.thumbnailWidth = old.thumbnailWidth;
            snapshot.video.thumbnailHeight = old.thumbnailHeight;
            snapshot.video.thumbnailOrigin = 'chosen';
            if (snapshot.video.sourceHashes && old.sourceHashes)
              snapshot.video.sourceHashes.thumbnail =
                old.sourceHashes.thumbnail;
          }
          snapshot.video.thumbnailText = old.thumbnailText;
          snapshot.video.thumbnailTextApproved = old.thumbnailTextApproved;
          snapshot.video.extractionStatus = old.extractionStatus;
          snapshot.video.extractedThumbnailText = old.extractedThumbnailText;
        }
        snapshot.video.channelName = known.channelName;
        snapshot.video.sourceLanguage ??= preferences.sourceLanguage;
        await preflightPlan(repo, snapshot, preferences);
      }
      return { checked: value.videoIds.length };
    }
    case 'settings':
      await assertPaused();
      await repo.putSettings(value.settings);
      return;
    case 'preferences':
      await assertPaused();
      await repo.putPreferences(value.preferences);
      return;
    case 'generate':
    case 'apply': {
      await assertPaused();
      const jobs = await Promise.all(value.jobIds.map(getJob));
      const channels = new Set(jobs.map((job) => job.channelId));
      if (channels.size !== 1) throw new Error('Run one channel at a time.');
      for (const job of jobs) {
        const preferences = await repo.preferences(job.channelId);
        if (preferences) job.enabledComponents = preferences.components;
        await repo.putJob(job);
      }
      const previous = await repo.run();
      const run = {
        ...defaultRun(),
        workingTabId: previous.workingTabId,
        channelId: jobs[0].channelId,
        mode:
          value.type === 'generate'
            ? ('generate' as const)
            : ('apply' as const),
        epoch: previous.epoch + 1,
        jobIds: value.jobIds,
        requestLimit: (await repo.settings()).provider.requestLimit,
      };
      await repo.putRun(run);
      void chrome.alarms.create('localizer-tick', { periodInMinutes: 0.5 });
      return;
    }
    case 'pause':
      await repo.pause();
      return;
    case 'edit': {
      await assertPaused();
      const job = await getJob(value.jobId);
      const slot = job.slots[value.component];
      if (
        value.component === 'thumbnail' ||
        !slot ||
        slot.generation !== 'generated' ||
        ['verified', 'preserved', 'stale'].includes(slot.application)
      )
        throw new Error(
          'This text cannot be edited. Generate a missing component first.',
        );
      if (value.component === 'title' && value.value.length > 100)
        throw new Error('Titles must be 100 characters or fewer.');
      slot.value = value.value;
      slot.application = 'pending';
      slot.assetHash = await hash(value.value);
      await repo.putJob(job);
      return;
    }
    case 'approve': {
      await assertPaused();
      const job = await getJob(value.jobId);
      const slot = job.slots[value.component];
      if (
        !slot ||
        slot.generation !== 'generated' ||
        slot.lastEvidence?.state !== 'missing' ||
        ['stale', 'preserved', 'verified'].includes(slot.application)
      )
        throw new Error(
          'Check that this generated component is still missing before approving it.',
        );
      if (value.component !== 'thumbnail' && !slot.value?.trim())
        throw new Error('Enter a nonempty translation before approving.');
      slot.application = value.approved ? 'approved' : 'pending';
      await repo.putJob(job);
      return;
    }
    case 'wording': {
      await assertPaused();
      const job = await getJob(value.jobId);
      if (value.strings.length !== (job.source.thumbnailText?.length ?? 0))
        throw new Error(
          'Keep one translation for each source thumbnail text block.',
        );
      if (value.approved && value.strings.some((s) => !s.trim()))
        throw new Error('Fill each thumbnail text block before approving.');
      if (
        ['waiting', 'submitting'].includes(
          job.slots.thumbnail?.generation ?? '',
        )
      )
        throw new Error(
          'Wait for the existing image request before changing its wording.',
        );
      if (
        job.slots.thumbnail?.generation === 'generated' &&
        JSON.stringify(job.thumbnailStrings) !== JSON.stringify(value.strings)
      ) {
        job.slots.thumbnail.application = 'stale';
        job.slots.thumbnail.error =
          'Thumbnail wording changed. Regenerate the image before approving it.';
      }
      job.thumbnailStrings = value.strings;
      job.wordingApproved = value.approved;
      await repo.putJob(job);
      return;
    }
    case 'source-text': {
      await assertPaused();
      const video = await repo.video(value.videoId);
      if (!video) throw new Error('Check this video first.');
      const jobs = (await repo.jobs()).filter(
        (job) => job.videoId === video.id && job.channelId === video.channelId,
      );
      if (
        jobs.some((job) =>
          ['waiting', 'submitting'].includes(
            job.slots.thumbnail?.generation ?? '',
          ),
        )
      )
        throw new Error(
          'Wait for the existing image request before changing its source text.',
        );
      const unchanged =
        JSON.stringify(video.thumbnailText) === JSON.stringify(value.strings);
      video.thumbnailText = value.strings;
      video.thumbnailTextApproved = true;
      await repo.putVideo(video);
      if (unchanged) return;
      for (const job of jobs) {
        job.source.thumbnailText = value.strings;
        job.source.thumbnailTextApproved = true;
        job.thumbnailStrings = undefined;
        job.wordingApproved = false;
        const slot = job.slots.thumbnail;
        if (slot?.generation === 'generated') slot.application = 'stale';
        if (
          slot?.generation === 'not-needed' &&
          slot.application !== 'preserved'
        ) {
          slot.generation = 'queued';
          slot.application = 'pending';
        }
        await repo.putJob(job);
      }
      return;
    }
    case 'extract-text': {
      await assertPaused();
      const video = await repo.video(value.videoId);
      const asset = video?.thumbnailAssetId
        ? await repo.asset(video.thumbnailAssetId)
        : undefined;
      if (!video || !asset)
        throw new Error('Cache or choose a source image first.');
      if (video.extractionStatus === 'generated')
        return video.extractedThumbnailText ?? [];
      if (['ambiguous', 'submitting'].includes(video.extractionStatus ?? ''))
        throw new Error(
          'The earlier paid extraction has an uncertain outcome. Check your provider dashboard, then enter the thumbnail text manually.',
        );
      const settings = (await repo.settings()).provider;
      if (!settings.vision)
        throw new Error(
          'This model has no vision. Enter the visible thumbnail text manually.',
        );
      video.extractionStatus = 'submitting';
      await repo.putVideo(video);
      try {
        const strings = await extractThumbnailText(
          settings,
          (await credentials()).textKey,
          await dataUrl(asset.blob),
        );
        video.extractedThumbnailText = strings;
        video.extractionStatus = 'generated';
        await repo.putVideo(video);
        return strings;
      } catch (error) {
        video.extractionStatus =
          error instanceof ProviderError && error.outcome === 'rejected'
            ? 'error'
            : 'ambiguous';
        await repo.putVideo(video);
        throw error;
      }
    }
    case 'source-image': {
      await assertPaused();
      const video = await repo.video(value.videoId);
      const asset = await repo.asset(value.assetId);
      if (!video || !asset)
        throw new Error('This video or image is unavailable.');
      const jobs = (await repo.jobs()).filter(
        (job) => job.videoId === video.id && job.channelId === video.channelId,
      );
      if (
        jobs.some((job) =>
          ['waiting', 'submitting'].includes(
            job.slots.thumbnail?.generation ?? '',
          ),
        )
      )
        throw new Error(
          'Wait for the current image generation before changing the source image.',
        );
      video.thumbnailOrigin = 'chosen';
      video.extractionStatus = undefined;
      video.extractedThumbnailText = undefined;
      video.thumbnailAssetId = asset.id;
      video.thumbnailWidth = asset.width;
      video.thumbnailHeight = asset.height;
      video.sourceHashes = {
        title: await hash(video.title),
        description: await hash(video.description),
        thumbnail: asset.hash,
      };
      video.thumbnailTextApproved = false;
      video.thumbnailText = undefined;
      await repo.putVideo(video);
      for (const job of await repo.jobs())
        if (job.videoId === video.id) {
          job.source = video;
          job.thumbnailStrings = undefined;
          job.wordingApproved = false;
          const slot = job.slots.thumbnail;
          if (slot) {
            if (
              slot.generation === 'waiting' ||
              slot.generation === 'submitting'
            )
              throw new Error(
                'Wait for the current image generation before changing the source image.',
              );
            slot.sourceHash = asset.hash;
            if (slot.generation === 'generated') slot.application = 'stale';
          }
          await repo.putJob(job);
        }
      return;
    }
    case 'retry': {
      await assertPaused();
      const job = await getJob(value.jobId);
      const slot = job.slots[value.component];
      if (!slot) throw new Error('This component is unavailable.');
      if (slot.generation === 'ambiguous' && !value.acknowledged)
        throw new Error(
          'Confirm you checked the provider dashboard before resubmitting a possibly charged request.',
        );
      if (!['error', 'ambiguous'].includes(slot.generation))
        throw new Error('This generation does not need a retry.');
      const retrySlots =
        value.component === 'thumbnail'
          ? [slot]
          : [job.slots.title, job.slots.description].filter(
              (s) => s && ['error', 'ambiguous'].includes(s.generation),
            );
      for (const retrySlot of retrySlots) {
        if (!retrySlot) continue;
        retrySlot.generation = 'queued';
        retrySlot.application = 'pending';
        retrySlot.error = undefined;
      }
      if (value.component === 'thumbnail') job.falRequest = undefined;
      await repo.putJob(job);
      return;
    }
    case 'regenerate-text': {
      await assertPaused();
      const job = await getJob(value.jobId);
      const video = await repo.video(job.videoId);
      if (!video?.checkedAt || !video.sourceHashes)
        throw new Error(
          'Run a fresh Studio check before regenerating changed source text.',
        );
      const slot = job.slots[value.component];
      if (
        !slot ||
        slot.application !== 'stale' ||
        slot.lastEvidence?.state !== 'missing'
      )
        throw new Error(
          'Only missing translations with a changed source can be regenerated. Existing Studio text is preserved.',
        );
      for (const component of ['title', 'description'] as const) {
        const candidate = job.slots[component];
        if (
          candidate?.application === 'stale' &&
          candidate.lastEvidence?.state === 'missing'
        ) {
          candidate.sourceHash = video.sourceHashes[component];
          candidate.generation = 'queued';
          candidate.application = 'pending';
          candidate.error = undefined;
        }
      }
      job.source = video;
      job.sourceLanguage = video.sourceLanguage ?? job.sourceLanguage;
      await repo.putJob(job);
      return;
    }
    case 'regenerate-image': {
      await assertPaused();
      const job = await getJob(value.jobId);
      const slot = job.slots.thumbnail;
      if (
        !slot ||
        !['generated', 'error', 'not-needed'].includes(slot.generation) ||
        ['preserved', 'verified'].includes(slot.application)
      )
        throw new Error(
          'Resolve any outstanding image request before regenerating.',
        );
      const video = await repo.video(job.videoId);
      if (!video?.checkedAt || !video.sourceHashes)
        throw new Error('Recheck this video before regenerating its image.');
      if (slot.sourceHash !== video.sourceHashes.thumbnail) {
        job.source = video;
        slot.sourceHash = video.sourceHashes.thumbnail;
        job.thumbnailStrings = undefined;
        job.wordingApproved = false;
      }
      job.correction = value.correction;
      job.falRequest = undefined;
      slot.generation = 'queued';
      slot.application = 'pending';
      slot.error = undefined;
      await repo.putJob(job);
      return;
    }
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (sender.tab && sender.url?.startsWith('https://studio.youtube.com/')) {
    if (
      message?.type === 'writer-active' &&
      typeof message.epoch === 'number'
    ) {
      void repo.run().then((run) =>
        sendResponse({
          active:
            sender.frameId === 0 &&
            run.mode === 'apply' &&
            run.epoch === message.epoch &&
            sender.tab?.id === run.workingTabId,
        }),
      );
      return true;
    }
    return;
  }
  const trustedPages = ['sidepanel.html', 'review.html', 'options.html'].map(
    (page) => chrome.runtime.getURL(page),
  );
  const senderUrl = sender.url;
  if (
    !senderUrl ||
    !trustedPages.some(
      (url) => senderUrl === url || senderUrl.startsWith(`${url}?`),
    )
  )
    return;
  const parsed = commandSchema.safeParse(message);
  if (!parsed.success) {
    sendResponse({ ok: false, error: 'Invalid extension command.' });
    return;
  }
  if (parsed.data.type === 'pause') {
    void repo.pause().then(() => sendResponse({ ok: true }));
    return true;
  }
  void ready
    .then(() =>
      navigator.locks.request('localizer-coordinator', () =>
        execute(parsed.data),
      ),
    )
    .then((data) => {
      sendResponse({ ok: true, data });
      if (parsed.data.type === 'generate' || parsed.data.type === 'apply')
        kick();
    })
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'The operation failed.',
      }),
    );
  return true;
});
