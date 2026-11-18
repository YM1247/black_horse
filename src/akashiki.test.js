import { describe, expect, it } from 'vitest';
import { AKASHIKI, createEmptyTournament, normalizeTournamentData } from './tournamentState';
import { eventRanking, nextSwissRound, publicPlayer, registeredPlayers, scoreSwiss, withdrawPlayer } from './seasonTournament';
import { pairVoteSwissRound, rankPlayers } from './tournament';
import { forfeitPlayoff, displacedGames, gamesFor, playoffSelection, resultPlayer, scorePlayoff, seedPlayoff } from './finalTournament';
import { decodeTournamentFromFirestore, encodeTournamentForFirestore } from './services/tournamentRepository';

const players = (n = 32) => Array.from({ length: n }, (_, i) => publicPlayer({ id: `p${i}`, name: `選手${i}` }));
function swissComplete() {
  let event = { ...createEmptyTournament({ rulesVersion: AKASHIKI }), players: players() };
  for (let round = 0; round < 3; round++) {
    event = nextSwissRound(event);
    for (const [i, match] of event.rounds[round].entries()) event = scoreSwiss(event, round, match.id, i % 4);
  }
  return event;
}
function draw(event) {
  const decisions = Object.fromEntries(playoffSelection(event).ties.map(({ key, group }) => [key, group.map(p => p.id)]));
  return seedPlayoff(event, decisions, () => 0);
}
function medalEvent() {
  let event = draw(swissComplete());
  for (const [key] of gamesFor(event)) if (key !== 'gold') event = scorePlayoff(event, key, 3);
  return event;
}

