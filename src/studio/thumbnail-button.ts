import { extensionApi } from '../platform/webextension';
export function installThumbnailButton() {
  let host: HTMLElement | undefined;
  let scheduled = false;
  function update() {
    scheduled = false;
    const supported =
      /^\/video\/[\w-]{11}\/edit\/?$/.test(location.pathname) &&
      (!document.documentElement.lang ||
        document.documentElement.lang.startsWith('en'));
    const editor = supported
      ? document.querySelector('ytcp-video-thumbnail-editor')
      : null;
    const label = editor?.querySelector('#autogen-thumb-label');
    if (!label) {
      host?.remove();
      host = undefined;
      return;
    }
    if (host?.isConnected && host.parentElement === label) return;
    host?.remove();
    host = document.createElement('span');
    host.style.cssText =
      'display:inline-block;margin-left:12px;vertical-align:middle';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent =
      'button{font:500 14px system-ui,sans-serif;color:#a44218;background:#fceee5;border:1px solid #ddd7ce;border-radius:6px;padding:6px 12px;cursor:pointer}button:focus-visible{outline:2px solid #a44218;outline-offset:3px}button:disabled{opacity:.6;cursor:wait}[role=status]{font:12px system-ui,sans-serif;margin-left:8px}@media(prefers-color-scheme:dark){button{color:#f6a071;background:#2e2520;border-color:#48423b}}';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Generate';
    button.title = 'Generate a thumbnail with YouTube Localizer';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    button.addEventListener('click', async (event) => {
      if (!event.isTrusted) return;
      button.disabled = true;
      status.textContent = '';
      try {
        const result = await extensionApi().runtime.sendMessage({
          type: 'thumbnail-open',
        });
        if (!result?.ok)
          throw new Error(
            result?.error ?? 'Could not open the thumbnail composer.',
          );
      } catch (error) {
        status.textContent =
          error instanceof Error
            ? error.message
            : 'Reload Studio and try again.';
      } finally {
        button.disabled = false;
      }
    });
    shadow.append(style, button, status);
    label.append(host);
  }
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  addEventListener('popstate', schedule);
  schedule();
}
