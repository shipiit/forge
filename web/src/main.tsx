import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { Landing } from './pages/Landing';
import { Flow } from './pages/Flow';
import { Examples } from './pages/Examples';
import { GitHubGuide } from './pages/GitHubGuide';
import { Schedules } from './pages/Schedules';
import { Builder } from './pages/Builder';

// BrowserRouter so in-page #anchors (Features/How/Examples) work natively.
// basename handles GitHub Pages project hosting (/forge/).
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

// Restore a deep link captured by the GitHub Pages 404 fallback.
const redirect = sessionStorage.getItem('redirect');
if (redirect) {
  sessionStorage.removeItem('redirect');
  history.replaceState(null, '', redirect);
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={base}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/github" element={<GitHubGuide />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/builder" element={<Builder />} />
        <Route path="/flow/:slug" element={<Flow />} />
        <Route path="/examples" element={<Examples />} />
        {/* Docs merged into the GitHub guide — keep old links working. */}
        <Route path="/docs" element={<Navigate to="/github" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