describe('Akashiki 合作賽', () => {
  it('固定三票與無兩敗淘汰，限制 32 人且獨立保存規則與 BO3 每局', () => {
    const state = createEmptyTournament({ rulesVersion: AKASHIKI, judgeCount: 5, doubleElimination: true });
    expect(state).toMatchObject({ rulesVersion: AKASHIKI, judgeCount: 3, doubleElimination: false });
    expect(nextSwissRound({ ...state, players: players(31) }).rounds[0]).toHaveLength(16);
    expect(nextSwissRound({ ...state, players: players(20) }).rounds[0]).toHaveLength(10);
    expect(() => nextSwissRound({ ...state, players: players(33) })).toThrow('32');
    expect(() => registeredPlayers(players(), players(1), 32)).toThrow();
    let event = scorePlayoff(medalEvent(), 'gold', 3, 0);
    event = scorePlayoff(event, 'gold', 0, 1);
    const restored = normalizeTournamentData(decodeTournamentFromFirestore(encodeTournamentForFirestore(event)));
    expect(restored.bracket).toEqual(event.bracket);
    expect(restored.playoffSeeds).toEqual(event.playoffSeeds);
    expect(restored.rulesVersion).toBe(AKASHIKI);
  });

  it('票數先於勝場排序與配對，同票再比較勝場，舊賽制仍勝場優先', () => {
    const pool = players(4).map((p, i) => ({ ...p, votes: [5, 5, 4, 3][i], wins: [1, 0, 2, 1][i] }));
    expect(eventRanking({ rulesVersion: AKASHIKI, players: pool, rounds: [] }).map(p => p.id)).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(rankPlayers(pool, [])[0].id).toBe('p2');
    const matches = pairVoteSwissRound({ players: pool, rounds: [], roundNum: 2, random: () => 0 });
    expect(matches.map(m => [m.p1.id, m.p2.id].sort())).toEqual([['p0', 'p1'], ['p2', 'p3']]);
    const previous = [[{ p1: pool[0], p2: pool[1] }, { p1: pool[2], p2: pool[3] }]];
    const newMatches = pairVoteSwissRound({ players: pool.map(p => ({ ...p, votes: 5 })), rounds: previous, roundNum: 3 });
    expect(newMatches.every(m => !previous[0].some(old => [old.p1.id, old.p2.id].includes(m.p1.id) && [old.p1.id, old.p2.id].includes(m.p2.id)))).toBe(true);
  });

  it('32 人完整三輪每輪 16 場，兩敗照常參賽，隨機十六強不依排名種子配對', () => {
    const event = swissComplete();
    expect(event.rounds.map(r => r.length)).toEqual([16, 16, 16]);
    expect(event.players.some(p => p.losses >= 2)).toBe(true);
    expect(event.players.every(p => !p.isEliminated)).toBe(true);
    expect(eventRanking(event).every(p => p.rankingPoints === 0)).toBe(true);
    for (const round of event.rounds) expect(new Set(round.flatMap(m => [m.p1.id, m.p2.id])).size).toBe(32);
    const seeded = draw(event);
    expect(seeded.playoffSeeds).toHaveLength(16);
    expect(Object.keys(seeded.bracket)).toHaveLength(8);
    const rows = playoffSelection(seeded).players;
    expect(new Set(seeded.playoffSeeds.map(p => p.id))).toEqual(new Set(rows.map(p => p.id)));
    expect(seeded.playoffSeeds.map(p => p.id)).not.toEqual(rows.map(p => p.id));
    expect(seedPlayoff(seeded).bracket).toEqual(seeded.bracket);
  });

  it('僅入圍線並列需裁定，入圍內並列不影響隨機抽籤', () => {
    const event = { ...createEmptyTournament({ rulesVersion: AKASHIKI }), players: players().map((p, i) => ({ ...p, votes: i < 15 ? 3 : i < 17 ? 2 : 1 })), rounds: [[], [], []] };
    const selection = playoffSelection(event);
    expect(selection.ties).toHaveLength(1);
    expect(selection.ties[0].group.map(p => p.id)).toEqual(['p15', 'p16']);
    expect(() => seedPlayoff(event)).toThrow('同分');
    const seeded = seedPlayoff(event, { [selection.ties[0].key]: ['p16', 'p15'] });
    expect(seeded.playoffSeeds.some(p => p.id === 'p16')).toBe(true);
    expect(seeded.playoffSeeds.some(p => p.id === 'p15')).toBe(false);
  });

  it('棄賽造成奇數時需指定實際補位，補位者不占入圍名額', () => {
    let event = nextSwissRound({ ...createEmptyTournament({ rulesVersion: AKASHIKI }), players: players() });
    event = withdrawPlayer(event, event.rounds[0][0].p1.id);
    for (const m of event.rounds[0]) if (!m.isDone) event = scoreSwiss(event, 0, m.id, 3);
    expect(() => nextSwissRound(event)).toThrow('補位');
    event = nextSwissRound(event, { substituteName: '實際主辦' });
    expect(event.rounds[1]).toHaveLength(16);
    expect(eventRanking(event, true).some(p => p.isOrganizer)).toBe(false);
  });

  it('瑞士成績更正改變入圍集合時只替換原籤位，不重新隨機抽籤', () => {
    const original = { ...createEmptyTournament({ rulesVersion: AKASHIKI }), players: players().map((p, i) => ({ ...p, votes: 32 - i })), rounds: [[], [], []] };
    const seeded = seedPlayoff(original, {}, () => 0);
    const corrected = seedPlayoff({ ...seeded, players: seeded.players.map(p => p.id === 'p31' ? { ...p, votes: 99 } : p) });
    expect(corrected.playoffSeeds.map(p => p.id)).toEqual(seeded.playoffSeeds.map(p => p.id === 'p15' ? 'p31' : p.id));
    for (const [key, match] of Object.entries(seeded.bracket)) {
      if (![match.p1.id, match.p2.id].includes('p15')) expect(corrected.bracket[key]).toEqual(match);
    }
  });

  it.each([[3, 3], [0, 0], [3, 0, 3], [0, 3, 0]])('冠軍戰先贏兩局、每局三票：%j', (...scores) => {
    // it.each supplies the array entries as separate arguments.
    let event = medalEvent();
    scores.forEach((left, i) => {
      event = scorePlayoff(event, 'gold', left, i);
      expect(event.bracket.gold.isDone).toBe(i === scores.length - 1);
    });
    expect(event.bracket.gold.games).toHaveLength(scores.length);
    expect(new Set([resultPlayer(event.bracket.gold), resultPlayer(event.bracket.gold, false), resultPlayer(event.bracket.bronze)].map(p => p.id)).size).toBe(3);
    expect(() => scorePlayoff(event, 'gold', 3, scores.length)).toThrow();
  });

  it('更正前輪只清除受影響晉級賽；冠軍 2:0 更正成 1:1 後可補第三局', () => {
    let event = medalEvent();
    expect(() => scorePlayoff(event, 'r1', 5)).toThrow('3');
    expect(() => scorePlayoff(event, 'gold', 3, 1)).toThrow('依序');
    event = scorePlayoff(scorePlayoff(event, 'gold', 3, 0), 'gold', 3, 1);
    const corrected = scorePlayoff(event, 'gold', 0, 0);
    expect(corrected.bracket.gold).toMatchObject({ p1Votes: 1, p2Votes: 1, isDone: false });
    expect(scorePlayoff(corrected, 'gold', 0, 2).bracket.gold).toMatchObject({ p1Votes: 1, p2Votes: 2, isDone: true });
    const changed = scorePlayoff(event, 'r1', 0);
    expect(displacedGames(event, changed)).toEqual(['八強 1', '四強 1', '季軍戰', '冠軍戰']);
    expect(changed.bracket.r2).toEqual(event.bracket.r2);
    expect(changed.bracket.s2).toEqual(event.bracket.s2);
    expect(changed.bracket.gold).toBeUndefined();
  });
});

