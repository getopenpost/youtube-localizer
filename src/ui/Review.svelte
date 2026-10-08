<script lang="ts">
  import { Button, ThemeIcon, NativeSelect } from '@openpost/ui';
  import { approvalCount } from '../core/approval';
  import { toast } from 'svelte-sonner';
  import { components } from '../core/model';
  import { languageName } from '../core/languages';
  import { repository } from '../core/storage';
  import { exportGenerated } from '../core/archive';
  import { command } from '../platform/messages';

  import { openPage } from './shared';

  import DownloadButton from './DownloadButton.svelte';
  import Notice from './Notice.svelte';

  import TextReview from './TextReview.svelte';
  import ThumbnailReview from './ThumbnailReview.svelte';
  import Retry from './Retry.svelte';
  import SourceReview from './SourceReview.svelte';
  import { workspaceStore, refresh } from './workspace';
  let workspace = $derived($workspaceStore.workspace);
  let loading = $derived($workspaceStore.loading);
  let storageError = $derived($workspaceStore.storageError);
  let channel = $state('');
  let busy = $state('');
  let error = $state('');
  const active = $derived(workspace.run.mode !== 'paused');
  const channels = $derived([
    ...new Map(
      [...workspace.accounts, ...workspace.videos].map((video) => [
        video.channelId,
        video.channelName,
      ]),
    ).entries(),
  ]);
  const channelId = $derived(
    channel ||
      workspace.activeChannel ||
      workspace.run.channelId ||
      channels[0]?.[0],
  );
  const prefs = $derived(
    workspace.preferences.find((value) => value.channelId === channelId),
  );
  const jobs = $derived(
    workspace.jobs.filter(
      (job) =>
        job.channelId === channelId &&
        (!prefs || prefs.targetLanguages.includes(job.language)),
    ),
  );
  const videos = $derived(
    workspace.videos.filter((video) =>
      jobs.some((job) => job.videoId === video.id),
    ),
  );
  const languageCount = $derived(new Set(jobs.map((job) => job.language)).size);
  const approved = $derived(
    jobs
      .flatMap((job) =>
        (prefs?.components ?? job.enabledComponents ?? components).flatMap(
          (component) => (job.slots[component] ? [job.slots[component]!] : []),
        ),
      )
      .filter((slot) => slot.application === 'approved').length,
  );
  async function action(fn: () => Promise<unknown>) {
    busy = 'Working';
    error = '';
    try {
      await fn();
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : 'The action failed.';
    } finally {
      busy = '';
    }
  }
  let dirty = $state<Record<string, boolean>>({});
  function draftChanged(id: string, value: boolean) {
    if (!!dirty[id] === value) return;
    dirty = { ...dirty, [id]: value };
  }
  const unsaved = $derived(
    jobs.some((job) =>
      ['title', 'description', 'wording'].some(
        (component) => dirty[`${job.id}/${component}`],
      ),
    ),
  );
  const ready = $derived(
    jobs.reduce(
      (count, job) =>
        count +
        approvalCount(
          job,
          prefs?.components ?? job.enabledComponents ?? components,
        ),
      0,
    ),
  );
  async function approveGenerated() {
    const result = await command<{ approved: number; wordings: number }>({
      type: 'approve-all',
      jobIds: jobs.map((job) => job.id),
    });
    toast.success(`${result.approved + result.wordings} approved`);
  }
  const disabled = $derived(active || !!busy);
</script>

