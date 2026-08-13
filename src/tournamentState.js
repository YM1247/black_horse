import { applyDoubleElimination } from './tournament';

export const MAX_PLAYERS = 32;
export const SUPPORTED_JUDGE_COUNTS = Object.freeze([3, 5]);
export const DEFAULT_JUDGE_COUNT = 3;
export const DEFAULT_DOUBLE_ELIMINATION = true;

export const createId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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
  ...(player.isMC ? { isMC: true } : {})
});

const normalizeRounds = (rounds = []) => rounds.map(round => round.map(match => ({
  ...match,
  p1: normalizePlayer(match.p1),
  p2: normalizePlayer(match.p2)
})));

export const normalizeTournamentData = (data = {}) => {
  const rounds = normalizeRounds(Array.isArray(data.rounds) ? data.rounds : []);
  const doubleElimination = Boolean(data.doubleElimination);
  const normalizedPlayers = (Array.isArray(data.players) ? data.players : [])
    .map(normalizePlayer)
    .filter(player => player.name);
  return {
    phase: ['registration', 'playing', 'finished'].includes(data.phase) ? data.phase : 'registration',
    players: applyDoubleElimination(normalizedPlayers, rounds, doubleElimination),
    rounds,
    currentRoundNum: Math.max(1, Number(data.currentRoundNum) || 1),
    judgeCount: normalizeJudgeCount(data.judgeCount, inferJudgeCount(rounds)),
    doubleElimination,
    runId: String(data.runId || createId()),
    runNumber: Math.max(1, Number(data.runNumber) || 1),
    resultLocked: Boolean(data.resultLocked),
    currentVersion: Math.max(0, Number(data.currentVersion) || 0)
  };
};

export const createEmptyTournament = ({
  judgeCount = DEFAULT_JUDGE_COUNT,
  doubleElimination = DEFAULT_DOUBLE_ELIMINATION
} = {}) => normalizeTournamentData({
  phase: 'registration',
  players: [],
  rounds: [],
  currentRoundNum: 1,
  judgeCount,
  doubleElimination,
  runId: createId(),
  runNumber: 1,
  resultLocked: false,
  currentVersion: 0
});
