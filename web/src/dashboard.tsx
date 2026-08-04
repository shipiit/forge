import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { Dashboard } from './pages/Dashboard';
import { RunsPage } from './pages/dashboard/Runs';
import { ToolsPage } from './pages/dashboard/Tools';
import { EventsPage } from './pages/dashboard/Events';
import { FindingsPage } from './pages/dashboard/Findings';

/**
 * The dashboard, as the agent serves it.
 *
 * A separate entry from the marketing site on purpose: a client who deploys
 * this should get their run log at the address they opened, not a landing page
 * about the product they already installed — and should not be shipped the
 * docs, the builder and the examples to get there.
 *
 * The mount path is not known at build time. It is stamped into the HTML by
 * the server, so one bundle works whether it is served at / by
 * `forge dashboard` or at /usage on a hosted App.
 */
const stamped = (window as unknown as { __FORGE_BASE__?: string }).__FORGE_BASE__ ?? '/';
// Unstamped (served by something that does not know about it) means root.
const base = stamped.includes('__FORGE_BASE__') ? '' : stamped.replace(/\/+$/, '');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={base}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/findings" element={<FindingsPage />} />
        {/* The site nests these under /dashboard; keep those links working. */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/dashboard/runs" element={<Navigate to="/runs" replace />} />
        <Route path="/dashboard/tools" element={<Navigate to="/tools" replace />} />
        <Route path="/dashboard/events" element={<Navigate to="/events" replace />} />
        <Route path="/dashboard/findings" element={<Navigate to="/findings" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
