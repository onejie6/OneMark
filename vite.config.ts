import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'development-csp',
    apply: 'serve',
    transformIndexHtml: html => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
  }],
  build: { assetsInlineLimit: 60000 },
});
