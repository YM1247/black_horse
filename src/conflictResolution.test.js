import { canReplayCloudOperation, replayCloudOperations } from './conflictResolution';

const players = [
  { id: 'a', name: '甲', wins: 0, votes: 0, losses: 0 },
  { id: 'b', name: '乙', wins: 0, votes: 0, losses: 0 }
];

const baseState = {
  phase: 'playing',
  players,
  rounds: [[{ id: 'match-1', p1: players[0], p2: players[1], p1Votes: null, p2Votes: null }]],
  doubleElimination: true
};

test('score conflict replay recalculates the latest remote state without replacing pairings', () => {
  const replayed = replayCloudOperations(baseState, [{
    action: 'SCORE_UPDATED',
    details: { round: 1, matchId: 'match-1', after: { p1Votes: 2, p2Votes: 1 } }
  }]);

  expect(replayed.rounds[0][0]).toMatchObject({ id: 'match-1', p1Votes: 2, p2Votes: 1 });
  expect(replayed.rounds[0][0].p1.id).toBe('a');
  expect(replayed.players.find(player => player.id === 'a')).toMatchObject({ wins: 1, votes: 2 });
});

test('missing conflict targets are kept as summaries but cannot mutate the latest state', () => {
  const replayed = replayCloudOperations(baseState, [{
    action: 'SCORE_UPDATED',
    details: { round: 2, matchId: 'removed-match', after: { p1Votes: 3, p2Votes: 0 } }
  }]);

  expect(replayed).toEqual(baseState);
  expect(canReplayCloudOperation({ action: 'ROUND_STARTED' })).toBe(false);
  expect(canReplayCloudOperation({ action: 'PLAYER_RENAMED' })).toBe(true);
});
