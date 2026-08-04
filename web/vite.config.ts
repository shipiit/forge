import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React SPA. HashRouter is used in-app so it works on static hosts (GitHub Pages)
// without server rewrites. `base` can be set for project-page hosting.
// Two builds from one source tree:
//   the site      — every page, hosted on GitHub Pages
//   the dashboard — only the run log, bundled into the agent and served by it
const dashboardOnly = process.env.VITE_TARGET === 'dashboard';

export default defineConfig({
  // The agent does not know its mount path at build time, so the bundled
  // dashboard uses a placeholder that the server stamps with the real one.
  base: dashboardOnly ? '/__FORGE_BASE__/' : process.env.VITE_BASE || '/',
  plugins: [react()],
  ...(dashboardOnly
    ? {
        build: {
          outDir: 'dist-dashboard',
          rollupOptions: { input: 'dashboard.html' },
        },
      }
    : {}),
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
