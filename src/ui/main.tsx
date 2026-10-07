import { createRoot } from 'react-dom/client';
import { Component, type ReactNode } from 'react';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import './style.css';
import { Panel } from './panel';
import { Review } from './review';
import { Options } from './options';
import { About, Header, Notice, isExtension } from './shared';
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="empty-state">
        <h1>Could not open the workspace</h1>
        <p>
          Your local work has not been deleted. Reload the extension to try
          again.
        </p>
        <button className="primary" onClick={() => location.reload()}>
          Reload workspace
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const page = location.pathname.includes('options')
  ? 'options'
  : location.pathname.includes('review')
    ? 'review'
    : 'sidepanel';
async function start() {
  if (
    import.meta.env.DEV &&
    !isExtension() &&
    new URLSearchParams(location.search).has('preview')
  )
    await (await import('./preview')).seedPreview();
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <div className={`app-shell ${page}`}>
        <Header page={page} />
        {!isExtension() && (
          <Notice>
            Browser preview with sample videos. No Studio connection or paid
            requests.
          </Notice>
        )}
        {page === 'options' ? (
          <Options />
        ) : page === 'review' ? (
          <Review />
        ) : (
          <Panel />
        )}
        <About />
      </div>
    </ErrorBoundary>,
  );
}
void start();
