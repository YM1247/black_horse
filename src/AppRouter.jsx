import React, { Suspense, lazy, useLayoutEffect } from 'react';
import PublicTournamentPage from './PublicTournamentPage';
import PublicSeriesPage from './PublicSeriesPage';

const AdminApp = lazy(() => import('./App'));

export default function AppRouter() {
  const params = new URLSearchParams(window.location.search);
  const admin = params.has('admin');
  useLayoutEffect(() => {
    document.documentElement.dataset.surface = admin ? 'admin' : 'public';
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.content = admin ? '#0d0f12' : '#242728';
  }, [admin]);
  if (admin) return <div className="admin-viewport"><Suspense fallback={<main role="status" className="p-6">正在載入管理後台…</main>}><AdminApp /></Suspense></div>;
  if (params.has('series')) return <PublicSeriesPage initialCode={params.get('series')} />;
  return <PublicTournamentPage initialCode={params.get('event') || ''} />;
}
