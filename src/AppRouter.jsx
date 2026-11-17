import React, { Suspense, lazy } from 'react';
import PublicTournamentPage from './PublicTournamentPage';
import PublicSeriesPage from './PublicSeriesPage';

const AdminApp = lazy(() => import('./App'));

export default function AppRouter() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('admin')) return <Suspense fallback={<main role="status">正在載入管理後台…</main>}><AdminApp /></Suspense>;
  if (params.has('series')) return <PublicSeriesPage initialCode={params.get('series')} />;
  return <PublicTournamentPage initialCode={params.get('event') || ''} />;
}
