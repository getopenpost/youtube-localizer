<script lang="ts">
  import { extensionApi } from '../platform/webextension';

  import { onMount } from 'svelte';
  import {
    Button,
    Input,
    ThemeIcon,
    NativeSelect,
    CheckboxInput,
  } from '@openpost/ui';
  import { preferencesSchema, type StudioContext } from '../core/model';
  import { videoStatus } from '../core/planner';
  import { languageName } from '../core/languages';
  import { command } from '../platform/messages';
  import { openPage, isExtension } from './shared';
  import AssetImage from './AssetImage.svelte';
  import Notice from './Notice.svelte';
  import { workspaceStore, refresh } from './workspace';
  let workspace = $derived($workspaceStore.workspace);
  let loading = $derived($workspaceStore.loading);
  let storageError = $derived($workspaceStore.storageError);
  let cachedSelection = $state(false);
  let liveContext = $state<StudioContext>();
  let selected = $state<string[]>([]);
  let filter = $state('all');
  let query = $state('');
  let busy = $state('');
  let error = $state('');
  const active = $derived(workspace.run.mode !== 'paused');
  async function act(label: string, task: () => Promise<unknown>) {
    busy = label;
    error = '';
    try {
      await task();
      await refresh();
    } catch (e) {
      error =
        e instanceof Error ? e.message : 'Could not complete this action.';
    } finally {
      busy = '';
    }
  }
  async function discover() {
    const data = await command<StudioContext>({ type: 'discover' });
    cachedSelection = false;
    liveContext = data;
    selected = data.scope === 'video' ? data.videos.map((v) => v.id) : [];
    filter = 'all';
  }
  onMount(() => {
    if (isExtension())
      void command<StudioContext>({ type: 'discover' })
        .then((data) => {
          liveContext = data;
          selected = data.scope === 'video' ? data.videos.map((v) => v.id) : [];
        })
        .catch(() => {});
  });
  const savedAccount = $derived(
    workspace.accounts.find((a) => a.channelId === workspace.activeChannel),
  );
  const context = $derived(
    liveContext ??
      (savedAccount
        ? {
            channelId: savedAccount.channelId,
            channelName: savedAccount.channelName,
            videos: workspace.videos.filter(
              (v) => v.channelId === savedAccount.channelId,
            ),
            scope: 'page' as const,
          }
        : undefined),
  );
  const cached = $derived(cachedSelection || !liveContext);
  const channel = $derived(
    context?.channelId ?? workspace.activeChannel ?? workspace.run.channelId,
  );
  const prefs = $derived(
    workspace.preferences.find((p) => p.channelId === channel) ??
      preferencesSchema.parse({ channelId: channel ?? '' }),
  );
  const videos = $derived(
    context
      ? context.videos.map(
          (v) => workspace.videos.find((saved) => saved.id === v.id) ?? v,
        )
      : [],
  );
  const visible = $derived(
    videos.filter(
      (v) =>
        (!query || v.title.toLowerCase().includes(query.toLowerCase())) &&
        (filter === 'all' ||
          v.visibility === filter ||
          (filter === 'needs' &&
            ['Missing languages', 'Source changed', 'Needs attention'].includes(
              videoStatus(v, workspace.jobs, prefs),
            ))),
    ),
  );
  const jobs = $derived(
    workspace.jobs.filter(
      (job) =>
        selected.includes(job.videoId) &&
        job.channelId === channel &&
        prefs.targetLanguages.includes(job.language),
    ),
  );
  const checked = $derived(
    selected.length > 0 &&
      selected.every(
        (id) =>
          !!videos.find((v) => v.id === id)?.checkedAt &&
          jobs.some((job) => job.videoId === id),
      ),
  );
  const generated = $derived(
    jobs.some((job) =>
      prefs.components.some((c) => job.slots[c]?.generation === 'generated'),
    ),
  );
  const hasEvidence = $derived(
    videos.some((v) => videoStatus(v, workspace.jobs, prefs) !== 'Not checked'),
  );
  async function next() {
    if (generated) {
      openPage('review');
      return;
    }
    if (!context) return;
    if (!checked) {
      await command({
        type: 'preflight',
        channelId: context.channelId,
        videoIds: selected,
      });
      return;
    }
    await command({ type: 'generate', jobIds: jobs.map((job) => job.id) });
  }
</script>

