import { applyDoubleElimination, createId } from './tournament';

export const QUALIFIER = 'qualifier-26-27';
export const FINAL = 'final-26-27';
export const MAX_PLAYERS = 32;
export const SUPPORTED_JUDGE_COUNTS = Object.freeze([3, 5]);
export const DEFAULT_JUDGE_COUNT = 3;
export const DEFAULT_DOUBLE_ELIMINATION = true;

export { createId };

const normalizeJudgeCount = (value, fallback = DEFAULT_JUDGE_COUNT) =>
  SUPPORTED_JUDGE_COUNTS.includes(Number(value)) ? Number(value) : fallback;

const inferJudgeCount = (rounds, fallback = DEFAULT_JUDGE_COUNT) => {
  const completedMatch = rounds
    ?.flat()
    .find(match => Number.isFinite(match?.p1Votes) && Number.isFinite(match?.p2Votes));
  const scoreTotal = completedMatch ? completedMatch.p1Votes + completedMatch.p2Votes : fallback;
  return normalizeJudgeCount(scoreTotal, fallback);
};

export const normalizePlayer = (player = {}) => ({
  id: player.id || createId(),
  name: String(player.name || '').trim(),
  wins: Number(player.wins) || 0,
  votes: Number(player.votes) || 0,
  losses: Number(player.losses) || 0,
  isWithdrawn: Boolean(player.isWithdrawn),
  isEliminated: Boolean(player.isEliminated),
  ...(player.isMC ? { isMC: true } : {}),
  ...(player.isOrganizer ? { isOrganizer: true } : {}),
  ...(player.revivedRound ? { revivedRound: player.revivedRound } : {}),
  ...(player.seedCredit ? { seedCredit: true } : {}),
  ...(player.source ? { source: player.source } : {})
});

const normalizeRounds = (rounds = []) => rounds.map(round => round.map(match => ({
  ...match,
  p1: normalizePlayer(match.p1),
  p2: normalizePlayer(match.p2)
})));

export const normalizeTournamentData = (data = {}) => {
  const rounds = normalizeRounds(Array.isArray(data.rounds) ? data.rounds : []);
  const qualifier = data.rulesVersion === QUALIFIER;
  const final = data.rulesVersion === FINAL;
  const doubleElimination = qualifier || (!final && Boolean(data.doubleElimination));
  const normalizedPlayers = (Array.isArray(data.players) ? data.players : [])
    .map(normalizePlayer)
    .filter(player => player.name);
  return {
    phase: ['registration', 'playing', 'finished'].includes(data.phase) ? data.phase : 'registration',
    players: applyDoubleElimination(normalizedPlayers, rounds, doubleElimination).map(player =>
      player.revivedRound === rounds.length ? { ...player, isEliminated:false } : player),
    rounds,
    currentRoundNum: Math.max(1, Number(data.currentRoundNum) || 1),
    judgeCount: qualifier ? 3 : final ? 5 : normalizeJudgeCount(data.judgeCount, inferJudgeCount(rounds)),
    doubleElimination,
    runId: String(data.runId || createId()),
    runNumber: Math.max(1, Number(data.runNumber) || 1),
    resultLocked: Boolean(data.resultLocked),
    currentVersion: Math.max(0, Number(data.currentVersion) || 0),
    ...(qualifier || final ? {
      rulesVersion: data.rulesVersion,
      qualificationConfig: data.qualificationConfig || {},
      qualificationSources: data.qualificationSources || {},
      qualifiedIds: data.qualifiedIds || [],
      playoffSeeds: data.playoffSeeds || [],
      playoffDecisions: data.playoffDecisions || {},
      bracket: data.bracket || {}
    } : {})
  };
};

export const createEmptyTournament = ({
  rulesVersion,
  judgeCount = DEFAULT_JUDGE_COUNT,
  doubleElimination = DEFAULT_DOUBLE_ELIMINATION
} = {}) => normalizeTournamentData({
  rulesVersion,
  judgeCount,
  doubleElimination,
  runId: createId()
});
