import { applyDoubleElimination, recalculatePlayerRecords, updateMatchScore } from './tournament';

export const canReplayCloudOperation = (operation = {}) => [
  'SCORE_UPDATED',
  'HISTORICAL_SCORE_UPDATED',
  'PLAYER_ADDED',
  'PLAYER_REMOVED',
  'PLAYER_RENAMED',
  'JUDGE_COUNT_CHANGED',
  'DOUBLE_ELIMINATION_CHANGED'
].includes(operation.action);

export const replayCloudOperations = (baseState, operations) => operations.reduce((state, operation) => {
  const details = operation.details || {};
  switch (operation.action) {
    case 'SCORE_UPDATED':
    case 'HISTORICAL_SCORE_UPDATED': {
      const roundIndex = Number(details.round) - 1;
      const exists = state.rounds[roundIndex]?.some(match => match.id === details.matchId);
      if (!exists) return state;
      const rounds = updateMatchScore(state.rounds, roundIndex, details.matchId, details.after.p1Votes, details.after.p2Votes);
      return {
        ...state,
        rounds,
        players: applyDoubleElimination(recalculatePlayerRecords(state.players, rounds), rounds, state.doubleElimination)
      };
    }
    case 'PLAYER_ADDED':
      return details.player && !state.players.some(player => player.id === details.player.id || player.name === details.player.name)
        ? { ...state, players: [...state.players, details.player] }
        : state;
    case 'PLAYER_REMOVED':
      return { ...state, players: state.players.filter(player => player.id !== details.playerId) };
    case 'PLAYER_RENAMED':
      return {
        ...state,
        players: state.players.map(player => player.id === details.playerId ? { ...player, name: details.after } : player),
        rounds: state.rounds.map(round => round.map(match => ({
          ...match,
          p1: match.p1.id === details.playerId ? { ...match.p1, name: details.after } : match.p1,
          p2: match.p2.id === details.playerId ? { ...match.p2, name: details.after } : match.p2
        })))
      };
    case 'JUDGE_COUNT_CHANGED':
      return state.phase === 'registration' ? { ...state, judgeCount: details.after } : state;
    case 'DOUBLE_ELIMINATION_CHANGED':
      return state.phase === 'registration'
        ? { ...state, doubleElimination: details.after, players: applyDoubleElimination(state.players, state.rounds, details.after) }
        : state;
    default:
      return state;
  }
}, baseState);
