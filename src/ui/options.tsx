import { useState, useEffect } from 'react';
import { Search, ArrowUpRight, Upload } from 'lucide-react';
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
import { useWorkspace } from './use-workspace';
import { Notice, DownloadButton, isExtension } from './shared';
export function Options() {
  const { workspace, refresh, storageError } = useWorkspace();
  const [draft, setDraft] = useState<Settings>();
  const settings = draft ?? workspace.settings;
  const [selectedChannel, setSelectedChannel] = useState('');
  const channel =
    selectedChannel ||
    workspace.activeChannel ||
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
  const [imageKey, setImageKey] = useState('');
  const [falKey, setFalKey] = useState('');
  const [saved, setSaved] = useState({ text: false, image: false, fal: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (isExtension())
      void credentials().then((value) =>
        setSaved({
          text: !!value.textKey,
          image: !!value.imageKey,
          fal: !!value.falKey,
        }),
      );
  }, []);
  const provider = (values: Partial<Settings['provider']>) =>
    setDraft({ ...settings, provider: { ...settings.provider, ...values } });
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
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
    if (!(await chrome.permissions.request({ origins: [...new Set(origins)] })))
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
    setTextKey('');
    setImageKey('');
    setFalKey('');
    setSaved({
      text: !!keys.textKey,
      image: !!keys.imageKey,
      fal: !!keys.falKey,
    });
    setDraft(undefined);
    setPreferenceDraft(undefined);
    setMessage('Saved');
  }
  const channels = [
    ...new Map(
      [...workspace.accounts, ...workspace.videos].map((v) => [
        v.channelId,
        v.channelName,
      ]),
    ).entries(),
  ];
  const disabled = busy || workspace.run.mode !== 'paused';
  return (
    <main className="settings-page simple-settings">
      <h1>Settings</h1>
      {storageError && <Notice error>{storageError}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(save);
        }}
      >
        <fieldset disabled={disabled}>
          <legend>Connection</legend>
          <div className="form-grid">
            <label>
              Text provider
              <select
                value={settings.provider.preset}
                onChange={(e) => {
                  const preset = e.target
                    .value as Settings['provider']['preset'];
                  provider({
                    preset,
                    protocol: preset === 'anthropic' ? 'anthropic' : 'openai',
                    baseUrl:
                      preset === 'anthropic'
                        ? 'https://api.anthropic.com/v1'
                        : 'https://api.openai.com/v1',
                    model:
                      preset === 'anthropic'
                        ? 'claude-sonnet-5-5'
                        : 'gpt-4.1-mini',
                  });
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom">Custom endpoint</option>
              </select>
            </label>
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                value={textKey}
                onChange={(e) => setTextKey(e.target.value)}
                placeholder={
                  saved.text
                    ? 'Saved. Leave blank to keep.'
                    : 'Paste your API key'
                }
              />
            </label>
          </div>
          <label>
            Thumbnails
            <select
              value={settings.provider.imageProvider}
              onChange={(e) =>
                provider({
                  imageProvider: e.target
                    .value as Settings['provider']['imageProvider'],
                })
              }
            >
              <option value="openai">GPT Image 2.5</option>
              <option value="fal">Fal image edit</option>
              <option value="layerize">Ideogram editable text</option>
            </select>
          </label>
          {settings.provider.imageProvider !== 'openai' && (
            <label>
              Fal key
              <input
                type="password"
                autoComplete="off"
                value={falKey}
                onChange={(e) => setFalKey(e.target.value)}
                placeholder={
                  saved.fal ? 'Saved. Leave blank to keep.' : 'Fal API key'
                }
              />
            </label>
          )}
          {settings.provider.imageProvider === 'openai' &&
            (settings.provider.protocol !== 'openai' ||
              settings.provider.baseUrl.replace(/\/$/, '') !==
                'https://api.openai.com/v1') && (
              <label>
                OpenAI key for images
                <input
                  type="password"
                  value={imageKey}
                  onChange={(e) => setImageKey(e.target.value)}
                  placeholder={
                    saved.image
                      ? 'Saved. Leave blank to keep.'
                      : 'OpenAI API key'
                  }
                />
              </label>
            )}
        </fieldset>
        <fieldset disabled={disabled}>
          <legend>Languages</legend>
          {channels.length > 1 && (
            <label>
              Channel
              <select
                value={channel}
                onChange={(e) => {
                  setSelectedChannel(e.target.value);
                  void action(() =>
                    command({
                      type: 'select-channel',
                      channelId: e.target.value,
                    }),
                  );
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
          )}
          {channel ? (
            <>
              <label>
                Source language
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
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="selected-languages">
                {prefs.targetLanguages.map((code) => (
                  <button
                    type="button"
                    key={code}
                    aria-label={`Remove ${languageName(code)}`}
                    onClick={() =>
                      setPreferenceDraft({
                        ...prefs,
                        targetLanguages: prefs.targetLanguages.filter(
                          (c) => c !== code,
                        ),
                      })
                    }
                  >
                    {languageName(code)} ×
                  </button>
                ))}
              </div>
              <label className="search-box">
                <Search size={16} />
                <input
                  aria-label="Search target languages"
                  placeholder="Add languages"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="language-picker">
                {languages
                  .filter(
                    (lang) =>
                      lang.code !== prefs.sourceLanguage &&
                      `${lang.name} ${lang.code}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .map((lang) => (
                    <label className="checkbox-label" key={lang.code}>
                      <input
                        type="checkbox"
                        checked={prefs.targetLanguages.includes(lang.code)}
                        onChange={(e) =>
                          setPreferenceDraft({
                            ...prefs,
                            targetLanguages: e.target.checked
                              ? [...prefs.targetLanguages, lang.code]
                              : prefs.targetLanguages.filter(
                                  (c) => c !== lang.code,
                                ),
                          })
                        }
                      />
                      {lang.name}
                    </label>
                  ))}
              </div>
              <div className="component-picker">
                {(['title', 'description', 'thumbnail'] as Component[]).map(
                  (c) => (
                    <label key={c} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={prefs.components.includes(c)}
                        onChange={(e) =>
                          setPreferenceDraft({
                            ...prefs,
                            components: e.target.checked
                              ? [...prefs.components, c]
                              : prefs.components.filter((x) => x !== c),
                          })
                        }
                      />
                      {c === 'title'
                        ? 'Titles'
                        : c === 'description'
                          ? 'Descriptions'
                          : 'Thumbnails'}
                    </label>
                  ),
                )}
              </div>
            </>
          ) : (
            <p className="help">
              Open a channel in Studio to set its languages.
            </p>
          )}
        </fieldset>
        <details className="settings-advanced">
          <summary>Advanced</summary>
          <fieldset disabled={disabled}>
            <div className="form-grid">
              <label>
                Text model
                <input
                  value={settings.provider.model}
                  onChange={(e) => provider({ model: e.target.value })}
                />
              </label>
              <label>
                Base URL
                <input
                  type="url"
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
                  <option value="openai">Chat Completions</option>
                  <option value="anthropic">Messages</option>
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
                  <option value="none">None</option>
                </select>
              </label>
              {settings.provider.imageProvider === 'openai' ? (
                <>
                  <label>
                    Image model
                    <select
                      value={settings.provider.imageModel}
                      onChange={(e) =>
                        provider({
                          imageModel: e.target
                            .value as Settings['provider']['imageModel'],
                        })
                      }
                    >
                      <option value="gpt-image-2.5-sunburst">
                        GPT Image 2.5 Sunburst
                      </option>
                      <option value="gpt-image-2.5-flare">
                        GPT Image 2.5 Flare
                      </option>
                    </select>
                  </label>
                  <label>
                    Image quality
                    <select
                      value={settings.provider.imageQuality}
                      onChange={(e) =>
                        provider({
                          imageQuality: e.target
                            .value as Settings['provider']['imageQuality'],
                        })
                      }
                    >
                      {['auto', 'low', 'medium', 'high', 'xhigh', 'max'].map(
                        (v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  {settings.provider.imageProvider === 'fal' && (
                    <>
                      <label>
                        Fal model
                        <select
                          value={settings.provider.falModel}
                          onChange={(e) =>
                            provider({
                              falModel: e.target
                                .value as Settings['provider']['falModel'],
                            })
                          }
                        >
                          <option value="ideogram/v4.5/edit">
                            Ideogram 4.5 Edit
                          </option>
                          <option value="fal-ai/nano-banana-pro/edit">
                            Nano Banana Pro
                          </option>
                          <option value="fal-ai/nano-banana/edit">
                            Nano Banana
                          </option>
                        </select>
                      </label>
                      {settings.provider.falModel === 'ideogram/v4.5/edit' ? (
                        <>
                          <label>
                            Ideogram quality
                            <select
                              value={settings.provider.ideogramQuality}
                              onChange={(e) =>
                                provider({
                                  ideogramQuality: e.target
                                    .value as Settings['provider']['ideogramQuality'],
                                })
                              }
                            >
                              {['very_low', 'low', 'medium', 'high'].map(
                                (v) => (
                                  <option key={v} value={v}>
                                    {v.replace('_', ' ')}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <label>
                            Edit precision
                            <select
                              value={settings.provider.ideogramPrecision}
                              onChange={(e) =>
                                provider({
                                  ideogramPrecision: e.target.value as
                                    'regular' | 'high',
                                })
                              }
                            >
                              <option value="high">
                                High · preserve other pixels
                              </option>
                              <option value="regular">Regular</option>
                            </select>
                          </label>
                        </>
                      ) : (
                        <label>
                          Resolution
                          <select
                            value={settings.provider.imageResolution}
                            onChange={(e) =>
                              provider({
                                imageResolution: e.target.value as '1K' | '2K',
                              })
                            }
                          >
                            <option value="1K">1K</option>
                            <option value="2K">2K</option>
                          </select>
                        </label>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.provider.vision}
                onChange={(e) => provider({ vision: e.target.checked })}
              />
              Text model supports images
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.rememberCredentials}
                onChange={(e) =>
                  setDraft({
                    ...settings,
                    rememberCredentials: e.target.checked,
                  })
                }
              />
              Remember keys on this device
            </label>
            <label>
              Requests per run
              <input
                type="number"
                min={1}
                max={1000}
                value={settings.provider.requestLimit}
                onChange={(e) =>
                  provider({ requestLimit: Number(e.target.value) })
                }
              />
            </label>
            {channel && (
              <label>
                Glossary
                <textarea
                  rows={3}
                  value={prefs.glossary}
                  onChange={(e) =>
                    setPreferenceDraft({ ...prefs, glossary: e.target.value })
                  }
                />
              </label>
            )}
          </fieldset>
        </details>
        <div className="save-row">
          <button className="primary" disabled={disabled}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      <details className="settings-advanced">
        <summary>Backup & keys</summary>
        <div className="backup-actions">
          <DownloadButton
            blob={() => exportArchive(repository)}
            name="youtube-localizer-backup.zip"
          >
            Export backup
          </DownloadButton>
          <label className="file-button secondary">
            <Upload size={16} />
            Import backup
            <input
              type="file"
              accept=".zip"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void action(() =>
                    navigator.locks.request('localizer-coordinator', () =>
                      importArchive(repository, file),
                    ),
                  );
                e.target.value = '';
              }}
            />
          </label>
          <button
            className="text-button"
            onClick={() =>
              void action(async () => {
                await forgetCredentials();
                setSaved({ text: false, image: false, fal: false });
              })
            }
          >
            Forget keys
          </button>
        </div>
      </details>
      <a
        className="settings-openpost"
        href="https://openpo.st/?utm_source=youtube-localizer"
        target="_blank"
        rel="noreferrer"
      >
        Explore OpenPost <ArrowUpRight size={14} />
      </a>
    </main>
  );
}
