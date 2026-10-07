import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [svelte({ compilerOptions: { fragments: 'tree' } }), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      input: [
        'sidepanel.html',
        'review.html',
        'options.html',
        'render.html',
        'thumbnail.html',
      ],
    },
  },
  server: { port: 4397, strictPort: true },
});
