import { applyDoubleElimination, pairSwissRound, rankPlayers, recalculatePlayerRecords, updateMatchScore } from './tournament';

const player = (id, wins = 0, votes = 0) => ({ id, name: id, wins, votes, isWithdrawn: false });
const completedMatch = (id, p1, p2, p1Votes = 3, p2Votes = 0) => ({
  id, p1, p2, p1Votes, p2Votes, isDone: true, isMCMatch: p2.id === 'MC'
});

test('same-score players avoid previous opponents when another pairing exists', () => {
  const players = [player('A', 1, 3), player('B', 1, 3), player('C', 1, 3), player('D', 1, 3)];
  const previousRound = [
    completedMatch('ab', players[0], players[1]),
    completedMatch('cd', players[2], players[3])
  ];

  const matches = pairSwissRound({ players, rounds: [previousRound], roundNum: 2, random: () => 0 });
  const pairs = matches.map(match => [match.p1.id, match.p2.id].sort().join('-'));

  expect(pairs).not.toContain('A-B');
  expect(pairs).not.toContain('C-D');
  expect(new Set(matches.flatMap(match => [match.p1.id, match.p2.id])).size).toBe(4);
});

test('the same player does not meet MC again while another player is eligible', () => {
  const players = [player('A', 1, 3), player('B'), player('C')];
  const mc = { id: 'MC', name: 'MC', isMC: true, wins: 0, votes: 0 };
  const previousRound = [completedMatch('a-mc', players[0], mc)];

  const matches = pairSwissRound({ players, rounds: [previousRound], roundNum: 2, random: () => 0 });
  const mcMatch = matches.find(match => match.isMCMatch);

  expect(mcMatch.p1.id).not.toBe('A');
});

test('records are fully recalculated after a score edit', () => {
  const players = [player('A'), player('B')];
  const rounds = [[completedMatch('match', players[0], players[1], 3, 0)]];
  const edited = updateMatchScore(rounds, 0, 'match', 1, 2);

  expect(recalculatePlayerRecords(players, edited)).toEqual([
    expect.objectContaining({ id: 'A', wins: 0, votes: 1 }),
    expect.objectContaining({ id: 'B', wins: 1, votes: 2 })
  ]);
});

test('ranking compares opponent win rate after wins and votes', () => {
  const players = [
    player('A', 2, 8), player('B', 2, 8),
    player('C', 1, 3), player('D', 1, 3), player('E', 0, 0), player('F', 0, 0)
  ];
  const rounds = [[
    completedMatch('ac', players[0], players[2]),
    completedMatch('be', players[1], players[4])
  ], [
    completedMatch('ad', players[0], players[3]),
    completedMatch('bf', players[1], players[5])
  ]];

  const ranked = rankPlayers(players, rounds);
  expect(ranked.findIndex(item => item.id === 'A')).toBeLessThan(ranked.findIndex(item => item.id === 'B'));
  expect(ranked.find(item => item.id === 'A').opponentWinRate)
    .toBeGreaterThan(ranked.find(item => item.id === 'B').opponentWinRate);
});

test('players tied on all automatic criteria are marked for a playoff', () => {
  const ranked = rankPlayers([player('A'), player('B')], []);
  expect(ranked[0].displayRank).toBe(1);
  expect(ranked[1].displayRank).toBe(1);
  expect(ranked.every(item => item.needsTiebreaker)).toBe(true);
});

test('a player is eliminated after a second loss when double elimination is enabled', () => {
  const players = [player('A'), player('B'), player('C')];
  const rounds = [
    [completedMatch('ab', players[0], players[1], 0, 3)],
    [completedMatch('ac', players[0], players[2], 1, 2)]
  ];

  const updated = applyDoubleElimination(recalculatePlayerRecords(players, rounds), rounds, true);
  expect(updated.find(item => item.id === 'A')).toMatchObject({ losses: 2, isEliminated: true });
  expect(updated.find(item => item.id === 'B')).toMatchObject({ losses: 0, isEliminated: false });
});

test('eliminated players are excluded from following Swiss pairings', () => {
  const players = [
    { ...player('A'), isEliminated: true },
    player('B'),
    player('C'),
    player('D'),
    player('E')
  ];

  const matches = pairSwissRound({ players, rounds: [], roundNum: 1, random: () => 0 });
  expect(matches.flatMap(match => [match.p1.id, match.p2.id])).not.toContain('A');
});

test('standard Swiss mode records losses without eliminating players', () => {
  const players = [player('A'), player('B')];
  const rounds = [
    [completedMatch('one', players[0], players[1], 0, 3)],
    [completedMatch('two', players[0], players[1], 1, 2)]
  ];

  const updated = applyDoubleElimination(recalculatePlayerRecords(players, rounds), rounds, false);
  expect(updated.find(item => item.id === 'A')).toMatchObject({ losses: 2, isEliminated: false });
});
