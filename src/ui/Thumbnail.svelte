<script lang="ts">
  import { extensionApi } from '../platform/webextension';

  import {
    Button,
    Input,
    Textarea,
    ThemeIcon,
    NativeSelect,
    CheckboxInput,
  } from '@openpost/ui';
  import { download, openPage, isExtension } from './shared';
  import AssetImage from './AssetImage.svelte';
  import Notice from './Notice.svelte';
  import { repository } from '../core/storage';
  import { referenceAsset } from '../platform/images';
  import { command } from '../platform/messages';
  import { credentials, saveCredentials } from '../platform/credentials';
  import { MAX_REFERENCES, type Reference } from '../thumbnails/model';
  import { workspaceStore, refresh } from './workspace';
  let workspace = $derived($workspaceStore.workspace);
  let loading = $derived($workspaceStore.loading);
  let storageError = $derived($workspaceStore.storageError);
  const query = new URLSearchParams(location.search);
  let selectedVideo = $state(query.get('video') ?? '');
  const video = $derived(
    workspace.videos.find(
      (v) =>
        v.id === selectedVideo &&
        (!query.get('channel') || v.channelId === query.get('channel')),
    ),
  );
  const creations = $derived(
    workspace.creations
      .filter(
        (c) =>
          c.video.id === video?.id && c.video.channelId === video?.channelId,
      )
      .sort((a, b) => b.createdAt - a.createdAt),
  );
  const latest = $derived(creations[0]);
  let promptDraft = $state<string>();
  const prompt = $derived(
    promptDraft ??
      latest?.prompt ??
      "Create a clear, bold thumbnail for this video. Use a short headline in the video's language.",
  );
  let selection = $state<string[]>();
  const selected = $derived(
    (selection ?? latest?.references.map((r) => r.id) ?? []).filter((id) =>
      workspace.references.some((r) => r.id === id),
    ),
  );
  let useCurrent = $state(false);
  let key = $state('');
  let busy = $state('');
  let error = $state('');
  let acknowledged = $state(false);
  let chosen = $state<string>();
  let sourceUsed = $state('');
  const result = $derived(
    creations.find((c) => c.id === chosen) ??
      creations.find((c) => c.state === 'generated'),
  );
  const pending = $derived(creations.some((c) => c.state === 'submitting'));
  const uncertain = $derived(
    creations.some((c) => c.state === 'ambiguous' && !c.retryAcknowledged),
  );
  const disabled = $derived(
    !!busy || workspace.run.mode !== 'paused' || pending,
  );
  async function action(label: string, task: () => Promise<unknown>) {
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
  async function add(files: FileList) {
    if (!isExtension())
      throw new Error('Load the extension to save references.');
    const next = [...selected];
    for (const file of [...files]) {
      const asset = await referenceAsset(file);
      await repository.putAsset(asset);
      const reference = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Reference',
        kind: 'person' as const,
      };
      await command({ type: 'reference-save', reference });
      if (next.length < MAX_REFERENCES) next.push(reference.id);
    }
    selection = next;
  }
  async function generate() {
    if (!isExtension())
      throw new Error('Load the extension to generate thumbnails.');
    if (!video)
      throw new Error('Open a video from Studio to generate its thumbnail.');
    if (
      !(await extensionApi().permissions.request({
        origins: ['https://api.openai.com/*'],
      }))
    )
      throw new Error('OpenAI access was declined.');
    if (key) {
      await saveCredentials(
        { ...(await credentials()), imageKey: key },
        workspace.settings.rememberCredentials,
      );
      key = '';
    }
    const creation = await command<{
      id: string;
      state: string;
      error?: string;
    }>({
      type: 'thumbnail-generate',
      id: crypto.randomUUID(),
      videoId: video.id,
      prompt,
      referenceIds: selected,
      useCurrent,
      acknowledged,
    });
    acknowledged = false;
    if (creation.state === 'generated') chosen = creation.id;
    if (creation.error) throw new Error(creation.error);
  }
</script>

