import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { Landing } from './pages/Landing';
import { Docs } from './pages/Docs';
import { Flow } from './pages/Flow';
import { Examples } from './pages/Examples';

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
        <Route path="/docs" element={<Docs />} />
        <Route path="/flow/:slug" element={<Flow />} />
        <Route path="/examples" element={<Examples />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
