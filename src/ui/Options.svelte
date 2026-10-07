<script lang="ts">
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
  let imageKey = $state('');
  let falKey = $state('');
  let saved = $state({ text: false, image: false, fal: false });
  let busy = $state(false);
  let error = $state('');
  let message = $state('');
  onMount(() => {
    if (isExtension())
      void credentials().then(
        (value) =>
          (saved = {
            text: !!value.textKey,
            image: !!value.imageKey,
            fal: !!value.falKey,
          }),
      );
  });
  const provider = $derived(
    (values: Partial<Settings['provider']>) =>
      (draft = { ...settings, provider: { ...settings.provider, ...values } }),
  );
  async function action(fn: () => Promise<unknown>) {
    busy = true;
    error = '';
    message = '';
    try {
      await fn();
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save.';
    } finally {
      busy = false;
    }
  }
  async function save() {
    if (!isExtension())
      throw new Error('Load the extension to save connections.');
    const parsed = settingsSchema.parse(settings);
    parsed.provider.baseUrl = providerBase(parsed.provider.baseUrl);
    const origins = providerOrigins(
      parsed.provider.baseUrl,
      parsed.provider.imageProvider !== 'openai',
    );
    if (parsed.provider.imageProvider === 'openai')
      origins.push('https://api.openai.com/*');
    if (
      !(await extensionApi().permissions.request({
        origins: [...new Set(origins)],
      }))
    )
      throw new Error('Provider access was declined.');
    const current = await credentials();
    const changedEndpoint =
      parsed.provider.baseUrl !== workspace.settings.provider.baseUrl ||
      parsed.provider.protocol !== workspace.settings.provider.protocol;
    if (
      changedEndpoint &&
      !textKey &&
      current.textKey &&
      parsed.provider.auth !== 'none'
    )
      throw new Error('Enter a key for the new provider.');
    const keys = {
      textKey: textKey || current.textKey,
      imageKey: imageKey || current.imageKey,
      falKey: falKey || current.falKey,
    };
    await command({ type: 'settings', settings: parsed });
    await saveCredentials(keys, parsed.rememberCredentials);
    if (channel)
      await command({
        type: 'preferences',
        preferences: preferencesSchema.parse(prefs),
      });
    textKey = '';
    imageKey = '';
    falKey = '';
    saved = {
      text: !!keys.textKey,
      image: !!keys.imageKey,
      fal: !!keys.falKey,
    };
    draft = undefined;
    preferenceDraft = undefined;
    message = 'Saved';
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
  {#if storageError}<Notice error>{storageError}</Notice>{/if}{#if error}<Notice
      error>{error}</Notice
    >{/if}{#if message}<Notice>{message}</Notice>{/if}
  <form
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
              provider({
                preset,
                protocol: preset === 'anthropic' ? 'anthropic' : 'openai',
                baseUrl:
                  preset === 'anthropic'
                    ? 'https://api.anthropic.com/v1'
                    : 'https://api.openai.com/v1',
                model:
                  preset === 'anthropic' ? 'claude-sonnet-5-5' : 'gpt-4.1-mini',
              });
            }}
            ><option value="openai">OpenAI</option><option value="anthropic"
              >Anthropic</option
            ><option value="custom">Custom endpoint</option></NativeSelect
          ></label
        ><label
          >API key <Input
            type="password"
            autocomplete="off"
            value={textKey}
            oninput={(e) => (textKey = e.currentTarget.value)}
            placeholder={saved.text
              ? 'Saved. Leave blank to keep.'
              : 'Paste your API key'}
          ></Input></label
        >
      </div>
      <label
        >Thumbnails <NativeSelect
          value={settings.provider.imageProvider}
          onchange={(e) =>
            provider({
              imageProvider: e.currentTarget
                .value as Settings['provider']['imageProvider'],
            })}
          ><option value="openai">GPT Image 2.5</option><option value="fal"
            >Fal image edit</option
          ><option value="layerize">Ideogram editable text</option
          ></NativeSelect
        ></label
      >{#if settings.provider.imageProvider !== 'openai'}<label
          >Fal key <Input
            type="password"
            autocomplete="off"
            value={falKey}
            oninput={(e) => (falKey = e.currentTarget.value)}
            placeholder={saved.fal
              ? 'Saved. Leave blank to keep.'
              : 'Fal API key'}
          ></Input></label
        >{/if}{#if settings.provider.protocol !== 'openai' || settings.provider.baseUrl.replace(/\/$/, '') !== 'https://api.openai.com/v1'}<label
          >OpenAI key for images <Input
            type="password"
            value={imageKey}
            oninput={(e) => (imageKey = e.currentTarget.value)}
            placeholder={saved.image
              ? 'Saved. Leave blank to keep.'
              : 'OpenAI API key'}
          ></Input></label
        >{/if}
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
          <label
            >Text model <Input
              value={settings.provider.model}
              oninput={(e) => provider({ model: e.currentTarget.value })}
            ></Input></label
          ><label
            >Base URL <Input
              type="url"
              value={settings.provider.baseUrl}
              oninput={(e) => provider({ baseUrl: e.currentTarget.value })}
            ></Input></label
          ><label
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
          ><label
            >Authentication <NativeSelect
              value={settings.provider.auth}
              onchange={(e) =>
                provider({ auth: e.currentTarget.value as 'bearer' | 'none' })}
              ><option value="bearer">API key</option><option value="none"
                >None</option
              ></NativeSelect
            ></label
          >{#if settings.provider.imageProvider === 'openai'}<label
              >Image model <NativeSelect
                value={settings.provider.imageModel}
                onchange={(e) =>
                  provider({
                    imageModel: e.currentTarget
                      .value as Settings['provider']['imageModel'],
                  })}
                ><option value="gpt-image-2.5-sunburst"
                  >GPT Image 2.5 Sunburst
                </option><option value="gpt-image-2.5-flare"
                  >GPT Image 2.5 Flare
                </option></NativeSelect
              ></label
            ><label
              >Image quality <NativeSelect
                value={settings.provider.imageQuality}
                onchange={(e) =>
                  provider({
                    imageQuality: e.currentTarget
                      .value as Settings['provider']['imageQuality'],
                  })}
                >{#each ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as v (v)}<option
                    value={v}>{v}</option
                  >{/each}</NativeSelect
              ></label
            >{:else}{#if settings.provider.imageProvider === 'fal'}<label
                >Fal model <NativeSelect
                  value={settings.provider.falModel}
                  onchange={(e) =>
                    provider({
                      falModel: e.currentTarget
                        .value as Settings['provider']['falModel'],
                    })}
                  ><option value="ideogram/v4.5/edit"
                    >Ideogram 4.5 Edit
                  </option><option value="fal-ai/nano-banana-pro/edit"
                    >Nano Banana Pro
                  </option><option value="fal-ai/nano-banana/edit"
                    >Nano Banana
                  </option></NativeSelect
                ></label
              >{#if settings.provider.falModel === 'ideogram/v4.5/edit'}<label
                  >Ideogram quality <NativeSelect
                    value={settings.provider.ideogramQuality}
                    onchange={(e) =>
                      provider({
                        ideogramQuality: e.currentTarget
                          .value as Settings['provider']['ideogramQuality'],
                      })}
                    >{#each ['very_low', 'low', 'medium', 'high'] as v (v)}<option
                        value={v}>{v.replace('_', ' ')}</option
                      >{/each}</NativeSelect
                  ></label
                ><label
                  >Edit precision <NativeSelect
                    value={settings.provider.ideogramPrecision}
                    onchange={(e) =>
                      provider({
                        ideogramPrecision: e.currentTarget.value as
                          'regular' | 'high',
                      })}
                    ><option value="high"
                      >High · preserve other pixels
                    </option><option value="regular">Regular</option
                    ></NativeSelect
                  ></label
                >{:else}<label
                  >Resolution <NativeSelect
                    value={settings.provider.imageResolution}
                    onchange={(e) =>
                      provider({
                        imageResolution: e.currentTarget.value as '1K' | '2K',
                      })}
                    ><option value="1K">1K</option><option value="2K">2K</option
                    ></NativeSelect
                  ></label
                >{/if}{/if}{/if}
        </div>
        <label class="checkbox-label"
          ><CheckboxInput
            checked={settings.provider.vision}
            onchange={(e) => provider({ vision: e.currentTarget.checked })}
          />Text model supports images
        </label><label class="checkbox-label"
          ><CheckboxInput
            checked={settings.rememberCredentials}
            onchange={(e) =>
              (draft = {
                ...settings,
                rememberCredentials: e.currentTarget.checked,
              })}
          />Remember keys on this device
        </label><label
          >Requests per run <Input
            type="number"
            min={1}
            max={1000}
            value={settings.provider.requestLimit}
            oninput={(e) =>
              provider({ requestLimit: Number(e.currentTarget.value) })}
          ></Input></label
        >{#if channel}<label
            >Glossary <Textarea
              rows={3}
              value={prefs.glossary}
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
      <Button class="primary" intent="focal" {disabled}
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
                navigator.locks.request('localizer-coordinator', () =>
                  importArchive(repository, file),
                ),
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
            saved = { text: false, image: false, fal: false };
          })}
        >Forget keys
      </Button>
    </div>
  </details>
</main>
