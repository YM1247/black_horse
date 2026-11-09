import {
  applyDoubleElimination,
  pairSwissRound,
  rankPlayers,
  recalculatePlayerRecords,
  updateMatchScore
} from './tournament';
import { createId, FINAL, QUALIFIER } from './tournamentState';

export { FINAL, QUALIFIER };
export const isSeasonEvent = (event) => [QUALIFIER, FINAL].includes(event?.rulesVersion);

export const publicPlayer = ({ id, name }) => ({ id, name, wins: 0, losses: 0, votes: 0 });
export const organizer = (name = '主辦', id = 'organizer') => ({
  ...publicPlayer({ id, name }),
  isOrganizer: true
});

export function registeredPlayers(players, additions) {
  const result = [...players];
  for (const player of additions) {
    if (result.some((item) => item.id === player.id)) throw new Error('這位選手已在本場名單中。');
    result.push(publicPlayer(player));
  }
  if (result.length > 48) throw new Error('正式選手上限為 48 人。');
  return result;
}

export function groupPoints(wins, losses, place, count) {
  if (wins === 3 && losses === 0) return [100, 95, 90, 85, 75, 70][place - 1] ?? 0;
  if (wins === 0 && [2, 3].includes(losses)) return 10;
  const tiers = wins === 2 && losses === 1 ? [55, 47, 40] : wins === 1 && losses === 2 ? [30, 24, 18] : null;
  if (!tiers) return 0;
  return tiers[place <= Math.ceil(count / 3) ? 0 : place <= Math.ceil((2 * count) / 3) ? 1 : 2];
}

export function eventRanking(event, final = event.phase === 'finished') {
  const ranked = rankPlayers(event.players || [], event.rounds || []);
  if (!isSeasonEvent(event)) return ranked;
  const rows = ranked.filter((player) => !final || !player.isOrganizer);
  const groups = new Map();
  let previousRank;
  let displayRank;
  rows.forEach((player, index) => {
    const rank = player.displayRank;
    if (rank !== previousRank) displayRank = player.isWithdrawn ? '棄賽' : index + 1;
    player.displayRank = displayRank;
    previousRank = rank;
    player.rankingPoints = 0;
    if (player.isWithdrawn) return;
    const key = [player.wins, player.losses].join('-');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(player);
  });
  for (const group of groups.values()) {
    for (const player of group) {
      if (final && event.rulesVersion === QUALIFIER) {
        const place = group.findIndex((item) => item.displayRank === player.displayRank) + 1;
        player.rankingPoints = groupPoints(player.wins, player.losses, place, group.length);
      }
    }
  }
  for (const player of rows) {
    player.needsTiebreaker =
      !player.isWithdrawn &&
      rows.some((other) => other.id !== player.id && other.displayRank === player.displayRank);
  }
  return rows;
}

export function refreshRecords(event) {
  const players = recalculatePlayerRecords(event.players, event.rounds).map((player) =>
    player.seedCredit ? { ...player, wins: player.wins + 1, votes: player.votes + 5 } : player
  );
  const updated = applyDoubleElimination(players, event.rounds, event.doubleElimination).map((player) =>
    player.revivedRound === event.rounds.length ? { ...player, isEliminated: false } : player
  );
  return { ...event, players: updated };
}

export function nextRoundDecision(event) {
  const active = event.players.filter((player) => !player.isWithdrawn && !player.isEliminated);
  if (active.length % 2 === 0) return {};
  if (event.rounds.length === 2 && event.doubleElimination) {
    const eligible = eventRanking(event, false).filter((player) => player.isEliminated && !player.isWithdrawn);
    if (eligible.length)
      return { revival: eligible.filter((player) => player.displayRank === eligible[0].displayRank) };
  }
  return { substitute: true };
}

export function nextSwissRound(event, { reviveId, substituteName } = {}) {
  const roundNum = event.rounds.length + 1;
  if (roundNum > 3 || event.rounds.flat().some((match) => !match.isDone))
    throw new Error('請先完成當輪全部比分。');
  let players = [...event.players];
  if (roundNum === 1 && players.length < 2) throw new Error('至少需要兩位選手。');
  if (roundNum === 1 && players.length > 48) throw new Error('正式選手上限為 48 人。');
  if (roundNum === 1 && players.length % 2) players.push(organizer());
  const decision = nextRoundDecision({ ...event, players });
  if (decision.revival) {
    const id = decision.revival.length === 1 ? decision.revival[0].id : reviveId;
    if (!decision.revival.some((player) => player.id === id)) throw new Error('請裁定一位並列的復活選手。');
    players = players.map((player) =>
      player.id === id ? { ...player, isEliminated: false, revivedRound: roundNum } : player
    );
  }
  if (decision.substitute) {
    if (!substituteName?.trim()) throw new Error('請指定主辦方補位選手。');
    players.push(organizer(substituteName.trim(), createId()));
  }
  const matches = pairSwissRound({ players, rounds: event.rounds, roundNum, assignSides: true });
  const active = players.filter((player) => !player.isWithdrawn && !player.isEliminated);
  if (!matches.length || matches.length * 2 !== active.length || matches.some((match) => match.isMCMatch))
    throw new Error('無法為所有在賽選手建立對戰。');
  return { ...event, players, phase: 'playing', rounds: [...event.rounds, matches], currentRoundNum: roundNum };
}

export function scoreSwiss(event, index, matchId, left) {
  if (!Number.isInteger(left) || left < 0 || left > event.judgeCount) throw new Error('票數超出範圍。');
  return refreshRecords({
    ...event,
    rounds: updateMatchScore(event.rounds, index, matchId, left, event.judgeCount - left)
  });
}

export function correctSwissScore(event, index, matchId, left) {
  // Once results or playoff seeds are published, Swiss opponents are historical facts.
  if (event.phase === 'finished' || event.playoffSeeds?.length || index === event.rounds.length - 1) {
    return scoreSwiss(event, index, matchId, left);
  }
  const rounds = event.rounds.slice(0, index + 1);
  const retained = new Set(rounds.flat().flatMap((match) => [match.p1.id, match.p2.id]));
  const players = event.players
    .filter((player) => !player.isOrganizer || retained.has(player.id))
    .map((player) => {
      if (!player.revivedRound || player.revivedRound <= rounds.length) return player;
      const { revivedRound, ...original } = player;
      return original;
    });
  return scoreSwiss({ ...event, rounds, players, currentRoundNum: rounds.length }, index, matchId, left);
}

export function withdrawPlayer(event, id) {
  const index = event.rounds.length - 1;
  const match = event.rounds[index]?.find((item) => !item.isDone && [item.p1.id, item.p2.id].includes(id));
  const next = match ? scoreSwiss(event, index, match.id, match.p1.id === id ? 0 : event.judgeCount) : event;
  return refreshRecords({
    ...next,
    players: next.players.map((player) => (player.id === id ? { ...player, isWithdrawn: true } : player))
  });
}
