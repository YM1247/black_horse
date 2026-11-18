import { assignAttackOrder, createMatch, shuffle } from './tournament';
import { eventRanking, publicPlayer, refreshRecords } from './seasonTournament';
import { AKASHIKI } from './tournamentState';

// Each tied group that affects the draw needs an explicit permutation.
// Groups entirely below the cutoff or entirely within the six seeded places do not.
export function resolveOrder(rows, limit, decisions = {}, unorderedSeeds = 0) {
  const ordered = [],
    ties = [];
  for (let i = 0; i < rows.length && i < limit;) {
    let end = i + 1;
    while (end < rows.length && rows[end].displayRank === rows[i].displayRank) end++;
    const group = rows.slice(i, end);
    if (group.length > 1 && end > unorderedSeeds) {
      const key = group
        .map((p) => p.id)
        .sort()
        .join('|');
      const ids = decisions[key] || [];
      if (
        ids.length !== group.length ||
        new Set(ids).size !== group.length ||
        ids.some((id) => !group.some((p) => p.id === id))
      )
        ties.push({ key, group });
      else group.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    }
    ordered.push(...group);
    i = end;
  }
  return { players: ordered.slice(0, limit), ties };
}

export function qualification(standings, profiles, config = {}) {
  const { online = [], local = '', decisions = {} } = config;
  const ids = [...online.filter(Boolean), local].filter(Boolean);
  const error = (text) => ({ error: text, players: [], ties: [] });
  if (online.length !== 2 || !local || ids.length !== 3 || new Set(ids).size !== 3 || ids.some((id) => !profiles.some((p) => p.id === id)))
    return error('請選擇三位不同的保送與海選選手。');
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const selected = resolveOrder(
    standings.filter((p) => !online.includes(p.id)),
    21,
    decisions,
    6
  );
  if (selected.players.length < 21) return error('積分榜人數不足 21 位。');
  if (selected.ties.length) return { ...selected, error: '請完成影響入圍或配對的同分裁定。' };
  if (selected.players.some((p) => p.id === local)) return error('現場海選與積分入圍重複，請選擇另一位。');
  const list = [
    ...online.map((id) => ({ ...publicPlayer(byId.get(id)), source: '線上保送', seedCredit: true })),
    ...selected.players.map((p, i) => ({ ...publicPlayer(p), source: '積分', seedCredit: i < 6 })),
    { ...publicPlayer(byId.get(local)), source: '現場海選', seedCredit: false }
  ];
  return { players: list, ties: [], error: '' };
}

export function startFinal(event, preview) {
  if (preview.error || preview.players.length !== 24 || new Set(preview.players.map((p) => p.id)).size !== 24)
    throw new Error(preview.error || '資格名單未完成。');
  const pool = preview.players.filter((p) => !p.seedCredit);
  if (pool.length !== 16) throw new Error('應有八位種子。');
  const matches = pool.slice(0, 8).map((p, i) => assignAttackOrder(createMatch(p, pool[15 - i])));
  return refreshRecords({
    ...event,
    phase: 'playing',
    currentRoundNum: 1,
    players: preview.players,
    rounds: [matches],
    qualifiedIds: preview.players.map((p) => p.id)
  });
}

export const playoffGames = [
  ['q1', '八強 1', '1', '8'],
  ['q2', '八強 2', '4', '5'],
  ['q3', '八強 3', '2', '7'],
  ['q4', '八強 4', '3', '6'],
  ['s1', '四強 1', 'q1', 'q2'],
  ['s2', '四強 2', 'q3', 'q4'],
  ['bronze', '季軍戰', 's1', 's2'],
  ['gold', '冠軍戰', 's1', 's2']
];
export const akashikiPlayoffGames = [
  ...Array.from({ length: 8 }, (_, i) => [`r${i + 1}`, `十六強 ${i + 1}`, String(i * 2 + 1), String(i * 2 + 2)]),
  ...Array.from({ length: 4 }, (_, i) => [`q${i + 1}`, `八強 ${i + 1}`, `r${i * 2 + 1}`, `r${i * 2 + 2}`]),
  ...playoffGames.slice(4)
];
export const gamesFor = (event) => event.rulesVersion === AKASHIKI ? akashikiPlayoffGames : playoffGames;
export function resultPlayer(match, winner = true) {
  if (!match?.isDone) return null;
  return match.p1Votes > match.p2Votes === winner ? match.p1 : match.p2;
}

