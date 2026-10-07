import { extensionApi, hasExtensionApi } from '../platform/webextension';
import type { Slot } from '../core/model';
export const isExtension = hasExtensionApi;
export function openPage(
  page: 'options' | 'review' | 'sidepanel' | 'thumbnail',
) {
  if (isExtension())
    void extensionApi().tabs.create({
      url: extensionApi().runtime.getURL(`${page}.html`),
    });
  else location.href = `/${page}.html`;
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
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function openThumbnail(video: { id: string; channelId: string }) {
  const url = new URL(
    isExtension()
      ? extensionApi().runtime.getURL('thumbnail.html')
      : `${location.origin}/thumbnail.html`,
  );
  url.searchParams.set('video', video.id);
  url.searchParams.set('channel', video.channelId);
  if (isExtension()) void extensionApi().tabs.create({ url: url.href });
  else location.href = url.href;
}
