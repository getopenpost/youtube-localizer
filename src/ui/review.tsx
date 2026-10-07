import { useState, useOptimistic, startTransition } from 'react';
import {
  ArrowRight,
  Check,
  Download,
  ImagePlus,
  Pause,
  RefreshCw,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import {
  components,
  type Component,
  type Job,
  type Slot,
  type Video,
} from '../core/model';
import { languageName } from '../core/languages';
import { repository } from '../core/storage';
import { exportGenerated } from '../core/archive';
import { command } from '../platform/messages';
import { LayerEditor } from './layer-editor';
import type { LayerTemplate } from '../layers/model';
import { imageAsset } from '../platform/images';
import {
  AssetImage,
  DownloadButton,
  Notice,
  Status,
  download,
  openPage,
  openThumbnail,
} from './shared';
import { useWorkspace } from './use-workspace';
function TextReview({
  job,
  component,
  slot,
  disabled,
  onAction,
}: {
  job: Job;
  component: 'title' | 'description';
  slot: Slot;
  disabled: boolean;
  onAction: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [approved, setApproved] = useOptimistic(
    slot.application === 'approved',
    (_previous, value: boolean) => value,
  );
  const [draft, setDraft] = useState<string>();
  const value = draft ?? slot.value ?? '';
  const editable =
    slot.generation === 'generated' &&
    !['verified', 'preserved', 'stale'].includes(slot.application);
  return (
    <section className="review-component">
      <div className="component-heading">
        <h3>{component === 'title' ? 'Title' : 'Description'}</h3>
        <Status slot={slot} />
      </div>
      {editable ? (
        <>
          <label className="sr-only" htmlFor={`${job.id}/${component}`}>
            {languageName(job.language)} {component}
          </label>
          <textarea
            id={`${job.id}/${component}`}
            rows={component === 'title' ? 2 : 5}
            value={value}
            maxLength={component === 'title' ? 100 : 5000}
            dir="auto"
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="field-actions">
            {draft !== undefined && (
              <span>
                {value.length}/{component === 'title' ? 100 : 5000}
              </span>
            )}
            {draft !== undefined && draft !== slot.value && (
              <button
                className="text-button"
                disabled={
                  disabled || draft === undefined || draft === slot.value
                }
                onClick={() =>
                  onAction(async () => {
                    await command({
                      type: 'edit',
                      jobId: job.id,
                      component,
                      value,
                    });
                    setDraft(undefined);
                  })
                }
              >
                Save wording
              </button>
            )}

            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={
                  disabled ||
                  (draft !== undefined && draft !== slot.value) ||
                  !value.trim()
                }
                checked={approved}
                onChange={(e) => {
                  const checked = e.target.checked;
                  startTransition(async () => {
                    setApproved(checked);
                    await onAction(() =>
                      command({
                        type: 'approve',
                        jobId: job.id,
                        component,
                        approved: checked,
                      }),
                    );
                  });
                }}
              />
              Approved
            </label>
          </div>
        </>
      ) : (
          slot.application === 'preserved'
            ? (slot.lastEvidence?.value ?? slot.value)
            : slot.value
        ) ? (
        <p className="readonly-translation" dir="auto">
          {slot.application === 'preserved'
            ? (slot.lastEvidence?.value ?? slot.value)
            : slot.value}
        </p>
      ) : (
        <p className="help">
          {slot.application === 'preserved'
            ? 'Studio already has this component. It will be preserved.'
            : slot.generation === 'queued'
              ? 'Generate after checking that this component is missing.'
              : 'No generated text yet.'}
        </p>
      )}
      {slot.error && <p className="component-error">{slot.error}</p>}
      {slot.application === 'stale' &&
        slot.lastEvidence?.state === 'missing' && (
          <button
            className="secondary"
            disabled={disabled}
            onClick={() =>
              onAction(() =>
                command({ type: 'regenerate-text', jobId: job.id, component }),
              )
            }
          >
            Queue from the updated source
          </button>
        )}
    </section>
  );
}
function WordingReview({
  job,
  disabled,
  onAction,
}: {
  job: Job;
  disabled: boolean;
  onAction: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [pendingApproval, setPendingApproval] = useState<boolean>();
  const [draft, setDraft] = useState<string[]>();
  const strings =
    draft ??
    job.thumbnailStrings ??
    job.source.thumbnailText?.map(() => '') ??
    [];
  if (!job.source.thumbnailTextApproved) return null;
  if (!job.source.thumbnailText?.length) return null;

  return (
    <div className="wording-review">
      <h4>Exact thumbnail wording</h4>
      {job.source.thumbnailText.map((source, i) => (
        <label key={i}>
          <span dir="auto">{source}</span>
          <input
            aria-label={`${languageName(job.language)} thumbnail text ${i + 1}`}
            dir="auto"
            value={strings[i] ?? ''}
            disabled={
              disabled ||
              ['waiting', 'submitting'].includes(
                job.slots.thumbnail?.generation ?? '',
              )
            }
            onChange={(e) => {
              const next = [...strings];
              next[i] = e.target.value;
              setDraft(next);
            }}
          />
        </label>
      ))}
      <label className="checkbox-label">
        <input
          type="checkbox"
          disabled={
            disabled ||
            strings.some((s) => !s.trim()) ||
            ['waiting', 'submitting'].includes(
              job.slots.thumbnail?.generation ?? '',
            )
          }
          checked={
            pendingApproval ?? (job.wordingApproved && draft === undefined)
          }
          onChange={(e) => {
            const checked = e.target.checked;
            setPendingApproval(checked);
            void onAction(async () => {
              await command({
                type: 'wording',
                jobId: job.id,
                strings,
                approved: checked,
              });
              setDraft(undefined);
            }).finally(() => setPendingApproval(undefined));
          }}
        />
        Use these exact words in the image
      </label>
    </div>
  );
}
function ThumbnailReview({
  job,
  slot,
  disabled,
  onAction,
  local,
  authuser,
}: {
  job: Job;
  local: boolean;
  authuser?: string;
  slot: Slot;
  disabled: boolean;
  onAction: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [approved, setApproved] = useOptimistic(
    slot.application === 'approved',
    (_previous, value: boolean) => value,
  );
  const [correction, setCorrection] = useState('');
  return (
    <section className="review-component">
      <div className="component-heading">
        <h3>Thumbnail</h3>
        <Status slot={slot} />
      </div>
      <WordingReview
        key={`${job.id}:${job.source.thumbnailText?.join('|')}`}
        job={job}
        disabled={disabled}
        onAction={onAction}
      />
      {slot.assetId && (
        <AssetImage
          assetId={slot.assetId}
          alt={`${languageName(job.language)} generated thumbnail`}
          className="review-thumbnail"
        />
      )}
      {slot.generation === 'generated' && (
        <>
          <div className="field-actions">
            <button
              className="text-button"
              onClick={() =>
                onAction(async () => {
                  const asset = await repository.asset(slot.assetId!);
                  if (asset)
                    download(asset.blob, `${job.videoId}-${job.language}.jpg`);
                })
              }
            >
              <Download size={15} />
              Download image
            </button>
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={
                  disabled ||
                  ['stale', 'preserved', 'verified'].includes(
                    slot.application,
                  ) ||
                  slot.lastEvidence?.state !== 'missing'
                }
                checked={approved}
                onChange={(e) => {
                  const checked = e.target.checked;
                  startTransition(async () => {
                    setApproved(checked);
                    await onAction(() =>
                      command({
                        type: 'approve',
                        jobId: job.id,
                        component: 'thumbnail',
                        approved: checked,
                      }),
                    );
                  });
                }}
              />
              Approved
            </label>
          </div>
          <details className="regenerate">
            <summary>
              {local ? 'Render updated thumbnail' : 'Regenerate this thumbnail'}
            </summary>
            {!local && (
              <label>
                Correction instruction
                <textarea
                  rows={2}
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  placeholder="For example: keep the face unchanged and make the headline shorter"
                />
              </label>
            )}

            <button
              className="secondary"
              disabled={disabled}
              onClick={() =>
                onAction(() =>
                  command({
                    type: 'regenerate-image',
                    jobId: job.id,
                    correction,
                  }),
                )
              }
            >
              <RefreshCw size={15} />
              {local ? 'Queue local render' : 'Queue a new edit'}
            </button>
          </details>
        </>
      )}
      {slot.error && <p className="component-error">{slot.error}</p>}
      {slot.application === 'needs-verification' && (
        <a
          className="text-button"
          href={`https://studio.youtube.com/video/${job.videoId}/translations${authuser === undefined ? '' : `?authuser=${encodeURIComponent(authuser)}`}`}
          target="_blank"
          rel="noreferrer"
        >
          Verify in Studio <ExternalLink size={14} />
        </a>
      )}
    </section>
  );
}
function Retry({
  job,
  component,
  slot,
  disabled,
  onAction,
}: {
  job: Job;
  component: Component;
  slot: Slot;
  disabled: boolean;
  onAction: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  if (!['ambiguous', 'error'].includes(slot.generation)) return null;
  return (
    <div className="retry-area">
      {slot.generation === 'ambiguous' && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={disabled}
          />
          I checked the provider dashboard and accept a possible second charge.
        </label>
      )}
      <button
        className="secondary"
        disabled={
          disabled || (slot.generation === 'ambiguous' && !acknowledged)
        }
        onClick={() =>
          onAction(() =>
            command({ type: 'retry', jobId: job.id, component, acknowledged }),
          )
        }
      >
        <RefreshCw size={15} />
        Retry {component === 'thumbnail' ? 'image' : 'text'} generation
      </button>
    </div>
  );
}
function SourceReview({
  video,
  disabled,
  onAction,
  withThumbnails,
  layerMode,
  template,
}: {
  video: Video;
  disabled: boolean;
  withThumbnails: boolean;
  layerMode: boolean;
  template?: LayerTemplate;
  onAction: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [sourceText, setSourceText] = useState<string>();
  const value =
    sourceText ??
    video.thumbnailText?.join('\n') ??
    video.extractedThumbnailText?.join('\n') ??
    '';
  const poor =
    (video.thumbnailWidth ?? 0) < 1280 || (video.thumbnailHeight ?? 0) < 720;
  return (
    <aside className="source-review">
      <h2 className="source-label">
        Source · {languageName(video.sourceLanguage ?? 'und')}
      </h2>
      <h3 dir="auto">{video.title}</h3>
      {video.description && (
        <details className="source-description-fold">
          <summary>Original description</summary>
          <p className="source-description" dir="auto">
            {video.description}
          </p>
        </details>
      )}
      {withThumbnails && (
        <>
          <h4>
            {video.thumbnailOrigin === 'chosen'
              ? 'Chosen source thumbnail'
              : 'Current YouTube thumbnail'}
          </h4>
          <AssetImage
            assetId={video.thumbnailAssetId}
            alt={`Source thumbnail for ${video.title}`}
            className="review-thumbnail"
          />
          <p className="help">
            {video.thumbnailWidth
              ? `${video.thumbnailWidth} × ${video.thumbnailHeight}`
              : 'No cached source image'}
            {poor ? ' · Low resolution' : ''}
          </p>
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => openThumbnail(video)}
          >
            <Sparkles size={15} />
            Generate thumbnail
          </button>
          <label className="file-button text-button">
            <ImagePlus size={16} />
            Use another image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void onAction(async () => {
                    const asset = await imageAsset(file);
                    await repository.putAsset(asset);
                    await command({
                      type: 'source-image',
                      videoId: video.id,
                      assetId: asset.id,
                    });
                    setSourceText(undefined);
                  });
                e.target.value = '';
              }}
            />
          </label>
          {layerMode ? (
            <LayerEditor
              key={video.thumbnailAssetId}
              video={video}
              template={template}
              disabled={disabled}
              onAction={onAction}
            />
          ) : (
            <div className="source-wording">
              <h4>Visible thumbnail text</h4>

              <textarea
                aria-label={`Source thumbnail text for ${video.title}`}
                rows={3}
                value={value}
                disabled={disabled}
                dir="auto"
                onChange={(e) => {
                  setSourceText(e.target.value);
                }}
              />

              {video.extractionStatus === 'ambiguous' && (
                <p className="component-error">
                  The paid extraction has an uncertain outcome. Check your
                  provider dashboard and enter the text manually.
                </p>
              )}
              <div className="source-text-actions">
                <button
                  className="text-button"
                  disabled={
                    disabled ||
                    !video.thumbnailAssetId ||
                    ['ambiguous', 'submitting'].includes(
                      video.extractionStatus ?? '',
                    )
                  }
                  onClick={() =>
                    void onAction(async () => {
                      const strings = await command<string[]>({
                        type: 'extract-text',
                        videoId: video.id,
                      });
                      setSourceText(strings.join('\n'));
                    })
                  }
                >
                  <Sparkles size={14} />
                  {video.extractionStatus === 'generated'
                    ? 'Use saved extraction'
                    : 'Read with AI · paid'}
                </button>
                <button
                  className="secondary"
                  disabled={disabled || !video.thumbnailAssetId}
                  onClick={() =>
                    void onAction(async () => {
                      await command({
                        type: 'source-text',
                        videoId: video.id,
                        strings: value
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      });
                      setSourceText(undefined);
                    })
                  }
                >
                  <Check size={15} />
                  {value.trim() ? 'Confirm source text' : 'Confirm no text'}
                </button>
              </div>
              {video.thumbnailTextApproved && sourceText === undefined && (
                <span className="success-text">Confirmed</span>
              )}
            </div>
          )}
        </>
      )}
      <span className={`visibility ${video.visibility}`}>
        {video.visibility}
      </span>
      {video.scheduledAt && <p className="help">{video.scheduledAt}</p>}
    </aside>
  );
}
export function Review() {
  const { workspace, refresh, loading, storageError } = useWorkspace();
  const [channel, setChannel] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const active = workspace.run.mode !== 'paused';
  const channels = [
    ...new Map(
      [...workspace.accounts, ...workspace.videos].map((video) => [
        video.channelId,
        video.channelName,
      ]),
    ).entries(),
  ];
  const channelId =
    channel ||
    workspace.activeChannel ||
    workspace.run.channelId ||
    channels[0]?.[0];
  const prefs = workspace.preferences.find(
    (value) => value.channelId === channelId,
  );
  const jobs = workspace.jobs.filter(
    (job) =>
      job.channelId === channelId &&
      (!prefs || prefs.targetLanguages.includes(job.language)),
  );
  const videos = workspace.videos.filter((video) =>
    jobs.some((job) => job.videoId === video.id),
  );
  const languageCount = new Set(jobs.map((job) => job.language)).size;
  const approved = jobs
    .flatMap((job) =>
      (prefs?.components ?? job.enabledComponents ?? components).flatMap(
        (component) => (job.slots[component] ? [job.slots[component]!] : []),
      ),
    )
    .filter((slot) => slot.application === 'approved').length;
  async function action(fn: () => Promise<unknown>) {
    setBusy('Working');
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusy('');
    }
  }
  const disabled = active || !!busy;
  return (
    <main className="review-page">
      <div className="page-heading review-heading">
        <div>
          <h1>Review translations</h1>
        </div>
        {channels.length > 1 && (
          <label>
            Channel
            <select
              value={channelId}
              disabled={active || !!busy}
              onChange={(e) => {
                setChannel(e.target.value);
                void action(() =>
                  command({
                    type: 'select-channel',
                    channelId: e.target.value,
                  }),
                );
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
      </div>
      {storageError && <Notice error>{storageError}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {loading ? (
        <p role="status">Loading your local work…</p>
      ) : !jobs.length ? (
        <section className="empty-state wide">
          <h2>Nothing to review yet</h2>
          <p>
            Choose videos in the side panel and check their existing
            translations. Generated wording and images will appear here.
          </p>
          <button className="secondary" onClick={() => openPage('sidepanel')}>
            Open video selection <ArrowRight size={16} />
          </button>
        </section>
      ) : (
        <>
          <div className="review-toolbar">
            <span>
              {videos.length} {videos.length === 1 ? 'video' : 'videos'} ·{' '}
              {languageCount} {languageCount === 1 ? 'language' : 'languages'} ·{' '}
              {approved} approved
            </span>
            <div>
              {active ? (
                <button
                  className="secondary"
                  onClick={() => void action(() => command({ type: 'pause' }))}
                >
                  <Pause size={16} />
                  Pause run
                </button>
              ) : (
                <button
                  className="secondary"
                  disabled={disabled}
                  onClick={() =>
                    void action(() =>
                      command({
                        type: 'generate',
                        jobIds: jobs.map((job) => job.id),
                      }),
                    )
                  }
                >
                  <Sparkles size={16} />
                  Generate missing
                </button>
              )}
              <DownloadButton
                blob={() =>
                  exportGenerated(repository, {
                    jobIds: jobs.map((job) => job.id),
                  })
                }
                name="youtube-localizer-assets.zip"
              >
                Download assets
              </DownloadButton>
            </div>
          </div>
          {active && (
            <Notice>
              {workspace.run.mode === 'generate'
                ? 'Generating…'
                : 'Applying… Keep Studio visible.'}{' '}
              {workspace.run.requestsUsed}/{workspace.run.requestLimit} new paid
              requests.
            </Notice>
          )}
          {!active &&
            workspace.run.reason &&
            !workspace.run.reason.startsWith('Generation finished') &&
            !workspace.run.reason.startsWith('Approved items') && (
              <p className="run-reason" role="status">
                {workspace.run.reason}
              </p>
            )}
          {videos.map((video) => (
            <section key={video.id} className="video-review">
              <SourceReview
                video={video}
                layerMode={
                  workspace.settings.provider.imageProvider === 'layerize'
                }
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
                disabled={disabled}
                onAction={action}
              />
              <div className="language-reviews">
                {jobs
                  .filter((job) => job.videoId === video.id)
                  .map((job) => (
                    <article key={job.id} className="language-review">
                      <div className="language-heading">
                        <h2>{languageName(job.language)}</h2>
                        <span>{job.language}</span>
                      </div>
                      {(
                        prefs?.components ??
                        job.enabledComponents ??
                        components
                      ).map((component) => {
                        const slot = job.slots[component];
                        if (!slot) return null;
                        return (
                          <div key={component}>
                            {component === 'thumbnail' ? (
                              <ThumbnailReview
                                authuser={
                                  workspace.accounts.find(
                                    (a) => a.channelId === job.channelId,
                                  )?.authuser
                                }
                                local={
                                  workspace.settings.provider.imageProvider ===
                                  'layerize'
                                }
                                job={job}
                                slot={slot}
                                disabled={disabled}
                                onAction={action}
                              />
                            ) : (
                              <TextReview
                                job={job}
                                component={component}
                                slot={slot}
                                disabled={disabled}
                                onAction={action}
                              />
                            )}
                            <Retry
                              job={job}
                              component={component}
                              slot={slot}
                              disabled={disabled}
                              onAction={action}
                            />
                          </div>
                        );
                      })}
                    </article>
                  ))}
              </div>
            </section>
          ))}
          <div className="review-bottom-actions">
            <span>{approved} components approved</span>
            <button
              className="primary"
              disabled={disabled || !approved}
              onClick={() =>
                void action(() =>
                  command({ type: 'apply', jobIds: jobs.map((job) => job.id) }),
                )
              }
            >
              Apply {approved || ''} approved <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}
    </main>
  );
}
