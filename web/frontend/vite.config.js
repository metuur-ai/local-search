import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [preact()],
  build: {
    rollupOptions: {
      // Multi-page: the console (index.html) and the Agent OS Graph explorer.
      input: {
        main: resolve(root, 'index.html'),
        'graph-explorer': resolve(root, 'graph-explorer.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