<main class="panel-body compact-panel">
  {#if storageError}<Notice error>{storageError}</Notice>{/if}{#if error}<Notice
      error>{error}</Notice
    >{/if}{#if !active && workspace.run.reason && !['Generation finished', 'Approved items', 'Paused.'].some( (prefix) => workspace.run.reason.startsWith(prefix) )}<Notice
      error>{workspace.run.reason}</Notice
    >{/if}{#if workspace.accounts.length > 1}<div class="account-bar">
      <label class="sr-only" for="account-picker"
        >YouTube account / channel
      </label><NativeSelect
        id="account-picker"
        value={channel ?? workspace.accounts[0]?.channelId}
        disabled={active || !!busy}
        onchange={(e) =>
          void act('Switching channel', async () => {
            const id = e.currentTarget.value;
            await command({ type: 'select-channel', channelId: id });
            const account = workspace.accounts.find((a) => a.channelId === id)!;
            selected = [];
            cachedSelection = true;
            liveContext = {
              channelId: id,
              channelName: account.channelName,
              videos: workspace.videos.filter((v) => v.channelId === id),
              scope: 'page',
            };
            try {
              cachedSelection = false;
              liveContext = await command<StudioContext>({
                type: 'discover',
                channelId: id,
              });
            } catch {
              /* Cached selection remains available; preflight verifies the account. */
            }
          })}
        >{#each workspace.accounts as account (account.channelId)}<option
            value={account.channelId}>{account.channelName}</option
          >{/each}</NativeSelect
      ><Button
        class="text-button"
        intent="quiet"
        disabled={active || !!busy}
        onclick={() =>
          void extensionApi().tabs.create({
            url: 'https://studio.youtube.com/',
            active: true,
          })}
        >Add account
      </Button>
    </div>{/if}{#if loading}<p role="status">
      Loading…
    </p>{:else}{#if !context}<section class="empty-state">
        <h1>Open YouTube Studio</h1>
        <p>Choose a video or your channel’s Content page.</p>
        <Button
          class="primary"
          intent="focal"
          onclick={() => {
            if (isExtension())
              void extensionApi().tabs.create({
                url: 'https://studio.youtube.com/',
                active: true,
              });
          }}
          >Open YouTube Studio <ThemeIcon
            role="external-link"
            width={15}
            height={15}
          ></ThemeIcon></Button
        ><Button
          class="text-button"
          intent="quiet"
          disabled={!!busy}
          onclick={() => void act('Reading Studio', discover)}
          >Read current Studio page
        </Button>
      </section>{:else}<div class="channel-section">
        <div>
          <h1 class={workspace.accounts.length > 1 ? 'sr-only' : undefined}>
            {context.channelName}
          </h1>
          <span class="help"
            >{cached
              ? `${videos.length} saved videos`
              : context.scope === 'video'
                ? 'Current video'
                : `${videos.length} on this page`}</span
          >
        </div>
        {#if workspace.accounts.length <= 1}<Button
            class="text-button"
            intent="quiet"
            disabled={active || !!busy}
            onclick={() =>
              void extensionApi().tabs.create({
                url: 'https://studio.youtube.com/',
                active: true,
              })}
            >Add account
          </Button>{/if}<Button
          class="icon-button"
          intent="quiet"
          size="icon"
          aria-label="Refresh videos from Studio"
          disabled={active || !!busy}
          onclick={() => void act('Refreshing', discover)}
          ><ThemeIcon role="refresh" width={17} height={17}></ThemeIcon></Button
        >
      </div>
      <Button
        class="language-summary"
        intent="quiet"
        onclick={() => openPage('options')}
        >{prefs.targetLanguages.map(languageName).join(', ') ||
          'Choose languages'} <span>Change</span></Button
      >
      <div class="list-controls">
        <NativeSelect
          aria-label="Filter videos"
          value={filter}
          onchange={(e) => (filter = e.currentTarget.value)}
          ><option value="all">All videos</option><option
            value="needs"
            disabled={!hasEvidence}
            >Needs localization
          </option><option value="scheduled">Scheduled</option><option
            value="published">Published</option
          ></NativeSelect
        ><label class="search-box"
          ><ThemeIcon role="search" width={16} height={16}></ThemeIcon><Input
            aria-label="Search videos"
            placeholder="Search"
            value={query}
            oninput={(e) => (query = e.currentTarget.value)}
          ></Input></label
        >
      </div>
      <div class="list-toolbar">
        <label class="checkbox-label"
          ><CheckboxInput
            disabled={!visible.length || active}
            checked={visible.length > 0 &&
              visible.every((v) => selected.includes(v.id))}
            onchange={(e) =>
              (selected = e.currentTarget.checked
                ? [...new Set([...selected, ...visible.map((v) => v.id)])]
                : selected.filter((id) => !visible.some((v) => v.id === id)))}
          />Select visible
        </label><span>{selected.length} selected</span>
      </div>
      <ul class="video-list">
        {#each visible as video (video.id)}<li>
            <label class="video-row"
              ><CheckboxInput
                disabled={active || !!busy}
                checked={selected.includes(video.id)}
                onchange={(e) =>
                  (selected = e.currentTarget.checked
                    ? [...selected, video.id]
                    : selected.filter((id) => id !== video.id))}
              /><AssetImage
                assetId={video.thumbnailAssetId}
                alt={`Thumbnail for ${video.title}`}
                class="video-thumbnail"
              ></AssetImage><span class="video-info"
                ><strong dir="auto">{video.title}</strong><span
                  class="video-meta"
                  ><span class={`visibility ${video.visibility}`}
                    >{video.visibility === 'unknown'
                      ? ''
                      : video.visibility}</span
                  >{#if video.scheduledAt}<span>{video.scheduledAt}</span
                    >{/if}</span
                ><span class="video-state"
                  >{videoStatus(video, workspace.jobs, prefs)}</span
                ></span
              ></label
            >
          </li>{/each}
      </ul>
      {#if !visible.length}<p class="empty-list">No matching videos.</p>{/if}
      <div class="panel-actions">
        {#if active}<p role="status">
            {workspace.run.mode === 'generate' ? 'Generating…' : 'Applying…'}
          </p>
          <Button
            class="secondary"
            intent="ordinary"
            onclick={() =>
              void act('Pausing', () => command({ type: 'pause' }))}
            ><ThemeIcon role="controls" width={16} height={16}></ThemeIcon>Pause
          </Button><Button
            class="text-button"
            intent="quiet"
            onclick={() => openPage('review')}
            >Open review
          </Button>{:else}<Button
            class="primary"
            intent="focal"
            disabled={!selected.length || !!busy}
            onclick={() =>
              void act(!checked ? 'Checking translations' : 'Starting', next)}
            >{busy ||
              (generated
                ? 'Review translations'
                : checked
                  ? 'Generate missing'
                  : 'Check missing translations')}<ThemeIcon
              role="arrow-right"
              width={16}
              height={16}
            ></ThemeIcon></Button
          >{#if checked && !generated}<Button
              class="text-button"
              intent="quiet"
              onclick={() => openPage('review')}
              >Review missing items
            </Button>{/if}{/if}
      </div>{/if}{/if}
</main>
