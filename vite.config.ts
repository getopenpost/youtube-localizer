import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: { input: ['sidepanel.html', 'review.html', 'options.html'] },
  },
  server: { port: 4397, strictPort: true },
});
