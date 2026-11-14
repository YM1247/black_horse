import { fireEvent, render, screen, within } from '@testing-library/react';
import PublicTournamentBracket from './PublicTournamentBracket';

const player = (id, name) => ({ id, name, isMC: false });

const match = ({ id, p1, p2, round, p1Wins, p2Wins, p1Votes, p2Votes }) => ({
  id,
  p1,
  p2,
  round,
  p1WinsSnapshot: p1Wins,
  p2WinsSnapshot: p2Wins,
  p1VotesSnapshot: 0,
  p2VotesSnapshot: 0,
  p1Votes,
  p2Votes,
  isMCMatch: false
});

test('public bracket renders all Swiss rounds and remains read-only', () => {
  const alice = player('alice', 'Alice');
  const bob = player('bob', 'Bob');
  const carol = player('carol', 'Carol');
  const rounds = [
    [match({ id: 'r1', p1: alice, p2: bob, round: 1, p1Wins: 0, p2Wins: 0, p1Votes: 3, p2Votes: 0 })],
    [match({ id: 'r2', p1: alice, p2: carol, round: 2, p1Wins: 1, p2Wins: 0, p1Votes: 2, p2Votes: 1 })],
    [match({ id: 'r3', p1: alice, p2: bob, round: 3, p1Wins: 2, p2Wins: 1, p1Votes: null, p2Votes: null })]
  ];

  render(<PublicTournamentBracket rounds={rounds} />);

  const bracket = screen.getByRole('region', { name: '完整瑞士制樹狀圖' });
  expect(within(bracket).getByText('ROUND 1')).toBeInTheDocument();
  expect(within(bracket).getByText('ROUND 2')).toBeInTheDocument();
  expect(within(bracket).getByText('ROUND 3')).toBeInTheDocument();
  expect(within(bracket).getAllByText('跨組對戰')).toHaveLength(2);
  expect(bracket).toHaveTextContent('Alice');
  expect(bracket).toHaveTextContent('Bob');
  expect(bracket).toHaveTextContent('Carol');
  expect(bracket).toHaveTextContent('VS');
  expect(within(bracket).queryByRole('button')).not.toBeInTheDocument();
});

import { vi } from 'vitest';

const adminMatch = (id, wins) => ({
  id, p1: { name: `先攻${id}` }, p2: { name: `後攻${id}` },
  p1WinsSnapshot: wins, p2WinsSnapshot: wins, p1Votes: null, p2Votes: null
});

test('後台樹狀圖分組排序後仍保留每輪原始場次編號及記分對象', () => {
  const rounds = [[], [adminMatch('low', 0), adminMatch('high', 1)]];
  const onScore = vi.fn();
  render(<PublicTournamentBracket rounds={rounds} renderScore={(bout, round) => (
    <button onClick={() => onScore(round, bout.id)}>記分</button>
  )} />);
  const groups = screen.getAllByRole('group');
  expect(groups[0]).toHaveAccessibleName('第 2 輪 第 2 場');
  expect(groups[1]).toHaveAccessibleName('第 2 輪 第 1 場');
  fireEvent.click(within(groups[0]).getByRole('button', { name: '記分' }));
  expect(onScore).toHaveBeenCalledWith(1, 'high');
});

test('公開樹狀圖不顯示後台場次編號或記分控制', () => {
  render(<PublicTournamentBracket rounds={[[adminMatch('one', 0)]]} />);
  expect(screen.queryByRole('group')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText(/第.*場/)).not.toBeInTheDocument();
});