<main class="thumbnail-page">
  <div class="page-heading"><h1>Generate thumbnail</h1></div>
  {#if storageError}<Notice error>{storageError}</Notice>{/if}{#if error}<Notice
      error>{error}</Notice
    >{/if}{#if loading}<p role="status">Loading…</p>{:else}<div
      class="thumbnail-composer"
    >
      <section class="thumbnail-inputs" aria-label="Thumbnail direction">
        {#if video}<h2 dir="auto">{video.title}</h2>{:else}<label
            >Video <NativeSelect
              value={selectedVideo}
              {disabled}
              onchange={(e) => {
                selectedVideo = e.currentTarget.value;
                promptDraft = undefined;
                selection = undefined;
                chosen = undefined;
              }}
              ><option value="">Choose a connected video</option
              >{#each workspace.videos as v (v.id)}<option value={v.id}
                  >{v.channelName} · {v.title}</option
                >{/each}</NativeSelect
            ></label
          >{/if}<label class="thumbnail-direction"
          >What should it look like? <Textarea
            rows={5}
            maxlength={6000}
            value={prompt}
            {disabled}
            oninput={(e) => (promptDraft = e.currentTarget.value)}
            placeholder="Scene, layout and headline"
          ></Textarea></label
        >
        <div class="reference-heading">
          <h3>References</h3>
          <label class="file-button text-button"
            ><ThemeIcon role="image-add" width={16} height={16}></ThemeIcon>Add
            images
            <input
              aria-label="Add reference images"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              {disabled}
              onchange={(e) => {
                const files = e.currentTarget.files;
                if (files?.length)
                  void action('Adding images', () => add(files));
                e.currentTarget.value = '';
              }}
            /></label
          >
        </div>
        {#if workspace.references.length}<div class="reference-grid">
            {#each workspace.references as reference (reference.id)}<label
                class={`reference-tile ${selected.includes(reference.id) ? 'selected' : ''}`}
                ><AssetImage assetId={reference.assetId} alt={reference.name}
                ></AssetImage><span
                  ><CheckboxInput
                    aria-label={`Use reference ${reference.name}`}
                    checked={selected.includes(reference.id)}
                    disabled={disabled ||
                      (!selected.includes(reference.id) &&
                        selected.length >= MAX_REFERENCES)}
                    onchange={(e) =>
                      (selection = e.currentTarget.checked
                        ? [...selected, reference.id]
                        : selected.filter((id) => id !== reference.id))}
                  />{reference.name}</span
                ></label
              >{/each}
          </div>{:else}{/if}{#if !!workspace.references.length}<details
            class="reference-manager"
          >
            <summary>Manage references</summary
            >{#each workspace.references as reference (reference.id)}<div
                class="reference-management-row"
              >
                <label
                  ><span class="sr-only">Name for {reference.name}</span><Input
                    defaultValue={reference.name}
                    maxlength={80}
                    {disabled}
                    onblur={(e) => {
                      if (e.currentTarget.value !== reference.name)
                        void action('Saving reference', () =>
                          command({
                            type: 'reference-save',
                            reference: {
                              ...reference,
                              name: e.currentTarget.value,
                            },
                          }),
                        );
                    }}
                  ></Input></label
                ><label
                  ><span class="sr-only">Role for {reference.name}</span
                  ><NativeSelect
                    value={reference.kind}
                    {disabled}
                    onchange={(e) =>
                      void action('Saving reference', () =>
                        command({
                          type: 'reference-save',
                          reference: {
                            ...reference,
                            kind: e.currentTarget.value as Reference['kind'],
                          },
                        }),
                      )}
                    ><option value="person">Person</option><option value="style"
                      >Style</option
                    ><option value="brand">Brand</option></NativeSelect
                  ></label
                ><Button
                  class="icon-button"
                  intent="quiet"
                  size="icon"
                  {disabled}
                  aria-label={`Remove reference ${reference.name}`}
                  onclick={() =>
                    void action('Removing reference', () =>
                      command({
                        type: 'reference-remove',
                        id: reference.id,
                      }),
                    )}
                  ><ThemeIcon role="delete" width={16} height={16}
                  ></ThemeIcon></Button
                >
              </div>{/each}
          </details>{/if}{#if video?.thumbnailAssetId}<label
            class="checkbox-label current-thumbnail-reference"
            ><CheckboxInput
              checked={useCurrent}
              {disabled}
              onchange={(e) => (useCurrent = e.currentTarget.checked)}
            />Use source thumbnail as a reference
          </label>{/if}
        <details class="thumbnail-connection">
          <summary>OpenAI connection</summary><label
            >OpenAI API key <Input
              type="password"
              autocomplete="off"
              value={key}
              oninput={(e) => (key = e.currentTarget.value)}
              placeholder="Leave blank to use the saved key"
              {disabled}
            ></Input></label
          ><Button
            class="text-button"
            intent="quiet"
            onclick={() => openPage('options')}
            ><ThemeIcon role="settings" width={14} height={14}></ThemeIcon>Model
            & quality
          </Button>
        </details>
        {#if uncertain}<label class="checkbox-label"
            ><CheckboxInput
              checked={acknowledged}
              {disabled}
              onchange={(e) => (acknowledged = e.currentTarget.checked)}
            />I checked OpenAI and accept a possible second charge.
          </label>{/if}<Button
          class="primary generate-thumbnail"
          intent="focal"
          disabled={disabled ||
            !video ||
            !prompt.trim() ||
            (uncertain && !acknowledged)}
          onclick={() => void action('Generating', generate)}
          >{pending || busy === 'Generating'
            ? 'Generating…'
            : 'Generate'}</Button
        ><span class="help"
          >{workspace.settings.provider.imageModel === 'gpt-image-2.5-flare'
            ? 'GPT Image 2.5 Flare'
            : 'GPT Image 2.5 Sunburst'}</span
        >
      </section>
      <section class="thumbnail-output" aria-label="Generated thumbnails">
        {#if result?.assetId}<AssetImage
            assetId={result.assetId}
            alt={`Generated thumbnail for ${video?.title}`}
            class="generated-original"
          ></AssetImage>
          <div class="thumbnail-output-actions">
            <Button
              class="secondary"
              intent="ordinary"
              onclick={() =>
                void action('Downloading', async () => {
                  const asset = await repository.asset(result.assetId!);
                  if (asset)
                    download(asset.blob, `${result.video.id}-thumbnail.jpg`);
                })}
              ><ThemeIcon role="download" width={16} height={16}
              ></ThemeIcon>Download
            </Button><Button
              class="secondary"
              intent="ordinary"
              {disabled}
              onclick={() =>
                void action('Choosing thumbnail', async () => {
                  await command({
                    type: 'source-image',
                    videoId: result.video.id,
                    assetId: result.assetId!,
                  });
                  sourceUsed = result.id;
                })}
              >{sourceUsed === result.id
                ? 'Selected for localization'
                : 'Use for localization'}</Button
            >
          </div>{:else}<div class="thumbnail-output-empty">
            <ThemeIcon role="image-add" width={28} height={28}></ThemeIcon>
            <p>
              {pending
                ? 'Generating your thumbnail…'
                : 'Your thumbnail will appear here.'}
            </p>
          </div>{/if}{#if !!creations.length}<div class="thumbnail-variants">
            {#each creations as creation (creation.id)}{#if creation.assetId}<Button
                  class={`thumbnail-variant ${creation.id === result?.id ? 'selected' : ''}`}
                  aria-label={`View thumbnail from ${new Date(creation.createdAt).toLocaleTimeString()}`}
                  aria-pressed={creation.id === result?.id}
                  onclick={() => (chosen = creation.id)}
                  ><AssetImage assetId={creation.assetId} alt=""
                  ></AssetImage></Button
                >{:else}<p
                  class="help"
                  role={creation.state === 'submitting' ? 'status' : undefined}
                >
                  {creation.state === 'submitting'
                    ? 'Generating…'
                    : (creation.error ?? 'Generation failed.')}
                </p>{/if}{/each}
          </div>{/if}
      </section>
    </div>{/if}
</main>
