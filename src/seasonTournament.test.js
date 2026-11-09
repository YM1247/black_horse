import { describe, expect, it } from 'vitest';
import {
  eventRanking,
  groupPoints,
  nextRoundDecision,
  nextSwissRound,
  publicPlayer,
  QUALIFIER,
  registeredPlayers,
  scoreSwiss
} from './seasonTournament';

const event = (n) => ({
  rulesVersion: QUALIFIER,
  phase: 'registration',
  judgeCount: 3,
  doubleElimination: true,
  rounds: [],
  players: Array.from({ length: n }, (_, i) => publicPlayer({ id: String(i), name: '選手' + i }))
});
const finishRound = (state) =>
  state.rounds.at(-1).reduce((current, match) => scoreSwiss(current, state.rounds.length - 1, match.id, 3), state);

describe('新制積分賽', () => {
  it.each([47, 48])('%i 位選手全部取得固定攻序的配對', (count) => {
    const started = nextSwissRound(event(count));
    expect(started.rounds[0]).toHaveLength(24);
    expect(started.players.filter((player) => player.isOrganizer)).toHaveLength(count % 2);
    expect(started.rounds[0].every((match) => match.attackOrder)).toBe(true);
    expect(() => registeredPlayers(event(48).players, [{ id: 'new', name: '新' }])).toThrow('48');
  });
  it('三輪後主辦不占名次或級距', () => {
    let state = event(47);
    for (let i = 0; i < 3; i++) {
      const decision = nextRoundDecision(state);
      state = finishRound(nextSwissRound(state, { reviveId: decision.revival?.[0].id }));
    }
    const ranked = eventRanking(state, true);
    expect(ranked).toHaveLength(47);
    expect(ranked.some((p) => p.isOrganizer)).toBe(false);
  });
  it('第三輪最高並列才可復活，棄賽不參與復活', () => {
    const state = event(6);
    state.rounds = [[], []];
    state.players.slice(3).forEach((p) => {
      p.isEliminated = true;
    });
    state.players[5].isWithdrawn = true;
    expect(nextRoundDecision(state).revival.map((p) => p.id)).toEqual(['3', '4']);
    expect(() => nextSwissRound(state)).toThrow('裁定');
    expect(nextSwissRound(state, { reviveId: '4' }).rounds[2]).toHaveLength(2);
    state.rounds = [[]];
    expect(() => nextSwissRound(state)).toThrow('補位');
    expect(nextSwissRound(state, { substituteName: '補位甲' }).players.at(-1).isOrganizer).toBe(true);
  });
  it('按共同名次分組給分', () => {
    expect(Array.from({ length: 10 }, (_, i) => groupPoints(2, 1, i + 1, 10))).toEqual([
      55, 55, 55, 55, 47, 47, 47, 40, 40, 40
    ]);
    expect([1, 2, 3, 4].map((i) => groupPoints(1, 2, i, 4))).toEqual([30, 30, 24, 18]);
    expect([1, 2, 3, 4, 5, 6].map((i) => groupPoints(3, 0, i, 6))).toEqual([100, 95, 90, 85, 75, 70]);
    expect(groupPoints(0, 2, 1, 1)).toBe(10);
    expect(groupPoints(0, 3, 1, 1)).toBe(10);
  });
});

it('主辦名次領先仍先移除；跨分界並列者領取相同積分', () => {
  const state = event(7);
  state.players[0].isOrganizer = true;
  const opponent = { id: 'opponent', name: '對手' };
  state.rounds = [[], [], []];
  for (const [i, p] of state.players.entries()) {
    p.wins = i === 0 ? 3 : 2;
    const scores = i === 0 ? [3, 3, 3] : i === 1 ? [3, 3, 1] : i <= 3 ? [3, 3, 0] : [3, 2, 0];
    p.votes = scores.reduce((a, b) => a + b, 0);
    scores.forEach((score, j) =>
      state.rounds[j].push({ p1: p, p2: opponent, p1Votes: score, p2Votes: 3 - score, isDone: true })
    );
  }
  const rows = eventRanking(state, true);
  expect(rows.map((p) => p.displayRank)).toEqual([1, 2, 2, 4, 4, 4]);
  expect(rows.map((p) => p.rankingPoints)).toEqual([55, 55, 55, 47, 47, 47]);
});
