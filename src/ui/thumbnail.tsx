import { useState } from 'react';
import { Download, ImagePlus, Settings2, Trash2 } from 'lucide-react';
import { useWorkspace } from './use-workspace';
import { AssetImage, Notice, download, openPage, isExtension } from './shared';
import { repository } from '../core/storage';
import { referenceAsset } from '../platform/images';
import { command } from '../platform/messages';
import { credentials, saveCredentials } from '../platform/credentials';
import { MAX_REFERENCES, type Reference } from '../thumbnails/model';
export function Thumbnail() {
  const { workspace, loading, refresh, storageError } = useWorkspace();
  const query = new URLSearchParams(location.search);
  const [selectedVideo, setSelectedVideo] = useState(query.get('video') ?? '');
  const video = workspace.videos.find(
    (v) =>
      v.id === selectedVideo &&
      (!query.get('channel') || v.channelId === query.get('channel')),
  );
  const creations = workspace.creations
    .filter(
      (c) => c.video.id === video?.id && c.video.channelId === video?.channelId,
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  const latest = creations[0];
  const [promptDraft, setPrompt] = useState<string>();
  const prompt =
    promptDraft ??
    latest?.prompt ??
    "Create a clear, bold thumbnail for this video. Use a short headline in the video's language.";
  const [selection, setSelection] = useState<string[]>();
  const selected = (
    selection ??
    latest?.references.map((r) => r.id) ??
    []
  ).filter((id) => workspace.references.some((r) => r.id === id));
  const [useCurrent, setUseCurrent] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [chosen, setChosen] = useState<string>();
  const [sourceUsed, setSourceUsed] = useState('');
  const result =
    creations.find((c) => c.id === chosen) ??
    creations.find((c) => c.state === 'generated');
  const pending = creations.some((c) => c.state === 'submitting');
  const uncertain = creations.some(
    (c) => c.state === 'ambiguous' && !c.retryAcknowledged,
  );
  const disabled = !!busy || workspace.run.mode !== 'paused' || pending;
  async function action(label: string, task: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await task();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not complete this action.',
      );
    } finally {
      setBusy('');
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
    setSelection(next);
  }
  async function generate() {
    if (!isExtension())
      throw new Error('Load the extension to generate thumbnails.');
    if (!video)
      throw new Error('Open a video from Studio to generate its thumbnail.');
    if (
      !(await chrome.permissions.request({
        origins: ['https://api.openai.com/*'],
      }))
    )
      throw new Error('OpenAI access was declined.');
    if (key) {
      await saveCredentials(
        { ...(await credentials()), imageKey: key },
        workspace.settings.rememberCredentials,
      );
      setKey('');
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
    setAcknowledged(false);
    if (creation.state === 'generated') setChosen(creation.id);
    if (creation.error) throw new Error(creation.error);
  }
  return (
    <main className="thumbnail-page">
      <div className="page-heading">
        <h1>Generate thumbnail</h1>
      </div>
      {storageError && <Notice error>{storageError}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {loading ? (
        <p role="status">Loading…</p>
      ) : (
        <div className="thumbnail-composer">
          <section
            className="thumbnail-inputs"
            aria-label="Thumbnail direction"
          >
            {video ? (
              <>
                <h2 dir="auto">{video.title}</h2>
                <p className="help">{video.channelName}</p>
                <details>
                  <summary>Video context</summary>
                  <p className="source-description" dir="auto">
                    {video.description || 'No description'}
                  </p>
                </details>
              </>
            ) : (
              <label>
                Video
                <select
                  value={selectedVideo}
                  disabled={disabled}
                  onChange={(e) => {
                    setSelectedVideo(e.target.value);
                    setPrompt(undefined);
                    setSelection(undefined);
                    setChosen(undefined);
                  }}
                >
                  <option value="">Choose a connected video</option>
                  {workspace.videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.channelName} · {v.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="thumbnail-direction">
              What should it look like?
              <textarea
                rows={5}
                maxLength={6000}
                value={prompt}
                disabled={disabled}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Scene, layout and headline"
              />
            </label>
            <div className="reference-heading">
              <h3>References</h3>
              <label className="file-button text-button">
                <ImagePlus size={16} />
                Add images
                <input
                  aria-label="Add reference images"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  disabled={disabled}
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files?.length)
                      void action('Adding images', () => add(files));
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {workspace.references.length ? (
              <div className="reference-grid">
                {workspace.references.map((reference) => (
                  <label
                    key={reference.id}
                    className={`reference-tile ${selected.includes(reference.id) ? 'selected' : ''}`}
                  >
                    <AssetImage
                      assetId={reference.assetId}
                      alt={reference.name}
                    />
                    <span>
                      <input
                        type="checkbox"
                        aria-label={`Use reference ${reference.name}`}
                        checked={selected.includes(reference.id)}
                        disabled={
                          disabled ||
                          (!selected.includes(reference.id) &&
                            selected.length >= MAX_REFERENCES)
                        }
                        onChange={(e) =>
                          setSelection(
                            e.target.checked
                              ? [...selected, reference.id]
                              : selected.filter((id) => id !== reference.id),
                          )
                        }
                      />
                      {reference.name}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="help">Save face, brand or style images here.</p>
            )}
            {!!workspace.references.length && (
              <details className="reference-manager">
                <summary>Manage references</summary>
                {workspace.references.map((reference) => (
                  <div key={reference.id} className="reference-management-row">
                    <label>
                      <span className="sr-only">Name for {reference.name}</span>
                      <input
                        defaultValue={reference.name}
                        maxLength={80}
                        disabled={disabled}
                        onBlur={(e) => {
                          if (e.target.value !== reference.name)
                            void action('Saving reference', () =>
                              command({
                                type: 'reference-save',
                                reference: {
                                  ...reference,
                                  name: e.target.value,
                                },
                              }),
                            );
                        }}
                      />
                    </label>
                    <label>
                      <span className="sr-only">Role for {reference.name}</span>
                      <select
                        value={reference.kind}
                        disabled={disabled}
                        onChange={(e) =>
                          void action('Saving reference', () =>
                            command({
                              type: 'reference-save',
                              reference: {
                                ...reference,
                                kind: e.target.value as Reference['kind'],
                              },
                            }),
                          )
                        }
                      >
                        <option value="person">Person</option>
                        <option value="style">Style</option>
                        <option value="brand">Brand</option>
                      </select>
                    </label>
                    <button
                      className="icon-button"
                      disabled={disabled}
                      aria-label={`Remove reference ${reference.name}`}
                      onClick={() =>
                        void action('Removing reference', () =>
                          command({
                            type: 'reference-remove',
                            id: reference.id,
                          }),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </details>
            )}
            {video?.thumbnailAssetId && (
              <label className="checkbox-label current-thumbnail-reference">
                <input
                  type="checkbox"
                  checked={useCurrent}
                  disabled={disabled}
                  onChange={(e) => setUseCurrent(e.target.checked)}
                />
                Use source thumbnail as a reference
              </label>
            )}
            <details className="thumbnail-connection">
              <summary>OpenAI connection</summary>
              <label>
                OpenAI API key
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Leave blank to use the saved key"
                  disabled={disabled}
                />
              </label>
              <button
                className="text-button"
                onClick={() => openPage('options')}
              >
                <Settings2 size={14} />
                Model & quality
              </button>
            </details>
            {uncertain && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={disabled}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                I checked OpenAI and accept a possible second charge.
              </label>
            )}
            <button
              className="primary generate-thumbnail"
              disabled={
                disabled ||
                !video ||
                !prompt.trim() ||
                (uncertain && !acknowledged)
              }
              onClick={() => void action('Generating', generate)}
            >
              {pending || busy === 'Generating' ? 'Generating…' : 'Generate'}
            </button>
            <span className="help">
              {workspace.settings.provider.imageModel === 'gpt-image-2.5-flare'
                ? 'GPT Image 2.5 Flare'
                : 'GPT Image 2.5 Sunburst'}
            </span>
          </section>
          <section
            className="thumbnail-output"
            aria-label="Generated thumbnails"
          >
            {result?.assetId ? (
              <>
                <AssetImage
                  assetId={result.assetId}
                  alt={`Generated thumbnail for ${video?.title}`}
                  className="generated-original"
                />
                <div className="thumbnail-output-actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      void action('Downloading', async () => {
                        const asset = await repository.asset(result.assetId!);
                        if (asset)
                          download(
                            asset.blob,
                            `${result.video.id}-thumbnail.jpg`,
                          );
                      })
                    }
                  >
                    <Download size={16} />
                    Download
                  </button>
                  <button
                    className="secondary"
                    disabled={disabled}
                    onClick={() =>
                      void action('Choosing thumbnail', async () => {
                        await command({
                          type: 'source-image',
                          videoId: result.video.id,
                          assetId: result.assetId!,
                        });
                        setSourceUsed(result.id);
                      })
                    }
                  >
                    {sourceUsed === result.id
                      ? 'Selected for localization'
                      : 'Use for localization'}
                  </button>
                </div>
              </>
            ) : (
              <div className="thumbnail-output-empty">
                <ImagePlus size={28} />
                <p>
                  {pending
                    ? 'Generating your thumbnail…'
                    : 'Your thumbnail will appear here.'}
                </p>
              </div>
            )}
            {!!creations.length && (
              <div className="thumbnail-variants">
                {creations.map((creation) =>
                  creation.assetId ? (
                    <button
                      className={`thumbnail-variant ${creation.id === result?.id ? 'selected' : ''}`}
                      key={creation.id}
                      aria-label={`View thumbnail from ${new Date(creation.createdAt).toLocaleTimeString()}`}
                      aria-pressed={creation.id === result?.id}
                      onClick={() => setChosen(creation.id)}
                    >
                      <AssetImage assetId={creation.assetId} alt="" />
                    </button>
                  ) : (
                    <p
                      key={creation.id}
                      className="help"
                      role={
                        creation.state === 'submitting' ? 'status' : undefined
                      }
                    >
                      {creation.state === 'submitting'
                        ? 'Generating…'
                        : (creation.error ?? 'Generation failed.')}
                    </p>
                  ),
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