test('主辦不列入完賽共同名次，後續名次按正式選手計算', () => {
  const players = [{ id: 'host', votes: 9, wins: 3, isOrganizer: true },
    { id: 'a', votes: 6, wins: 2 }, { id: 'b', votes: 6, wins: 2 }, { id: 'c', votes: 2, wins: 0 }];
  expect(eventRanking({ players, rounds: [], phase: 'finished', rulesVersion: AKASHIKI })
    .map(p => [p.id, p.displayRank, p.needsTiebreaker])).toEqual([['a', 1, true], ['b', 1, true], ['c', 3, false]]);
});

it('十六強抽籤前棄賽依排名遞補，抽籤後棄賽保留籤位且對手全票晉級', () => {
  const original = { ...createEmptyTournament({ rulesVersion: AKASHIKI }), players: players().map((p, i) => ({ ...p, votes: 32 - i })), rounds: [[], [], []] };
  const withdrawn = { ...original, players: original.players.map(p => p.id === 'p0' ? { ...p, isWithdrawn: true } : p) };
  const drawn = seedPlayoff(withdrawn, {}, () => 0);
  expect(drawn.playoffSeeds.map(p => p.id)).not.toContain('p0');
  expect(drawn.playoffSeeds.map(p => p.id)).toContain('p16');
  const match = drawn.bracket.r1;
  const next = forfeitPlayoff(drawn, 'r1', match.p1.id);
  expect(next.bracket.r1).toMatchObject({ p1Votes: 0, p2Votes: 3, isDone: true });
  expect(next.playoffSeeds).toEqual(drawn.playoffSeeds);
  expect(() => forfeitPlayoff(next, 'r1', match.p1.id)).toThrow();
});

it('四強棄賽只判該場負，仍進入未完成的季軍戰', () => {
  let event = draw(swissComplete());
  for (const [key] of gamesFor(event)) if (key.startsWith('r') || key.startsWith('q')) event = scorePlayoff(event, key, 3);
  const loser = event.bracket.s1.p1.id;
  event = forfeitPlayoff(event, 's1', loser);
  event = scorePlayoff(event, 's2', 3);
  expect([event.bracket.bronze.p1.id, event.bracket.bronze.p2.id]).toContain(loser);
  expect(event.bracket.bronze.isDone).toBe(false);
});

it.each([0, 1])('BO3 棄賽保留已完成局，棄賽方 %s，其餘局全票至對手兩勝', side => {
  let event = medalEvent();
  event = scorePlayoff(event, 'gold', side === 0 ? 2 : 1, 0);
  const first = event.bracket.gold.games[0];
  const loser = side === 0 ? event.bracket.gold.p1 : event.bracket.gold.p2;
  const next = forfeitPlayoff(event, 'gold', loser.id);
  expect(next.bracket.gold.games[0]).toEqual(first);
  expect(next.bracket.gold.games.slice(1)).toEqual(Array(2).fill(side === 0 ? { p1Votes: 0, p2Votes: 3 } : { p1Votes: 3, p2Votes: 0 }));
  expect(next.bracket.gold.isDone).toBe(true);
  expect(resultPlayer(next.bracket.gold).id).not.toBe(loser.id);
});