<main class="review-page">
  <div class="page-heading review-heading">
    <div><h1>Review translations</h1></div>
    {#if channels.length > 1}<label
        >Channel <NativeSelect
          value={channelId}
          disabled={active || !!busy}
          onchange={(e) => {
            channel = e.currentTarget.value;
            void action(() =>
              command({
                type: 'select-channel',
                channelId: e.currentTarget.value,
              }),
            );
          }}
          >{#each channels as [id, name] (id)}<option value={id}>{name}</option
            >{/each}</NativeSelect
        ></label
      >{/if}
  </div>
  {#if storageError}<Notice error>{storageError}</Notice>{/if}{#if error}<Notice
      error>{error}</Notice
    >{/if}{#if loading}<p role="status">
      Loading your local work…
    </p>{:else}{#if !jobs.length}<section class="empty-state wide">
        <h2>Nothing to review yet</h2>
        <p>
          Choose videos in the side panel and check their existing translations.
          Generated wording and images will appear here.
        </p>
        <Button
          class="secondary"
          intent="ordinary"
          onclick={() => openPage('sidepanel')}
          >Open video selection <ThemeIcon
            role="arrow-right"
            width={16}
            height={16}
          ></ThemeIcon></Button
        >
      </section>{:else}<div class="review-toolbar">
        <span
          >{videos.length}
          {videos.length === 1 ? 'video' : 'videos'} · {languageCount}
          {languageCount === 1 ? 'language' : 'languages'} · {approved} approved
        </span>
        <div>
          {#if !active && ready}<Button
              intent="focal"
              disabled={disabled || unsaved}
              title={unsaved ? 'Save your edits first' : undefined}
              onclick={() => void action(approveGenerated)}>Approve all</Button
            >{/if}
          {#if active}<Button
              class="secondary"
              intent="ordinary"
              onclick={() => void action(() => command({ type: 'pause' }))}
              ><ThemeIcon role="controls" width={16} height={16}
              ></ThemeIcon>Pause run
            </Button>{:else}<Button
              class="secondary"
              intent="ordinary"
              {disabled}
              onclick={() =>
                void action(() =>
                  command({
                    type: 'generate',
                    jobIds: jobs.map((job) => job.id),
                  }),
                )}
              ><ThemeIcon role="sparkles" width={16} height={16}
              ></ThemeIcon>Generate missing
            </Button>{/if}<DownloadButton
            blob={() =>
              exportGenerated(repository, {
                jobIds: jobs.map((job) => job.id),
              })}
            name="youtube-localizer-assets.zip"
            >Download assets
          </DownloadButton>
        </div>
      </div>
      {#if active}<Notice
          >{workspace.run.mode === 'generate'
            ? 'Generating…'
            : 'Applying… Keep Studio visible.'}
          {workspace.run.requestsUsed}/{workspace.run.requestLimit} new paid requests.
        </Notice>{/if}{#if !active && workspace.run.reason && !workspace.run.reason.startsWith('Generation finished') && !workspace.run.reason.startsWith('Approved items')}<p
          class="run-reason"
          role="status"
        >
          {workspace.run.reason}
        </p>{/if}{#each videos as video (video.id)}<section
          class="video-review"
        >
          <SourceReview
            {video}
            layerMode={workspace.settings.provider.imageProvider === 'layerize'}
            template={workspace.templates.find(
              (t) => t.id === video.thumbnailAssetId,
            )}
            withThumbnails={jobs.some(
              (job) =>
                job.videoId === video.id &&
                (
                  prefs?.components ??
                  job.enabledComponents ??
                  components
                ).includes('thumbnail') &&
                !!job.slots.thumbnail,
            )}
            {disabled}
            onAction={action}
          ></SourceReview>
          <div class="language-reviews">
            {#each jobs.filter((job) => job.videoId === video.id) as job (job.id)}<article
                class="language-review"
              >
                <div class="language-heading">
                  <h2>{languageName(job.language)}</h2>
                  <span>{job.language}</span>
                </div>
                {#each prefs?.components ?? job.enabledComponents ?? components as component (component)}{@const slot =
                    job.slots[component]}{#if !!slot}<div>
                      {#if component === 'thumbnail'}<ThumbnailReview
                          authuser={workspace.accounts.find(
                            (a) => a.channelId === job.channelId,
                          )?.authuser}
                          local={workspace.settings.provider.imageProvider ===
                            'layerize'}
                          {job}
                          {slot}
                          {disabled}
                          onAction={action}
                          onDirty={draftChanged}
                        ></ThumbnailReview>{:else}<TextReview
                          {job}
                          {component}
                          {slot}
                          {disabled}
                          onAction={action}
                          onDirty={draftChanged}
                        ></TextReview>{/if}<Retry
                        {job}
                        {component}
                        {slot}
                        {disabled}
                        onAction={action}
                      ></Retry>
                    </div>{/if}{/each}
              </article>{/each}
          </div>
        </section>{/each}
      <div class="review-bottom-actions">
        <span>{approved} components approved</span><Button
          class="primary"
          intent="focal"
          disabled={disabled || !approved}
          onclick={() =>
            void action(() =>
              command({ type: 'apply', jobIds: jobs.map((job) => job.id) }),
            )}
          >Apply approved <ThemeIcon role="arrow-right" width={16} height={16}
          ></ThemeIcon></Button
        >
      </div>{/if}{/if}
</main>
