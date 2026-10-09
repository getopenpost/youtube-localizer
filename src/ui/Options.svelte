<script lang="ts">
  import { toast } from 'svelte-sonner';
  import {
    textProviderPresets,
    falImageModels,
    falImageModelSchema,
  } from '../core/providers';
  import { extensionApi } from '../platform/webextension';

  import { onMount } from 'svelte';
  import {
    Button,
    Input,
    Textarea,
    ThemeIcon,
    NativeSelect,
    CheckboxInput,
  } from '@openpost/ui';
  import { languages, languageName } from '../core/languages';
  import {
    preferencesSchema,
    settingsSchema,
    type Settings,
    type Component,
  } from '../core/model';
  import { command } from '../platform/messages';
  import {
    credentials,
    saveCredentials,
    forgetCredentials,
    providerBase,
    providerOrigins,
  } from '../platform/credentials';
  import { repository } from '../core/storage';
  import { exportArchive, importArchive } from '../core/archive';
  import { isExtension } from './shared';
  import Notice from './Notice.svelte';
  import DownloadButton from './DownloadButton.svelte';
  import { workspaceStore, refresh } from './workspace';
  let workspace = $derived($workspaceStore.workspace);
  let storageError = $derived($workspaceStore.storageError);
  let draft = $state<Settings>();
  const settings = $derived(draft ?? workspace.settings);
  let selectedChannel = $state('');
  const channel = $derived(
    selectedChannel ||
      workspace.activeChannel ||
      workspace.run.channelId ||
      workspace.videos[0]?.channelId ||
      '',
  );
  const existing = $derived(
    workspace.preferences.find((p) => p.channelId === channel),
  );
  let preferenceDraft = $state<ReturnType<typeof preferencesSchema.parse>>();
  const prefs = $derived(
    preferenceDraft?.channelId === channel
      ? preferenceDraft
      : (existing ?? preferencesSchema.parse({ channelId: channel })),
  );
  let query = $state('');
  let textKey = $state('');
  let falKey = $state('');
  let saved = $state({ text: false, fal: false });
  let busy = $state(false);
  onMount(() => {
    if (isExtension())
      void credentials()
        .then(
          (value) =>
            (saved = {
              text: !!value.textKey,
              fal: !!value.falKey,
            }),
        )
        .catch(() => toast.error('Could not read saved keys.'));
  });
  const provider = $derived(
    (values: Partial<Settings['provider']>) =>
      (draft = { ...settings, provider: { ...settings.provider, ...values } }),
  );
  async function action(fn: () => Promise<unknown>) {
    busy = true;
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      busy = false;
    }
  }
  async function save() {
    if (!isExtension())
      throw new Error('Load the extension to save connections.');
    const validated = settingsSchema.safeParse(settings);
    if (!validated.success) {
      const field = validated.error.issues[0]?.path.at(-1);
      throw new Error(
        field === 'baseUrl'
          ? 'Enter a valid base URL.'
          : field === 'model'
            ? 'Enter a text model.'
            : field === 'requestLimit'
              ? 'Batch limit must be between 1 and 1000.'
              : 'Check the connection settings.',
      );
    }
    const parsed = validated.data;
    parsed.provider.baseUrl = providerBase(parsed.provider.baseUrl);
    const preferences = channel
      ? preferencesSchema.safeParse(prefs)
      : undefined;
    if (preferences && !preferences.success) {
      const field = preferences.error.issues[0]?.path.at(-1);
      throw new Error(
        field === 'components'
          ? 'Select at least one component.'
          : field === 'glossary'
            ? 'Keep translation notes under 6000 characters.'
            : 'Check the source and target languages.',
      );
    }
    const origins = providerOrigins(parsed.provider.baseUrl);
    if (
      !(await extensionApi().permissions.request({
        origins: [...new Set(origins)],
      }))
    )
      throw new Error('Provider access was declined.');
    const current = await credentials();
    const changedEndpoint =
      parsed.provider.baseUrl !==
        providerBase(workspace.settings.provider.baseUrl) ||
      parsed.provider.protocol !== workspace.settings.provider.protocol;
    if (
      changedEndpoint &&
      !textKey &&
      current.textKey &&
      parsed.provider.auth !== 'none'
    )
      throw new Error('Enter a key for the new provider.');
    const keys = {
      textKey: textKey || (changedEndpoint ? '' : current.textKey),
      textBaseUrl: parsed.provider.baseUrl,
      falKey: falKey || current.falKey,
    };
    await command({ type: 'settings', settings: parsed });
    await saveCredentials(keys, parsed.rememberCredentials);
    if (preferences?.success)
      await command({ type: 'preferences', preferences: preferences.data });
    textKey = '';
    falKey = '';
    saved = {
      text: !!keys.textKey,
      fal: !!keys.falKey,
    };
    draft = undefined;
    preferenceDraft = undefined;
    toast.success('Saved');
  }
  const channels = $derived([
    ...new Map(
      [...workspace.accounts, ...workspace.videos].map((v) => [
        v.channelId,
        v.channelName,
      ]),
    ).entries(),
  ]);
  const disabled = $derived(busy || workspace.run.mode !== 'paused');