export function buildPlayoff(seeds, existing = {}, games = playoffGames) {
  const bracket = {};
  for (const [key, , first, second] of games) {
    const entrant = (source) => seeds[Number(source) - 1] || resultPlayer(bracket[source], key !== 'bronze');
    const a = entrant(first),
      b = entrant(second);
    if (!a || !b) continue;
    const previous = existing[key];
    bracket[key] =
      previous && [a, b].every((p) => [previous.p1.id, previous.p2.id].includes(p.id))
        ? previous
        : assignAttackOrder(createMatch(publicPlayer(a), publicPlayer(b)));
  }
  return bracket;
}

export function playoffSelection(event, decisions = event.playoffDecisions || {}) {
  const akashiki = event.rulesVersion === AKASHIKI;
  return resolveOrder(
    eventRanking(event, true).filter((p) => !p.isWithdrawn),
    akashiki ? 16 : 8,
    decisions,
    akashiki ? 16 : 0
  );
}

export function seedPlayoff(event, decisions = event.playoffDecisions || {}, random = Math.random) {
  if (event.rounds.length !== 3 || event.rounds.flat().some(match => !match.isDone)) throw new Error('瑞士制三輪需先完賽。');
  const selection = playoffSelection(event, decisions);
  const akashiki = event.rulesVersion === AKASHIKI;
  if (selection.players.length !== (akashiki ? 16 : 8) || selection.ties.length) throw new Error(akashiki ? '請先確認十六強入圍名單與同分裁定。' : '請先確認八強種子順序。');
  let seeds = selection.players.map(publicPlayer);
  if (akashiki) {
    if (event.playoffSeeds?.length === 16) {
      // Corrections retain the saved draw. Replace only displaced entrants.
      const byId = new Map(seeds.map(p => [p.id, p]));
      const replacements = seeds.filter(p => !event.playoffSeeds.some(old => old.id === p.id));
      seeds = event.playoffSeeds.map(p => byId.get(p.id) || replacements.shift());
    } else seeds = shuffle(seeds, random);
  }
  return {
    ...event,
    playoffSeeds: seeds,
    playoffDecisions: decisions,
    bracket: buildPlayoff(seeds, event.bracket, gamesFor(event))
  };
}

export function scorePlayoff(event, key, left, gameIndex) {
  if (event.rulesVersion === AKASHIKI && key === 'gold') return scoreFinalGame(event, left, gameIndex);
  const judges = event.rulesVersion === AKASHIKI ? 3 : 5;
  if (!event.bracket[key] || !Number.isInteger(left) || left < 0 || left > judges) throw new Error(`無效的${judges}票比分。`);
  const updated = {
    ...event.bracket,
    [key]: { ...event.bracket[key], p1Votes: left, p2Votes: judges - left, isDone: true }
  };
  return { ...event, bracket: buildPlayoff(event.playoffSeeds, updated, gamesFor(event)) };
}

// A withdrawal applies to this bout only; a semifinal loser can still play for bronze.
export function forfeitPlayoff(event, key, loserId) {
  const match = event.bracket?.[key];
  if (!match || match.isDone || ![match.p1.id, match.p2.id].includes(loserId))
    throw new Error('只能登錄尚未完成對戰的參賽者棄賽。');
  const left = match.p1.id === loserId ? 0 : (event.rulesVersion === AKASHIKI ? 3 : 5);
  let next = event;
  if (event.rulesVersion === AKASHIKI && key === 'gold') {
    while (!next.bracket.gold.isDone)
      next = scorePlayoff(next, key, left, next.bracket.gold.games?.length || 0);
  } else next = scorePlayoff(event, key, left);
  return next;
}

function scoreFinalGame(event, left, gameIndex) {
  const match = event.bracket?.gold;
  const games = [...(match?.games || [])];
  if (!match || !Number.isInteger(left) || left < 0 || left > 3 ||
      !Number.isInteger(gameIndex) || gameIndex < 0 || gameIndex > 2 || gameIndex > games.length ||
      (match.isDone && gameIndex >= games.length)) throw new Error('請依序登錄冠軍戰每局的三票比分。');
  games[gameIndex] = { p1Votes: left, p2Votes: 3 - left };
  let p1Wins = 0, p2Wins = 0, played = 0;
  for (const game of games) {
    if (p1Wins === 2 || p2Wins === 2) break;
    if (game.p1Votes > game.p2Votes) p1Wins++;
    else p2Wins++;
    played++;
  }
  return { ...event, bracket: { ...event.bracket, gold: {
    ...match, games: games.slice(0, played), p1Votes: p1Wins, p2Votes: p2Wins,
    isDone: p1Wins === 2 || p2Wins === 2
  } } };
}

export const displacedGames = (before, after) =>
  gamesFor(before)
    .filter(([key]) => before.bracket?.[key] && before.bracket[key].id !== after.bracket?.[key]?.id)
    .map(([, name]) => name);
