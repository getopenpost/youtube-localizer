import { build } from 'esbuild';
import { cp, readFile, writeFile, rm } from 'node:fs/promises';
await rm('dist-firefox', { recursive: true, force: true });
await cp('dist', 'dist-firefox', { recursive: true });
const manifest = JSON.parse(
  await readFile('dist-firefox/manifest.json', 'utf8'),
);
delete manifest.minimum_chrome_version;
delete manifest.side_panel;
manifest.permissions = manifest.permissions.filter(
  (value) => !['sidePanel', 'offscreen'].includes(value),
);
manifest.background = { page: 'background-firefox.html', persistent: false };
manifest.sidebar_action = {
  default_title: 'YouTube Localizer',
  default_panel: 'sidepanel.html',
  default_icon: manifest.icons,
};
manifest.browser_specific_settings = {
  gecko: {
    id: 'youtube-localizer@getopenpost.org',
    strict_min_version: '142.0',
    data_collection_permissions: {
      required: [
        'websiteContent',
        'authenticationInfo',
        'personallyIdentifyingInfo',
      ],
    },
  },
};
await writeFile(
  'dist-firefox/manifest.json',
  JSON.stringify(manifest, null, 2),
);

await build({
  entryPoints: {
    'background-firefox': 'src/background-firefox.ts',
    'layer-render': 'src/layers/render.ts',
    'layer-inspect': 'src/layers/inspect.ts',
    credentials: 'src/platform/credentials.ts',
  },
  outdir: 'dist-firefox',
  splitting: true,
  bundle: true,
  format: 'esm',
  target: 'firefox142',
  minify: true,
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'assets/firefox/[name]-[hash]',
});
await writeFile(
  'dist-firefox/background-firefox.html',
  '<!doctype html><html lang="en"><head><meta charset="UTF-8"><link rel="stylesheet" href="background-firefox.css"><title>YouTube Localizer background</title></head><body><script type="module" src="background-firefox.js"></script></body></html>',
);
