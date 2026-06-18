import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React SPA. HashRouter is used in-app so it works on static hosts (GitHub Pages)
// without server rewrites. `base` can be set for project-page hosting.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
});
