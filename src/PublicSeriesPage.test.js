import { render, screen, waitFor } from '@testing-library/react';
import PublicSeriesPage from './PublicSeriesPage';

jest.mock('./firebase', () => ({ isFirebaseConfigured: true }));

jest.mock('./services/tournamentRepository', () => ({
  normalizeEventCode: value => String(value || '').trim().toUpperCase(),
  validateEventCode: value => /^[A-Z0-9]{4,10}$/.test(String(value || '').trim().toUpperCase()),
  subscribePublicSeries: (code, onSeries) => {
    onSeries({
      id: code,
      publicCode: code,
      name: '模擬賽',
      description: '系列說明',
      clientUpdatedAt: '2026-08-13T10:00:00.000Z',
      sync: { fromCache: false },
      events: [
        { id: 'one', name: '8/19', eventCode: 'MOCK819', judgeCount: 3, doubleElimination: true },
        { id: 'two', name: '8/21', eventCode: 'MOCK821', judgeCount: 3, doubleElimination: true }
      ]
    });
    return jest.fn();
  },
  subscribeTournament: (code, onTournament) => {
    onTournament({
      id: code,
      phase: code === 'MOCK819' ? 'finished' : 'playing',
      players: code === 'MOCK819' ? [{ id: 'alice', name: 'Alice', wins: 1, votes: 3 }] : [],
      rounds: code === 'MOCK819' ? [[{
        id: 'm1', p1: { id: 'alice', name: 'Alice' }, p2: { id: 'bob', name: 'Bob' }, p1Votes: 3, p2Votes: 0
      }]] : [],
      clientUpdatedAt: '2026-08-13T10:01:00.000Z',
      sync: { fromCache: false }
    });
    return jest.fn();
  }
}));

test('public series page shows public events and computes finished-event standings', async () => {
  render(<PublicSeriesPage initialCode="SIM2026" />);

  expect(await screen.findByRole('heading', { name: '模擬賽' })).toBeInTheDocument();
  expect(screen.getByText('系列說明・系列代碼 SIM2026')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '8/19' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '8/21' })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: '查看單場賽況' })[0]).toHaveAttribute('href', '/?event=MOCK819');
  await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
  expect(screen.getByText('已完賽')).toBeInTheDocument();
  expect(screen.getByText('進行中')).toBeInTheDocument();
});
