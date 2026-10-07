import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  ImagePlus,
  Check,
  Globe2,
  Settings2,
  PanelRightOpen,
  Download,
  AlertCircle,
} from 'lucide-react';
import { repository } from '../core/storage';
import type { Slot } from '../core/model';
export const isExtension = () =>
  typeof chrome !== 'undefined' && !!chrome.runtime?.id;
export function openPage(
  page: 'options' | 'review' | 'sidepanel' | 'thumbnail',
) {
  if (isExtension())
    void chrome.tabs.create({ url: chrome.runtime.getURL(`${page}.html`) });
  else location.href = `/${page}.html`;
}
export function Header({ page }: { page: string }) {
  return (
    <header className="app-header">
      <a
        className="brand"
        href="sidepanel.html"
        aria-label="YouTube Localizer home"
      >
        <span className="brand-mark">
          <Globe2 size={22} strokeWidth={1.8} />
        </span>
        <span>
          YouTube Localizer<small>by OpenPost</small>
        </span>
      </a>
      <nav aria-label="Workspace">
        <button
          className="icon-button"
          aria-label="Generate thumbnails"
          title="Thumbnails"
          aria-current={page === 'thumbnail' ? 'page' : undefined}
          onClick={() => openPage('thumbnail')}
        >
          <ImagePlus size={19} />
        </button>
        <button
          className="icon-button"
          title="Review workspace"
          aria-label="Open review workspace"
          aria-current={page === 'review' ? 'page' : undefined}
          onClick={() => openPage('review')}
        >
          <PanelRightOpen size={19} />
        </button>
        <button
          className="icon-button"
          title="Settings"
          aria-label="Open settings"
          aria-current={page === 'options' ? 'page' : undefined}
          onClick={() => openPage('options')}
        >
          <Settings2 size={19} />
        </button>
      </nav>
    </header>
  );
}
export function About() {
  return (
    <footer className="about">
      <details>
        <summary>About</summary>
        <p>
          Text and images go directly to your chosen providers. API requests use
          their billing. Your history stays in this browser; export it before
          uninstalling.
        </p>
        <a
          className="openpost-cta"
          href="https://openpo.st/?utm_source=youtube-localizer&utm_medium=extension&utm_campaign=about"
          target="_blank"
          rel="noreferrer"
        >
          Plan and publish with OpenPost <ArrowUpRight size={15} />
        </a>
      </details>
    </footer>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? 'error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {error && <AlertCircle size={18} />}
      <div>{children}</div>
    </div>
  );
}
export function AssetImage({
  assetId,
  alt,
  className = '',
}: {
  assetId?: string;
  alt: string;
  className?: string;
}) {
  const [image, setImage] = useState<{ assetId: string; url: string }>();
  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    if (assetId)
      void repository.asset(assetId).then((asset) => {
        if (asset && alive) {
          objectUrl = URL.createObjectURL(asset.blob);
          setImage({ assetId, url: objectUrl });
        }
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);
  const url = image?.assetId === assetId ? image?.url : undefined;
  return url ? (
    <img src={url} alt={alt} className={className} />
  ) : (
    <div className={`image-placeholder ${className}`}>
      <Globe2 size={24} />
      <span>Thumbnail not cached</span>
    </div>
  );
}
export function slotLabel(slot: Slot): string {
  if (slot.application === 'stale') return 'Source changed';
  if (slot.application === 'preserved') return 'Already present';
  if (slot.application === 'verified') return 'Verified in Studio';
  if (slot.application === 'needs-verification') return 'Needs verification';
  if (slot.application === 'applying') return 'Applying';
  if (slot.generation === 'ambiguous') return 'Check provider outcome';
  if (slot.generation === 'error') return 'Generation failed';
  if (slot.generation === 'not-needed') return 'No translation needed';
  if (slot.application === 'approved') return 'Approved';
  if (slot.generation === 'generated') return 'Ready to review';
  if (slot.generation === 'waiting') return 'Fal request in progress';
  if (slot.generation === 'submitting') return 'Submitting request';
  if (slot.lastEvidence?.state === 'unknown') return 'Not readable in Studio';
  return 'Missing';
}
export function Status({ slot }: { slot: Slot }) {
  return (
    <span
      className={`status ${['verified', 'preserved', 'approved'].includes(slot.application) ? 'success' : ''} ${slot.application === 'stale' || slot.application === 'needs-verification' || ['ambiguous', 'error'].includes(slot.generation) ? 'attention' : ''}`}
    >
      {['verified', 'approved'].includes(slot.application) && (
        <Check size={13} />
      )}{' '}
      {slotLabel(slot)}
    </span>
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function DownloadButton({
  blob,
  name,
  children,
}: {
  blob: () => Promise<Blob>;
  name: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError('');
          void blob()
            .then((value) => download(value, name))
            .catch(() =>
              setError(
                'Could not export this file. Retry after checking available storage.',
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <Download size={16} />
        {busy ? 'Preparing file…' : children}
      </button>
      {error && <Notice error>{error}</Notice>}
    </>
  );
}

export function openThumbnail(video: { id: string; channelId: string }) {
  const url = new URL(
    isExtension()
      ? chrome.runtime.getURL('thumbnail.html')
      : `${location.origin}/thumbnail.html`,
  );
  url.searchParams.set('video', video.id);
  url.searchParams.set('channel', video.channelId);
  if (isExtension()) void chrome.tabs.create({ url: url.href });
  else location.href = url.href;
}
