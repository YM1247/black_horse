import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import PublicTournamentPage from './PublicTournamentPage';

vi.mock('./firebase', () => ({ isFirebaseConfigured: true }));

vi.mock('./services/tournamentRepository', () => ({
  normalizeEventCode: value => String(value || '').trim().toUpperCase(),
  validateEventCode: value => /^[A-Z0-9]{4,10}$/.test(String(value || '').trim().toUpperCase()),
  subscribeTournament: (code, onTournament) => {
    const alice = { id: 'alice', name: 'Alice', wins: 1, votes: 3, isWithdrawn: false, isEliminated: false };
    const bob = { id: 'bob', name: 'Bob', wins: 0, votes: 0, isWithdrawn: false, isEliminated: false };
    const value = {
      id: 'MOCK819',
      name: '8/19',
      phase: 'finished',
      judgeCount: 3,
      doubleElimination: true,
      players: [alice, bob],
      rounds: [[{
        id: 'match-1',
        round: 1,
        p1: alice,
        p2: bob,
        p1Votes: 3,
        p2Votes: 0,
        p1WinsSnapshot: 0,
        p2WinsSnapshot: 0,
        p1VotesSnapshot: 0,
        p2VotesSnapshot: 0,
        isMCMatch: false
      }]],
      clientUpdatedAt: '2026-08-20T10:00:00.000Z',
      sync: { fromCache: false, hasPendingWrites: false }
    };
    if (code === 'REGNOW') { value.phase = 'registration'; value.rounds = []; }
    if (code === 'OFF123') value.sync.fromCache = true;
    onTournament(value);
    return vi.fn();
  }
}));

test('a finished public tournament puts final standings before the bracket without duplicate round details', async () => {
  render(<PublicTournamentPage initialCode="MOCK819" />);

  expect(await screen.findByRole('heading', { name: '8/19' })).toBeInTheDocument();
  const standings = screen.getByRole('region', { name: '最終排名' });
  const bracket = screen.getByRole('region', { name: '完整瑞士制樹狀圖' });
  expect(screen.queryByText('逐輪對戰')).not.toBeInTheDocument();
  const roundHeading = screen.getAllByRole('heading', { name: 'ROUND 1' }).at(-1);

  expect(standings.compareDocumentPosition(bracket) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(standings.compareDocumentPosition(roundHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(standings).toHaveTextContent('本場積分 100');
});


test('手機輪次與排名連結可回到同一場賽事，保留已載入的比分', async () => {
  window.history.replaceState({}, '', '/?event=MOCK819');
  render(<PublicTournamentPage initialCode="MOCK819" />);
  expect(await screen.findByRole('heading', {name:'8/19'})).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: '公開頁面導覽' });
  for (const link of nav.querySelectorAll('a')) {
    expect(document.querySelector(link.hash)).toBeInTheDocument();
    window.history.replaceState({}, '', '/?event=MOCK819' + link.hash);
    fireEvent(window, new PopStateEvent('popstate'));
    expect(screen.getByRole('region', { name: '最終排名' })).toHaveTextContent('Alice');
  }
  window.history.replaceState({}, '', '/');
});

test('尚無賽程時隱藏搜尋、排名與沒有目標的導覽', async () => {
  render(<PublicTournamentPage initialCode="REGNOW" />);
  expect(await screen.findByText('賽程尚未公布，開賽後會即時更新。')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '即時排名' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '完整瑞士制賽程' })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '公開頁面導覽' })).not.toBeInTheDocument();
});

test('斷線時使用同風格提示，隱藏無法連線的重試操作', async () => {
  const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  try {
    render(<PublicTournamentPage initialCode="OFF123" />);
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveClass('public-notice', 'public-notice--offline');
    expect(notice).toHaveTextContent('目前離線');
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument();
  } finally { offline.mockRestore(); }
});
