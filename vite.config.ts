import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Multi-page build: the customer ordering site (index.html) plus the
      // staff order/POS screen (pos.html), served from the same Cloudflare
      // Pages deployment at domscafe.pages.dev/pos.html so it ships with the
      // same push, same Firebase project, same domain, no separate hosting.
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          pos: path.resolve(__dirname, 'pos.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
