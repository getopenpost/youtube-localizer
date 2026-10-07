import { mount } from 'svelte';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/manrope';
import './style.css';
import App from './App.svelte';
import { ditherTheme } from '@openpost/ui/themes/builtins/dither';
import { resolveLocalTheme } from '@openpost/ui/themes/resolve';
import { WebThemeRuntime } from '@openpost/ui/themes/runtime';
import { isExtension } from './shared';
async function start() {
  if (
    import.meta.env.DEV &&
    !isExtension() &&
    new URLSearchParams(location.search).has('preview')
  )
    await (await import('./preview')).seedPreview();
  const appearance = matchMedia('(prefers-color-scheme: dark)');
  const runtime = new WebThemeRuntime();
  const apply = () =>
    runtime.apply(
      resolveLocalTheme(ditherTheme, appearance.matches ? 'dark' : 'light'),
      document.documentElement,
    );
  await apply();
  appearance.addEventListener('change', () => void apply());
  const views = {
    thumbnail: () => import('./Thumbnail.svelte'),
    options: () => import('./Options.svelte'),
    review: () => import('./Review.svelte'),
    sidepanel: () => import('./Panel.svelte'),
  };
  const page = location.pathname.includes('thumbnail')
    ? 'thumbnail'
    : location.pathname.includes('options')
      ? 'options'
      : location.pathname.includes('review')
        ? 'review'
        : 'sidepanel';
  const { default: View } = await views[page]();
  mount(App, {
    target: document.getElementById('root')!,
    props: { View, page },
  });
}
void start();
