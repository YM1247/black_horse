import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TournamentAdminApp } from './App';
import { QUALIFIER } from './seasonTournament';
import { createCloudTournament, saveCloudTournament } from './services/tournamentRepository';

vi.mock('./firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('./services/playerDirectory', () => ({
  subscribePlayers: (cb) => {
    cb([]);
    return () => {};
  }
}));
vi.mock('./services/tournamentRepository', async (importOriginal) => {
  const actual = await importOriginal();
  const stored = new Map();
  return {
    ...actual,
    ensureCloudSeries: vi.fn(async () => {}),
    ensureTournamentSummaries: vi.fn(async () => {}),
    subscribeAuth: (cb) => {
      cb({ uid: 'admin' });
      return () => {};
    },
    subscribeAdminTournaments: (cb) => {
      cb([]);
      return () => {};
    },
    subscribeCloudSeries: (_id, cb) => {
      cb(null);
      return () => {};
    },
    subscribeTournament: (id, cb) => {
      cb(stored.get(id) || null);
      return () => {};
    },
    subscribeTournamentVersions: () => () => {},
    subscribeTournamentAuditLogs: () => () => {},
    syncPublicSeriesProjection: vi.fn(async () => {}),
    createCloudTournament: vi.fn(async ({ eventCode, name, tournament }) => {
      stored.set(eventCode, { ...tournament, id: eventCode, name, revision: 0, isPublic: true });
      return eventCode;
    }),
    saveCloudTournament: vi.fn()
  };
});

it('系列卡建立第一站後進入新制報名，離開不會以舊版自動儲存覆寫名單', async () => {
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  fireEvent.click(await screen.findByRole('button', { name: /黑馬記念26-27.*進入管理/ }));
  fireEvent.click(await screen.findByRole('button', { name: '建立 積分賽第一場' }));
  expect(await screen.findByRole('heading', { name: '選手報名' })).toBeInTheDocument();
  expect(createCloudTournament.mock.calls[0][0].tournament).toMatchObject({
    rulesVersion: QUALIFIER,
    judgeCount: 3,
    doubleElimination: true,
    seriesId: 'black-horse-26-27'
  });
  fireEvent.click(screen.getByRole('button', { name: '返回賽事管理' }));
  expect(await screen.findByRole('heading', { name: '黑馬記念26-27' })).toBeInTheDocument();
  expect(saveCloudTournament).not.toHaveBeenCalled();
});

it('首頁優先顯示黑馬記念，展開封存系列後仍可進入模擬賽', async () => {
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  const active = await screen.findByRole('button', { name: /黑馬記念26-27.*進入管理/ });
  expect(screen.queryByRole('button', { name: /模擬賽.*進入管理/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: '顯示已封存系列賽' }));
  const archived = screen.getByRole('button', { name: /模擬賽.*已封存.*進入管理/ });
  expect(active.compareDocumentPosition(archived) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(archived);
  expect(await screen.findByRole('heading', { name: '模擬賽' })).toBeInTheDocument();
});
