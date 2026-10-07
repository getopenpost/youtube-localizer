import { useState, useEffect } from 'react';
import {
  RefreshCw,
  ExternalLink,
  Pause,
  Search,
  ArrowRight,
} from 'lucide-react';
import { preferencesSchema, type StudioContext } from '../core/model';
import { videoStatus } from '../core/planner';
import { languageName } from '../core/languages';
import { command } from '../platform/messages';
import { useWorkspace } from './use-workspace';
import { AssetImage, Notice, openPage, isExtension } from './shared';
export function Panel() {
  const { workspace, refresh, loading, storageError } = useWorkspace();
  const [cachedSelection, setCached] = useState(false);
  const [liveContext, setContext] = useState<StudioContext>();
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const active = workspace.run.mode !== 'paused';
  async function act(label: string, task: () => Promise<unknown>) {
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
  async function discover() {
    const data = await command<StudioContext>({ type: 'discover' });
    setCached(false);
    setContext(data);
    setSelected(data.scope === 'video' ? data.videos.map((v) => v.id) : []);
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
        .catch(() => {});
  }, []);
  const savedAccount = workspace.accounts.find(
    (a) => a.channelId === workspace.activeChannel,
  );
  const context =
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
      : undefined);
  const cached = cachedSelection || !liveContext;
  const channel =
    context?.channelId ?? workspace.activeChannel ?? workspace.run.channelId;
  const prefs =
    workspace.preferences.find((p) => p.channelId === channel) ??
    preferencesSchema.parse({ channelId: channel ?? '' });
  const videos = context
    ? context.videos.map(
        (v) => workspace.videos.find((saved) => saved.id === v.id) ?? v,
      )
    : [];
  const visible = videos.filter(
    (v) =>
      (!query || v.title.toLowerCase().includes(query.toLowerCase())) &&
      (filter === 'all' ||
        v.visibility === filter ||
        (filter === 'needs' &&
          ['Missing languages', 'Source changed', 'Needs attention'].includes(
            videoStatus(v, workspace.jobs, prefs),
          ))),
  );
  const jobs = workspace.jobs.filter(
    (job) =>
      selected.includes(job.videoId) &&
      job.channelId === channel &&
      prefs.targetLanguages.includes(job.language),
  );
  const checked =
    selected.length > 0 &&
    selected.every(
      (id) =>
        !!videos.find((v) => v.id === id)?.checkedAt &&
        jobs.some((job) => job.videoId === id),
    );
  const generated = jobs.some((job) =>
    prefs.components.some((c) => job.slots[c]?.generation === 'generated'),
  );
  const hasEvidence = videos.some(
    (v) => videoStatus(v, workspace.jobs, prefs) !== 'Not checked',
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
  return (
    <main className="panel-body compact-panel">
      {storageError && <Notice error>{storageError}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {!active &&
        workspace.run.reason &&
        !['Generation finished', 'Approved items', 'Paused.'].some((prefix) =>
          workspace.run.reason.startsWith(prefix),
        ) && <Notice error>{workspace.run.reason}</Notice>}
      {workspace.accounts.length > 1 && (
        <div className="account-bar">
          <label className="sr-only" htmlFor="account-picker">
            YouTube account / channel
          </label>
          <select
            id="account-picker"
            value={channel ?? workspace.accounts[0]?.channelId}
            disabled={active || !!busy}
            onChange={(e) =>
              void act('Switching channel', async () => {
                const id = e.target.value;
                await command({ type: 'select-channel', channelId: id });
                const account = workspace.accounts.find(
                  (a) => a.channelId === id,
                )!;
                setSelected([]);
                setCached(true);
                setContext({
                  channelId: id,
                  channelName: account.channelName,
                  videos: workspace.videos.filter((v) => v.channelId === id),
                  scope: 'page',
                });
                try {
                  setCached(false);
                  setContext(
                    await command<StudioContext>({
                      type: 'discover',
                      channelId: id,
                    }),
                  );
                } catch {
                  /* Cached selection remains available; preflight verifies the account. */
                }
              })
            }
          >
            {workspace.accounts.map((account) => (
              <option key={account.channelId} value={account.channelId}>
                {account.channelName}
              </option>
            ))}
          </select>
          <button
            className="text-button"
            disabled={active || !!busy}
            onClick={() =>
              void chrome.tabs.create({
                url: 'https://studio.youtube.com/',
                active: true,
              })
            }
          >
            Add account
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading…</p>
      ) : !context ? (
        <section className="empty-state">
          <h1>Open YouTube Studio</h1>
          <p>Choose a video or your channel’s Content page.</p>
          <button
            className="primary"
            onClick={() => {
              if (isExtension())
                void chrome.tabs.create({
                  url: 'https://studio.youtube.com/',
                  active: true,
                });
            }}
          >
            Open YouTube Studio <ExternalLink size={15} />
          </button>
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() => void act('Reading Studio', discover)}
          >
            Read current Studio page
          </button>
        </section>
      ) : (
        <>
          <div className="channel-section">
            <div>
              <h1
                className={
                  workspace.accounts.length > 1 ? 'sr-only' : undefined
                }
              >
                {context.channelName}
              </h1>
              <span className="help">
                {cached
                  ? `${videos.length} saved videos`
                  : context.scope === 'video'
                    ? 'Current video'
                    : `${videos.length} on this page`}
              </span>
            </div>
            {workspace.accounts.length <= 1 && (
              <button
                className="text-button"
                disabled={active || !!busy}
                onClick={() =>
                  void chrome.tabs.create({
                    url: 'https://studio.youtube.com/',
                    active: true,
                  })
                }
              >
                Add account
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Refresh videos from Studio"
              disabled={active || !!busy}
              onClick={() => void act('Refreshing', discover)}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <button
            className="language-summary"
            onClick={() => openPage('options')}
          >
            {prefs.targetLanguages.map(languageName).join(', ') ||
              'Choose languages'}{' '}
            <span>Change</span>
          </button>
          <div className="list-controls">
            <select
              aria-label="Filter videos"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All videos</option>
              <option value="needs" disabled={!hasEvidence}>
                Needs localization
              </option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
            </select>
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label="Search videos"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="list-toolbar">
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={!visible.length || active}
                checked={
                  visible.length > 0 &&
                  visible.every((v) => selected.includes(v.id))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...new Set([...selected, ...visible.map((v) => v.id)])]
                      : selected.filter(
                          (id) => !visible.some((v) => v.id === id),
                        ),
                  )
                }
              />
              Select visible
            </label>
            <span>{selected.length} selected</span>
          </div>
          <ul className="video-list">
            {visible.map((video) => (
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
                        {video.visibility === 'unknown' ? '' : video.visibility}
                      </span>
                      {video.scheduledAt && <span>{video.scheduledAt}</span>}
                    </span>
                    <span className="video-state">
                      {videoStatus(video, workspace.jobs, prefs)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {!visible.length && <p className="empty-list">No matching videos.</p>}
          <div className="panel-actions">
            {active ? (
              <>
                <p role="status">
                  {workspace.run.mode === 'generate'
                    ? 'Generating…'
                    : 'Applying…'}
                </p>
                <button
                  className="secondary"
                  onClick={() =>
                    void act('Pausing', () => command({ type: 'pause' }))
                  }
                >
                  <Pause size={16} />
                  Pause
                </button>
                <button
                  className="text-button"
                  onClick={() => openPage('review')}
                >
                  Open review
                </button>
              </>
            ) : (
              <>
                <button
                  className="primary"
                  disabled={!selected.length || !!busy}
                  onClick={() =>
                    void act(
                      !checked ? 'Checking translations' : 'Starting',
                      next,
                    )
                  }
                >
                  {busy ||
                    (generated
                      ? 'Review translations'
                      : checked
                        ? 'Generate missing'
                        : 'Check missing translations')}
                  <ArrowRight size={16} />
                </button>
                {checked && !generated && (
                  <button
                    className="text-button"
                    onClick={() => openPage('review')}
                  >
                    Review missing items
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
