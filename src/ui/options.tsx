import { useState, useEffect } from 'react';
import {
  KeyRound,
  Check,
  ArrowUpRight,
  Search,
  Download,
  Upload,
} from 'lucide-react';
import { languages, languageName } from '../core/languages';
import {
  preferencesSchema,
  settingsSchema,
  type Component,
  type Settings,
} from '../core/model';
import { command } from '../platform/messages';
import {
  credentials,
  forgetCredentials,
  providerOrigins,
  saveCredentials,
  providerBase,
} from '../platform/credentials';
import { exportArchive, importArchive } from '../core/archive';
import { repository } from '../core/storage';
import { useWorkspace } from './use-workspace';
import { DownloadButton, Notice, isExtension } from './shared';
export function Options() {
  const { workspace, refresh, storageError } = useWorkspace();
  const [draft, setDraft] = useState<Settings>();
  const settings = draft ?? workspace.settings;
  const [channelId, setChannelId] = useState('');
  const channel =
    channelId ||
    workspace.run.channelId ||
    workspace.videos[0]?.channelId ||
    '';
  const existing = workspace.preferences.find((p) => p.channelId === channel);
  const [preferenceDraft, setPreferenceDraft] =
    useState<ReturnType<typeof preferencesSchema.parse>>();
  const prefs =
    preferenceDraft?.channelId === channel
      ? preferenceDraft
      : (existing ?? preferencesSchema.parse({ channelId: channel }));
  const [query, setQuery] = useState('');
  const [textKey, setTextKey] = useState('');
  const [falKey, setFalKey] = useState('');
  const [savedKeys, setSavedKeys] = useState({ text: false, fal: false });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (isExtension())
      void credentials().then((value) =>
        setSavedKeys({ text: !!value.textKey, fal: !!value.falKey }),
      );
  }, []);
  const update = (value: Partial<Settings>) =>
    setDraft({ ...settings, ...value });
  const provider = (value: Partial<Settings['provider']>) =>
    update({ provider: { ...settings.provider, ...value } });
  async function action(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    setMessage('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusy('');
    }
  }
  async function save() {
    if (!isExtension())
      throw new Error(
        'This is a browser preview. Load the extension in Chrome to save provider credentials.',
      );
    const parsed = settingsSchema.parse(settings);
    parsed.provider.baseUrl = providerBase(parsed.provider.baseUrl);
    const granted = await chrome.permissions.request({
      origins: providerOrigins(
        parsed.provider.baseUrl,
        !!falKey || savedKeys.fal,
      ),
    });
    if (!granted)
      throw new Error(
        'Provider access was not granted. Your settings have not been saved.',
      );
    const current = await credentials();
    const keys = {
      textKey: textKey || current.textKey,
      falKey: falKey || current.falKey,
    };
    await command({ type: 'settings', settings: parsed });
    await saveCredentials(keys, parsed.rememberCredentials);
    if (channel)
      await command({
        type: 'preferences',
        preferences: preferencesSchema.parse(prefs),
      });
    setSavedKeys({ text: !!keys.textKey, fal: !!keys.falKey });
    setTextKey('');
    setFalKey('');
    setDraft(undefined);
    setPreferenceDraft(undefined);
    setMessage(
      'Settings saved. Your keys are available only to this extension.',
    );
  }
  const channels = [
    ...new Map(
      workspace.videos.map((video) => [video.channelId, video.channelName]),
    ).entries(),
  ];
  const filtered = languages.filter(
    (language) =>
      language.code !== prefs.sourceLanguage &&
      `${language.name} ${language.code}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main className="settings-page">
      <div className="page-heading">
        <h1>
          Your providers.
          <br />
          Your workflow.
        </h1>
        <p>
          Bring API access from your provider. A ChatGPT or Claude subscription
          does not include API usage.
        </p>
      </div>
      {storageError && <Notice error>{storageError}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {workspace.run.mode !== 'paused' && (
        <Notice>
          Pause the batch before changing preferences or provider settings.
        </Notice>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action('Saving settings', save);
        }}
      >
        <fieldset disabled={workspace.run.mode !== 'paused' || !!busy}>
          <legend>Text provider</legend>
          <p>Titles, descriptions and thumbnail wording use this provider.</p>
          <div className="form-grid">
            <label>
              Provider
              <select
                value={settings.provider.preset}
                onChange={(event) => {
                  const preset = event.target
                    .value as Settings['provider']['preset'];
                  provider({
                    preset,
                    protocol: preset === 'anthropic' ? 'anthropic' : 'openai',
                    baseUrl:
                      preset === 'anthropic'
                        ? 'https://api.anthropic.com/v1'
                        : preset === 'openai'
                          ? 'https://api.openai.com/v1'
                          : settings.provider.baseUrl,
                    model:
                      preset === 'anthropic'
                        ? 'claude-sonnet-5-5'
                        : preset === 'openai'
                          ? 'gpt-4.1-mini'
                          : settings.provider.model,
                  });
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom">OpenAI-compatible endpoint</option>
              </select>
            </label>
            <label>
              Model
              <input
                required
                value={settings.provider.model}
                onChange={(e) => provider({ model: e.target.value })}
              />
            </label>
            <label className="full-width">
              API key
              <span className="input-icon">
                <KeyRound size={16} />
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    savedKeys.text
                      ? 'A key is saved. Leave blank to keep it.'
                      : 'Paste your provider API key'
                  }
                  value={textKey}
                  onChange={(e) => setTextKey(e.target.value)}
                />
              </span>
            </label>
          </div>
          <details className="advanced">
            <summary>Endpoint & compatibility</summary>
            <label>
              Base URL
              <input
                type="url"
                required
                value={settings.provider.baseUrl}
                onChange={(e) => provider({ baseUrl: e.target.value })}
              />
            </label>
            <label>
              Protocol
              <select
                value={settings.provider.protocol}
                onChange={(e) =>
                  provider({
                    protocol: e.target.value as 'openai' | 'anthropic',
                  })
                }
              >
                <option value="openai">OpenAI Chat Completions</option>
                <option value="anthropic">Anthropic Messages</option>
              </select>
            </label>
            <label>
              Authentication
              <select
                value={settings.provider.auth}
                onChange={(e) =>
                  provider({ auth: e.target.value as 'bearer' | 'none' })
                }
              >
                <option value="bearer">API key</option>
                <option value="none">No authentication, local server</option>
              </select>
            </label>
            <p>
              Custom domains are requested only when you save them. HTTP is
              supported on localhost only.
            </p>
          </details>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.provider.vision}
              onChange={(e) => provider({ vision: e.target.checked })}
            />
            This model can read thumbnail images
          </label>
          <p className="help">
            Without vision, enter thumbnail text manually in review.
          </p>
        </fieldset>
        <fieldset disabled={workspace.run.mode !== 'paused' || !!busy}>
          <legend>
            Thumbnail provider <span className="optional">Optional</span>
          </legend>
          <p>
            Fal edits the same source image for each language. Text-only batches
            do not need a Fal key.
          </p>
          <label>
            Fal API key
            <input
              type="password"
              autoComplete="off"
              placeholder={
                savedKeys.fal
                  ? 'A Fal key is saved. Leave blank to keep it.'
                  : 'Paste your Fal API key'
              }
              value={falKey}
              onChange={(e) => setFalKey(e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              Editing model
              <select
                value={settings.provider.falModel}
                onChange={(e) =>
                  provider({
                    falModel: e.target
                      .value as Settings['provider']['falModel'],
                  })
                }
              >
                <option value="fal-ai/nano-banana-pro/edit">
                  Nano Banana Pro
                </option>
                <option value="fal-ai/nano-banana/edit">Nano Banana</option>
              </select>
            </label>
            <label>
              Generation resolution
              <select
                value={settings.provider.imageResolution}
                onChange={(e) =>
                  provider({ imageResolution: e.target.value as '1K' | '2K' })
                }
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
              </select>
            </label>
          </div>
          <p className="help">
            Uploads are prepared as 1280 × 720 JPEGs. You approve the wording
            before image generation. Review faces and composition before
            uploading.
          </p>
        </fieldset>
        <fieldset disabled={workspace.run.mode !== 'paused' || !!busy}>
          <legend>Channel preferences</legend>
          {channels.length ? (
            <label>
              Channel
              <select
                value={channel}
                onChange={(e) => {
                  setChannelId(e.target.value);
                  setPreferenceDraft(undefined);
                }}
              >
                {channels.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Notice>
              Read a Studio page from the side panel first. Source language,
              targets and glossary are saved separately for each channel.
            </Notice>
          )}
          {channel && (
            <>
              <label>
                Fallback source language
                <select
                  value={prefs.sourceLanguage}
                  onChange={(e) =>
                    setPreferenceDraft({
                      ...prefs,
                      sourceLanguage: e.target.value,
                      targetLanguages: prefs.targetLanguages.filter(
                        (code) => code !== e.target.value,
                      ),
                    })
                  }
                >
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="help">
                The video’s declared language takes priority. This confirmed
                fallback is used when Studio does not expose one.
              </p>
              <div className="selected-languages">
                {prefs.targetLanguages.map((code) => (
                  <button
                    type="button"
                    key={code}
                    onClick={() =>
                      setPreferenceDraft({
                        ...prefs,
                        targetLanguages: prefs.targetLanguages.filter(
                          (value) => value !== code,
                        ),
                      })
                    }
                    aria-label={`Remove ${languageName(code)}`}
                  >
                    {languageName(code)} <span aria-hidden="true">×</span>
                  </button>
                ))}
                {!prefs.targetLanguages.length && (
                  <p>Choose at least one target language.</p>
                )}
              </div>
              <label className="search-box">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search YouTube languages"
                  aria-label="Search target languages"
                />
              </label>
              <div className="language-picker" aria-label="Target languages">
                {filtered.map((language) => (
                  <label key={language.code} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={prefs.targetLanguages.includes(language.code)}
                      onChange={(e) =>
                        setPreferenceDraft({
                          ...prefs,
                          targetLanguages: e.target.checked
                            ? [...prefs.targetLanguages, language.code]
                            : prefs.targetLanguages.filter(
                                (value) => value !== language.code,
                              ),
                        })
                      }
                    />
                    {language.name}
                  </label>
                ))}
              </div>
              <p className="help">
                Codes come from YouTube’s picker. Preflight checks availability
                for each video. Unavailable languages stay visible and block
                generation.
              </p>
              <div className="component-picker">
                <span>Components</span>
                {(['title', 'description', 'thumbnail'] as Component[]).map(
                  (component) => (
                    <label key={component} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={prefs.components.includes(component)}
                        onChange={(e) =>
                          setPreferenceDraft({
                            ...prefs,
                            components: e.target.checked
                              ? [...prefs.components, component]
                              : prefs.components.filter((c) => c !== component),
                          })
                        }
                      />
                      {component === 'title'
                        ? 'Titles'
                        : component === 'description'
                          ? 'Descriptions'
                          : 'Thumbnails'}
                    </label>
                  ),
                )}
              </div>
              <label>
                Glossary & phrases to preserve
                <textarea
                  rows={4}
                  value={prefs.glossary}
                  onChange={(e) =>
                    setPreferenceDraft({ ...prefs, glossary: e.target.value })
                  }
                  placeholder="Names, brands, phrases and preferred translations"
                  maxLength={6000}
                />
              </label>
            </>
          )}
        </fieldset>
        <fieldset disabled={workspace.run.mode !== 'paused' || !!busy}>
          <legend>Credentials & request limit</legend>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.rememberCredentials}
              onChange={(e) =>
                update({ rememberCredentials: e.target.checked })
              }
            />
            Remember keys on this device
          </label>
          <p className="help">
            Default: this browser session only. Remembered keys use local
            browser storage, not an OS secret vault. Keys never use Chrome Sync
            and are excluded from backups.
          </p>
          <label>
            Maximum new paid requests per run
            <input
              type="number"
              min="1"
              max="1000"
              value={settings.provider.requestLimit}
              onChange={(e) =>
                provider({ requestLimit: Number(e.target.value) })
              }
            />
          </label>
          <p className="help">
            This is a request count, not a price estimate. Provider charges
            vary. Pausing stops new requests; submitted requests can continue.
          </p>
        </fieldset>
        <div className="save-row">
          <button
            className="primary"
            type="submit"
            disabled={workspace.run.mode !== 'paused' || !!busy}
          >
            <Check size={17} />
            {busy || 'Save settings'}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={!!busy}
            onClick={() =>
              void action('Forgetting keys', async () => {
                if (isExtension()) await forgetCredentials();
                setSavedKeys({ text: false, fal: false });
                setMessage('Provider keys removed from this extension.');
              })
            }
          >
            Forget saved keys
          </button>
        </div>
      </form>
      <section className="backup-section">
        <h2>Keep a portable backup</h2>
        <p>
          Export history and images before uninstalling. Imports merge cached
          work, preserve existing local records, and require a fresh Studio
          check before applying.
        </p>
        <div className="backup-actions">
          <DownloadButton
            blob={() => exportArchive(repository)}
            name="youtube-localizer-backup.zip"
          >
            <Download size={16} />
            Export backup
          </DownloadButton>
          <label className="file-button secondary">
            <Upload size={16} />
            Import backup
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={workspace.run.mode !== 'paused' || !!busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void action('Importing backup', async () => {
                    await navigator.locks.request('localizer-coordinator', () =>
                      importArchive(repository, file),
                    );
                    setMessage(
                      'Backup imported as a cache. Run preflight again before continuing.',
                    );
                  });
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </section>
      <section className="openpost-section">
        <h2>More of your workflow, in OpenPost.</h2>
        <p>Plan content, edit media and publish across your social accounts.</p>
        <a
          className="secondary"
          href="https://openpo.st/?utm_source=youtube-localizer&utm_medium=extension&utm_campaign=onboarding"
          target="_blank"
          rel="noreferrer"
        >
          Explore OpenPost <ArrowUpRight size={16} />
        </a>
      </section>
    </main>
  );
}
