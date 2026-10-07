import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
await viteBuild();
await build({
  entryPoints: ['src/background.ts'],
  outfile: 'dist/background.js',
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  minify: true,
});
await build({
  entryPoints: ['src/studio/content.ts'],
  outfile: 'dist/content.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: true,
});