</script>

<main class="settings-page simple-settings">
  <h1>Settings</h1>
  {#if storageError}<Notice error>{storageError}</Notice>{/if}
  <form
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      void action(save);
    }}
  >
    <fieldset {disabled}>
      <legend>Connection</legend>
      <div class="form-grid">
        <label
          >Text provider <NativeSelect
            value={settings.provider.preset}
            onchange={(e) => {
              const preset = e.currentTarget
                .value as Settings['provider']['preset'];
              provider(
                preset === 'custom'
                  ? { preset }
                  : { preset, ...textProviderPresets[preset] },
              );
            }}
            ><option value="openai">OpenAI</option><option value="openrouter"
              >OpenRouter</option
            ><option value="anthropic">Anthropic</option><option value="custom"
              >Custom endpoint</option
            ></NativeSelect
          ></label
        >
        <label
          >Text model <Input
            value={settings.provider.model}
            oninput={(e) => provider({ model: e.currentTarget.value })}
          /></label
        >
        {#if settings.provider.preset === 'custom'}<label
            >Base URL <Input
              type="url"
              value={settings.provider.baseUrl}
              placeholder="https://your-provider.example/v1"
              oninput={(e) => provider({ baseUrl: e.currentTarget.value })}
            /></label
          >{/if}
        <label
          >API key <Input
            type="password"
            autocomplete="off"
            value={textKey}
            oninput={(e) => (textKey = e.currentTarget.value)}
            placeholder={saved.text
              ? 'Saved. Leave blank to keep.'
              : 'Paste your API key'}
          /></label
        >
      </div>
      <label
        >Thumbnails <NativeSelect
          value={settings.provider.imageProvider === 'layerize'
            ? 'layerize'
            : settings.provider.falModel}
          onchange={(e) => {
            const value = e.currentTarget.value;
            provider(
              value === 'layerize'
                ? { imageProvider: 'layerize' }
                : {
                    imageProvider: 'fal',
                    falModel: falImageModelSchema.parse(value),
                  },
            );
          }}
        >
          {#each Object.entries(falImageModels) as [value, model] (value)}<option
              {value}>{model.label}</option
            >{/each}
          <option value="layerize">Ideogram editable text</option>
        </NativeSelect></label
      >
      <label
        >Fal key <Input
          type="password"
          autocomplete="off"
          value={falKey}
          oninput={(e) => (falKey = e.currentTarget.value)}
          placeholder={saved.fal
            ? 'Saved. Leave blank to keep.'
            : 'Fal API key'}
        /></label
      >
      <label class="checkbox-label"
        ><CheckboxInput
          checked={settings.rememberCredentials}
          onchange={(e) =>
            (draft = {
              ...settings,
              rememberCredentials: e.currentTarget.checked,
            })}
        />Remember keys on this device
      </label>
    </fieldset>
    <fieldset {disabled}>
      <legend>Languages</legend>{#if channels.length > 1}<label
          >Channel <NativeSelect
            value={channel}
            onchange={(e) => {
              selectedChannel = e.currentTarget.value;
              void action(() =>
                command({
                  type: 'select-channel',
                  channelId: e.currentTarget.value,
                }),
              );
              preferenceDraft = undefined;
            }}
            >{#each channels as [id, name] (id)}<option value={id}
                >{name}</option
              >{/each}</NativeSelect
          ></label
        >{/if}{#if channel}<label
          >Source language <NativeSelect
            value={prefs.sourceLanguage}
            onchange={(e) =>
              (preferenceDraft = {
                ...prefs,
                sourceLanguage: e.currentTarget.value,
                targetLanguages: prefs.targetLanguages.filter(
                  (code) => code !== e.currentTarget.value,
                ),
              })}
            >{#each languages as lang (lang.code)}<option value={lang.code}
                >{lang.name}</option
              >{/each}</NativeSelect
          ></label
        >
        <div class="selected-languages">
          {#each prefs.targetLanguages as code (code)}<Button
              type="button"
              aria-label={`Remove ${languageName(code)}`}
              onclick={() =>
                (preferenceDraft = {
                  ...prefs,
                  targetLanguages: prefs.targetLanguages.filter(
                    (c) => c !== code,
                  ),
                })}
              >{languageName(code)} ×
            </Button>{/each}
        </div>
        <label class="search-box"
          ><ThemeIcon role="search" width={16} height={16}></ThemeIcon><Input
            aria-label="Search target languages"
            placeholder="Add languages"
            value={query}
            oninput={(e) => (query = e.currentTarget.value)}
          ></Input></label
        >
        <div class="language-picker">
          {#each languages.filter((lang) => lang.code !== prefs.sourceLanguage && `${lang.name} ${lang.code}`
                .toLowerCase()
                .includes(query.toLowerCase())) as lang (lang.code)}<label
              class="checkbox-label"
              ><CheckboxInput
                checked={prefs.targetLanguages.includes(lang.code)}
                onchange={(e) =>
                  (preferenceDraft = {
                    ...prefs,
                    targetLanguages: e.currentTarget.checked
                      ? [...prefs.targetLanguages, lang.code]
                      : prefs.targetLanguages.filter((c) => c !== lang.code),
                  })}
              />{lang.name}</label
            >{/each}
        </div>
        <div class="component-picker">
          {#each ['title', 'description', 'thumbnail'] as Component[] as c (c)}<label
              class="checkbox-label"
              ><CheckboxInput
                checked={prefs.components.includes(c)}
                onchange={(e) =>
                  (preferenceDraft = {
                    ...prefs,
                    components: e.currentTarget.checked
                      ? [...prefs.components, c]
                      : prefs.components.filter((x) => x !== c),
                  })}
              />{c === 'title'
                ? 'Titles'
                : c === 'description'
                  ? 'Descriptions'
                  : 'Thumbnails'}</label
            >{/each}
        </div>{:else}<p class="help">
          Open a channel in Studio to set its languages.
        </p>{/if}
    </fieldset>
    <details class="settings-advanced">
      <summary>Advanced</summary>
      <fieldset {disabled}>
        <div class="form-grid">
          {#if settings.provider.preset === 'custom'}
            <label
              >Protocol <NativeSelect
                value={settings.provider.protocol}
                onchange={(e) =>
                  provider({
                    protocol: e.currentTarget.value as 'openai' | 'anthropic',
                  })}
                ><option value="openai">Chat Completions</option><option
                  value="anthropic">Messages</option
                ></NativeSelect
              ></label
            >
            <label
              >Authentication <NativeSelect
                value={settings.provider.auth}
                onchange={(e) =>
                  provider({
                    auth: e.currentTarget.value as 'bearer' | 'none',
                  })}
                ><option value="bearer">API key</option><option value="none"
                  >None</option
                ></NativeSelect
              ></label
            >
          {/if}
          {#if settings.provider.imageProvider === 'fal'}
            {#if settings.provider.falModel.startsWith('openai/')}
              <label
                >Image quality <NativeSelect
                  value={settings.provider.imageQuality}
                  onchange={(e) =>
                    provider({
                      imageQuality: e.currentTarget
                        .value as Settings['provider']['imageQuality'],
                    })}
                  >{#each ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as quality (quality)}<option
                      value={quality}>{quality}</option
                    >{/each}</NativeSelect
                ></label
              >
            {:else if settings.provider.falModel === 'ideogram/v4.5/edit'}
              <label
                >Ideogram quality <NativeSelect
                  value={settings.provider.ideogramQuality}
                  onchange={(e) =>
                    provider({
                      ideogramQuality: e.currentTarget
                        .value as Settings['provider']['ideogramQuality'],
                    })}
                  >{#each ['very_low', 'low', 'medium', 'high'] as quality (quality)}<option
                      value={quality}>{quality.replace('_', ' ')}</option
                    >{/each}</NativeSelect
                ></label
              >
              <label
                >Edit precision <NativeSelect
                  value={settings.provider.ideogramPrecision}
                  onchange={(e) =>
                    provider({
                      ideogramPrecision: e.currentTarget.value as
                        'regular' | 'high',
                    })}
                  ><option value="high">High</option><option value="regular"
                    >Regular</option
                  ></NativeSelect
                ></label
              >
            {:else if settings.provider.falModel.includes('-pro')}
              <label
                >Resolution <NativeSelect
                  value={settings.provider.imageResolution}
                  onchange={(e) =>
                    provider({
                      imageResolution: e.currentTarget.value as '1K' | '2K',
                    })}
                  ><option value="1K">1K</option><option value="2K">2K</option
                  ></NativeSelect
                ></label
              >
            {/if}
          {/if}
        </div>
        <label class="checkbox-label"
          ><CheckboxInput
            checked={settings.provider.vision}
            onchange={(e) => provider({ vision: e.currentTarget.checked })}
          />Text model supports images
        </label><label
          >Max paid requests per batch <Input
            type="number"
            min={1}
            max={1000}
            value={settings.provider.requestLimit}
            oninput={(e) =>
              provider({ requestLimit: Number(e.currentTarget.value) })}
          ></Input></label
        >{#if channel}<label
            >Translation notes <Textarea
              rows={3}
              value={prefs.glossary}
              maxlength={6000}
              placeholder="Keep OpenPost unchanged."
              oninput={(e) =>
                (preferenceDraft = {
                  ...prefs,
                  glossary: e.currentTarget.value,
                })}
            ></Textarea></label
          >{/if}
      </fieldset>
    </details>
    <div class="save-row">
      <Button type="submit" class="primary" intent="focal" {disabled}
        >{busy ? 'Saving…' : 'Save'}</Button
      >
    </div>
  </form>
  <details class="settings-advanced">
    <summary>Backup & keys</summary>
    <div class="backup-actions">
      <DownloadButton
        blob={() => exportArchive(repository)}
        name="youtube-localizer-backup.zip"
        >Export backup
      </DownloadButton><label class="file-button secondary"
        ><ThemeIcon role="upload" width={16} height={16}></ThemeIcon>Import
        backup
        <input
          type="file"
          accept=".zip"
          {disabled}
          onchange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file)
              void action(() =>
                (async () => {
                  await navigator.locks.request('localizer-coordinator', () =>
                    importArchive(repository, file),
                  );
                  toast.success('Backup imported');
                })(),
              );
            e.currentTarget.value = '';
          }}
        /></label
      ><Button
        class="text-button"
        intent="quiet"
        onclick={() =>
          void action(async () => {
            await forgetCredentials();
            textKey = '';
            falKey = '';
            toast.success('Keys forgotten');
            saved = { text: false, fal: false };
          })}
        >Forget keys
      </Button>
    </div>
  </details>
</main>
