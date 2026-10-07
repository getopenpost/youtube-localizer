import { useState, useEffect } from 'react';
import {
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Pause,
  CheckCircle2,
  Search,
  Film,
  Languages,
  Image,
} from 'lucide-react';
import { preferencesSchema, type StudioContext } from '../core/model';
import { videoStatus } from '../core/planner';
import { languageName } from '../core/languages';
import { command } from '../platform/messages';
import { useWorkspace } from './use-workspace';
import { AssetImage, Notice, openPage, isExtension } from './shared';
export function Panel() {
  const { workspace, refresh, loading, storageError } = useWorkspace();
  const [context, setContext] = useState<StudioContext>();
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = workspace.run.mode !== 'paused';
  async function act(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusy('');
    }
  }
  async function discover() {
    const data = await command<StudioContext>({ type: 'discover' });
    setContext(data);
    setSelected(data.scope === 'video' ? data.videos.map((v) => v.id) : []);
    setNotice('');
    setFilter('all');
  }
  useEffect(() => {
    if (isExtension())
      void command<StudioContext>({ type: 'discover' })
        .then((data) => {
          setContext(data);
          setSelected(
            data.scope === 'video' ? data.videos.map((v) => v.id) : [],
          );
        })
        .catch((e) =>
          setError(e instanceof Error ? e.message : 'Could not read Studio.'),
        );
  }, []);
  const channel = context?.channelId ?? workspace.run.channelId;
  const preferences =
    workspace.preferences.find((p) => p.channelId === channel) ??
    preferencesSchema.parse({ channelId: channel ?? '' });
  const videos = context
    ? context.videos.map(
        (video) => workspace.videos.find((v) => v.id === video.id) ?? video,
      )
    : [];
  const needsCount = videos.filter(
    (video) =>
      videoStatus(video, workspace.jobs, preferences) === 'Missing languages',
  ).length;
  const filtered = videos.filter((video) => {
    const status = videoStatus(video, workspace.jobs, preferences);
    return (
      (!query || video.title.toLowerCase().includes(query.toLowerCase())) &&
      (filter === 'all' ||
        filter === video.visibility ||
        (filter === 'needs' &&
          ['Missing languages', 'Source changed', 'Needs attention'].includes(
            status,
          )))
    );
  });
  const jobIds = workspace.jobs
    .filter(
      (job) =>
        job.channelId === channel &&
        selected.includes(job.videoId) &&
        preferences.targetLanguages.includes(job.language),
    )
    .map((job) => job.id);
  const generated = workspace.jobs
    .filter((job) => jobIds.includes(job.id))
    .reduce(
      (count, job) =>
        count +
        Object.values(job.slots).filter(
          (slot) => slot.generation === 'generated',
        ).length,
      0,
    );
  const progress = workspace.jobs
    .filter((job) => workspace.run.jobIds.includes(job.id))
    .flatMap((job) => Object.values(job.slots));
  const done = progress.filter(
    (slot) =>
      ['generated', 'not-needed'].includes(slot.generation) ||
      ['preserved', 'verified'].includes(slot.application),
  ).length;
  const allChecked =
    videos.length > 0 && videos.every((video) => !!video.checkedAt);
  const effectiveFilter =
    filter === 'all' && allChecked && needsCount > 0 ? 'all' : filter;
  return (
    <main className="panel-body">
      <section className="panel-intro">
        <h1>
          Make your videos
          <br />
          feel local.
        </h1>
        <p>
          Translate the title, description and thumbnail.
          <br />
          Review everything before it reaches Studio.
        </p>
      </section>
      <ol className="workflow" aria-label="Localization steps">
        <li className={context ? 'done' : 'current'}>Select</li>
        <li className={jobIds.length ? 'done' : context ? 'current' : ''}>
          Check
        </li>
        <li className={generated ? 'done' : jobIds.length ? 'current' : ''}>
          Generate
        </li>
        <li className={generated ? 'current' : ''}>Review</li>
      </ol>
      {storageError && <Notice error>{storageError}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {loading ? (
        <p role="status">Loading local work…</p>
      ) : !context ? (
        <section className="empty-state">
          <div className="empty-icon">
            <Film size={30} strokeWidth={1.5} />
          </div>
          <h2>Start in YouTube Studio</h2>
          <p>
            Open your channel’s Content page or a video. This panel reads only
            the videos on the page you choose.
          </p>
          <button
            className="primary"
            onClick={() => {
              if (isExtension())
                void chrome.tabs.create({
                  url: 'https://studio.youtube.com/',
                  active: true,
                });
              else
                setNotice(
                  'Browser preview. Load the extension in Chrome to connect Studio.',
                );
            }}
          >
            Open YouTube Studio <ExternalLink size={15} />
          </button>
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() => void act('Reading Studio', discover)}
          >
            <RefreshCw size={15} /> {busy || 'Read current Studio page'}
          </button>
          <p className="onboarding-link">
            First time?{' '}
            <button
              className="inline-button"
              onClick={() => openPage('options')}
            >
              Set up your providers
            </button>
          </p>
        </section>
      ) : (
        <>
          <section className="channel-section">
            <div>
              <h2>{context.channelName}</h2>
              <p>
                {context.scope === 'video'
                  ? 'Current video'
                  : `${videos.length} ${videos.length === 1 ? 'video' : 'videos'} on the current page`}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Refresh videos from Studio"
              disabled={active || !!busy}
              onClick={() => void act('Refreshing', discover)}
            >
              <RefreshCw size={17} />
            </button>
          </section>
          <div className="preferences-summary">
            <Languages size={17} />
            <span>
              {languageName(preferences.sourceLanguage)}{' '}
              <ArrowRight size={12} /> {preferences.targetLanguages.length}{' '}
              languages
            </span>
            <button
              className="inline-button"
              onClick={() => openPage('options')}
            >
              Change
            </button>
          </div>
          <div className="component-summary">
            <span>
              <CheckCircle2 size={13} />{' '}
              {preferences.components.includes('title') ? 'Titles' : ''}
              {preferences.components.includes('title') &&
              preferences.components.includes('description')
                ? ' & '
                : ''}
              {preferences.components.includes('description')
                ? 'descriptions'
                : ''}
            </span>
            {preferences.components.includes('thumbnail') && (
              <span>
                <Image size={13} /> Thumbnails
              </span>
            )}
          </div>
          <div className="filters" aria-label="Filter videos">
            {[
              ['all', 'All'],
              ['needs', 'Needs localization'],
              ['scheduled', 'Scheduled'],
              ['published', 'Published'],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={effectiveFilter === value}
                disabled={value === 'needs' && !allChecked}
                title={
                  value === 'needs' && !allChecked
                    ? 'Check the visible videos before filtering by localization status'
                    : undefined
                }
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search videos"
              placeholder="Find a video"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="list-toolbar">
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={!filtered.length || active}
                checked={
                  filtered.length > 0 &&
                  filtered.every((video) => selected.includes(video.id))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [
                          ...new Set([
                            ...selected,
                            ...filtered.map((v) => v.id),
                          ]),
                        ]
                      : selected.filter(
                          (id) => !filtered.some((v) => v.id === id),
                        ),
                  )
                }
              />
              Select visible
            </label>
            <span>{selected.length} selected</span>
          </div>
          <ul className="video-list">
            {filtered.map((video) => {
              const status = videoStatus(video, workspace.jobs, preferences);
              return (
                <li key={video.id}>
                  <label className="video-row">
                    <input
                      type="checkbox"
                      disabled={active || !!busy}
                      checked={selected.includes(video.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, video.id]
                            : selected.filter((id) => id !== video.id),
                        )
                      }
                    />
                    <AssetImage
                      assetId={video.thumbnailAssetId}
                      alt={`Thumbnail for ${video.title}`}
                      className="video-thumbnail"
                    />
                    <span className="video-info">
                      <strong dir="auto">{video.title}</strong>
                      <span className="video-meta">
                        <span className={`visibility ${video.visibility}`}>
                          {video.visibility === 'published'
                            ? 'Published'
                            : video.visibility === 'unknown'
                              ? 'Visibility not checked'
                              : video.visibility.charAt(0).toUpperCase() +
                                video.visibility.slice(1)}
                        </span>
                        {video.scheduledAt && <span>{video.scheduledAt}</span>}
                      </span>
                      <span
                        className={`video-state ${status === 'Needs attention' || status === 'Source changed' ? 'attention' : ''}`}
                      >
                        {status}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {!filtered.length && (
            <p className="empty-list">
              No videos match this filter. Newly discovered videos need a check
              first.
            </p>
          )}
          {active && (
            <section className="run-status">
              <div>
                <strong>
                  {workspace.run.mode === 'generate'
                    ? 'Generating missing items'
                    : 'Applying approved items'}
                </strong>
                <button
                  className="text-button"
                  onClick={() =>
                    void act('Pausing', () => command({ type: 'pause' }))
                  }
                >
                  <Pause size={15} /> Pause
                </button>
              </div>
              <progress
                value={done}
                max={Math.max(progress.length, 1)}
                aria-label="Batch progress"
              />
              <p>
                {done} of {progress.length} components ready ·{' '}
                {workspace.run.requestsUsed}/{workspace.run.requestLimit} paid
                requests
              </p>
              <small>
                Keep the dedicated Studio tab visible during application.
                Submitted requests can still incur charges after pausing.
              </small>
            </section>
          )}
          {!active && workspace.run.reason && (
            <p className="run-reason" role="status">
              {workspace.run.reason}
            </p>
          )}
          <div className="panel-actions">
            <p>
              {selected.length
                ? `${selected.length} video${selected.length === 1 ? '' : 's'} selected`
                : 'Select the videos you want to localize'}
            </p>
            <button
              className="primary"
              disabled={!selected.length || active || !!busy}
              onClick={() =>
                void act('Checking translations', async () => {
                  await command({
                    type: 'preflight',
                    channelId: context.channelId,
                    videoIds: selected,
                  });
                  setFilter('needs');
                  setNotice(
                    'Preflight finished. Open review to inspect missing components and source thumbnails.',
                  );
                })
              }
            >
              {busy || 'Check missing translations'} <ArrowRight size={16} />
            </button>
            {jobIds.length > 0 && (
              <div className="action-pair">
                <button
                  className="secondary"
                  disabled={active || !!busy}
                  onClick={() =>
                    void act('Starting generation', () =>
                      command({ type: 'generate', jobIds }),
                    )
                  }
                >
                  Generate missing
                </button>
                <button
                  className="secondary"
                  onClick={() => openPage('review')}
                >
                  Review {generated > 0 && `(${generated})`}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
