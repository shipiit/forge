import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React SPA. HashRouter is used in-app so it works on static hosts (GitHub Pages)
// without server rewrites. `base` can be set for project-page hosting.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    proxy: {
      // The usage dashboard reads from the agent's API (`forge dashboard`).
      // Proxying in dev keeps it same-origin, so there is no CORS round trip
      // and no token in a query string while developing.
      '/usage-api': {
        target: process.env.FORGE_API || 'http://127.0.0.1:4300',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/usage-api/, ''),
      },
    },
  },
});
