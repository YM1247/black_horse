import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import PublicTournamentPage from './PublicTournamentPage';

vi.mock('./firebase', () => ({ isFirebaseConfigured: true }));

vi.mock('./services/tournamentRepository', () => ({
  normalizeEventCode: value => String(value || '').trim().toUpperCase(),
  validateEventCode: value => /^[A-Z0-9]{4,10}$/.test(String(value || '').trim().toUpperCase()),
  subscribeTournament: (_code, onTournament) => {
    const alice = { id: 'alice', name: 'Alice', wins: 1, votes: 3, isWithdrawn: false, isEliminated: false };
    const bob = { id: 'bob', name: 'Bob', wins: 0, votes: 0, isWithdrawn: false, isEliminated: false };
    onTournament({
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
    });
    return vi.fn();
  }
}));

test('a finished public tournament puts final standings before the bracket and round details', async () => {
  render(<PublicTournamentPage initialCode="MOCK819" />);

  expect(await screen.findByRole('heading', { name: '8/19' })).toBeInTheDocument();
  const standings = screen.getByRole('region', { name: '最終排名' });
  const bracket = screen.getByRole('region', { name: '完整瑞士制樹狀圖' });
  const roundHeading = screen.getAllByRole('heading', { name: 'ROUND 1' }).at(-1);

  expect(standings.compareDocumentPosition(bracket) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(standings.compareDocumentPosition(roundHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(standings).toHaveTextContent('本場積分 100');
});
