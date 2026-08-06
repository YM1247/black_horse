export const MC_ID = 'MC';

const createId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const shuffle = (items, random) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const isCompleted = (match) => Number.isFinite(match?.p1Votes) && Number.isFinite(match?.p2Votes);

export const buildOpponentHistory = (rounds = []) => {
  const opponents = new Map();
  const addOpponent = (playerId, opponentId) => {
    if (!opponents.has(playerId)) opponents.set(playerId, new Set());
    opponents.get(playerId).add(opponentId);
  };

  rounds.flat().forEach(match => {
    if (!match?.p1?.id || !match?.p2?.id) return;
    addOpponent(match.p1.id, match.p2.id);
    addOpponent(match.p2.id, match.p1.id);
  });
  return opponents;
};

const createMatch = (p1, p2, extra = {}) => ({
  id: createId(),
  p1,
  p2,
  p1Votes: null,
  p2Votes: null,
  isDone: false,
  isMCMatch: p2.id === MC_ID || p1.id === MC_ID,
  p1WinsSnapshot: p1.wins || 0,
  p1VotesSnapshot: p1.votes || 0,
  p2WinsSnapshot: p2.wins || 0,
  p2VotesSnapshot: p2.votes || 0,
  ...extra
});

const pairEvenGroup = (players, opponentHistory) => {
  if (players.length === 0) return [];

  let visited = 0;
  let best = null;
  const search = (remaining, matches, repeats) => {
    visited += 1;
    if (visited > 5000 || (best && repeats >= best.repeats)) return;
    if (remaining.length === 0) {
      best = { matches, repeats };
      return;
    }

    const [p1, ...candidates] = remaining;
    const orderedCandidates = candidates
      .map((player, index) => ({
        player,
        index,
        repeated: opponentHistory.get(p1.id)?.has(player.id) ? 1 : 0,
        voteDifference: Math.abs((p1.votes || 0) - (player.votes || 0))
      }))
      .sort((a, b) => a.repeated - b.repeated || a.voteDifference - b.voteDifference);

    for (const candidate of orderedCandidates) {
      const next = candidates.filter((_, index) => index !== candidate.index);
      search(next, [...matches, createMatch(p1, candidate.player)], repeats + candidate.repeated);
      if (best?.repeats === 0) return;
    }
  };

  search(players, [], 0);
  return best?.matches || [];
};

const chooseMcPlayer = (pool, roundNum, opponentHistory, random) => {
  const withoutPreviousMc = pool.filter(player => !opponentHistory.get(player.id)?.has(MC_ID));
  const candidates = withoutPreviousMc.length > 0 ? withoutPreviousMc : pool;
  if (roundNum === 1) return candidates[Math.floor(random() * candidates.length)];

  return [...candidates].sort((a, b) =>
    (b.wins || 0) - (a.wins || 0) || (b.votes || 0) - (a.votes || 0)
  )[0];
};

export const pairSwissRound = ({ players, rounds = [], roundNum, random = Math.random }) => {
  const opponentHistory = buildOpponentHistory(rounds);
  const pool = players.filter(player => !player.isWithdrawn && !player.isMC).map(player => ({ ...player }));
  const matches = [];
  let mcMatch = null;

  if (pool.length % 2 !== 0) {
    const chosenPlayer = chooseMcPlayer(pool, roundNum, opponentHistory, random);
    pool.splice(pool.findIndex(player => player.id === chosenPlayer.id), 1);
    const mc = { id: MC_ID, name: 'MC', wins: 0, votes: 0, isMC: true, isWithdrawn: false };
    mcMatch = createMatch(chosenPlayer, mc, { isMCMatch: true });
  }

  if (roundNum === 1) {
    const shuffled = shuffle(pool, random);
    while (shuffled.length >= 2) matches.push(createMatch(shuffled.pop(), shuffled.pop()));
  } else {
    const groups = new Map();
    pool.forEach(player => {
      const wins = player.wins || 0;
      groups.set(wins, [...(groups.get(wins) || []), player]);
    });

    const scores = [...groups.keys()].sort((a, b) => b - a);
    let floater = null;
    scores.forEach((score, index) => {
      let group = [...(groups.get(score) || [])];
      if (floater) group.unshift(floater);
      floater = null;

      if (group.length % 2 !== 0 && index < scores.length - 1) {
        const lowestVotes = Math.min(...group.map(player => player.votes || 0));
        const floatCandidates = group.filter(player => (player.votes || 0) === lowestVotes);
        floater = floatCandidates[Math.floor(random() * floatCandidates.length)];
        group = group.filter(player => player.id !== floater.id);
      }

      matches.push(...pairEvenGroup(group, opponentHistory));
    });
  }

  if (mcMatch) matches.push(mcMatch);
  return matches;
};

export const updateMatchScore = (rounds, roundIndex, matchId, p1Votes, p2Votes) =>
  rounds.map((round, index) => index !== roundIndex ? round : round.map(match =>
    match.id === matchId ? { ...match, p1Votes, p2Votes, isDone: true } : match
  ));

export const recalculatePlayerRecords = (players, rounds) => {
  const recalculated = players.map(player => ({ ...player, wins: 0, votes: 0 }));
  const byId = new Map(recalculated.map(player => [player.id, player]));

  rounds.flat().forEach(match => {
    if (!isCompleted(match)) return;
    const p1 = byId.get(match.p1.id);
    const p2 = byId.get(match.p2.id);
    if (p1 && !p1.isMC) {
      p1.votes += match.p1Votes;
      if (match.p1Votes > match.p2Votes) p1.wins += 1;
    }
    if (p2 && !p2.isMC) {
      p2.votes += match.p2Votes;
      if (match.p2Votes > match.p1Votes) p2.wins += 1;
    }
  });

  return recalculated;
};

const nearlyEqual = (left, right) => Math.abs(left - right) < 1e-9;

export const rankPlayers = (players, rounds) => {
  const activePlayers = players.filter(player => !player.isWithdrawn && !player.isMC).map(player => ({ ...player }));
  const allPlayers = players.filter(player => !player.isMC);
  const byId = new Map(allPlayers.map(player => [player.id, player]));
  const opponents = new Map(allPlayers.map(player => [player.id, []]));
  const completedMatches = new Map(allPlayers.map(player => [player.id, 0]));

  rounds.flat().forEach(match => {
    if (!isCompleted(match)) return;
    if (match.p1.id !== MC_ID) completedMatches.set(match.p1.id, (completedMatches.get(match.p1.id) || 0) + 1);
    if (match.p2.id !== MC_ID) completedMatches.set(match.p2.id, (completedMatches.get(match.p2.id) || 0) + 1);
    if (match.p1.id !== MC_ID && match.p2.id !== MC_ID) {
      opponents.get(match.p1.id)?.push(match.p2.id);
      opponents.get(match.p2.id)?.push(match.p1.id);
    }
  });

  const matchWinRate = (playerId) => {
    const matches = completedMatches.get(playerId) || 0;
    return matches > 0 ? (byId.get(playerId)?.wins || 0) / matches : 0;
  };
  const opponentWinRate = (playerId) => {
    const ids = opponents.get(playerId) || [];
    return ids.length > 0 ? ids.reduce((total, id) => total + matchWinRate(id), 0) / ids.length : 0;
  };
  const opponentsOpponentWinRate = (playerId) => {
    const ids = opponents.get(playerId) || [];
    return ids.length > 0 ? ids.reduce((total, id) => total + opponentWinRate(id), 0) / ids.length : 0;
  };

  activePlayers.forEach(player => {
    player.opponentWinRate = opponentWinRate(player.id);
    player.opponentsOpponentWinRate = opponentsOpponentWinRate(player.id);
  });
  activePlayers.sort((a, b) =>
    b.wins - a.wins ||
    b.votes - a.votes ||
    b.opponentWinRate - a.opponentWinRate ||
    b.opponentsOpponentWinRate - a.opponentsOpponentWinRate
  );

  activePlayers.forEach((player, index) => {
    const previous = activePlayers[index - 1];
    const tiedWithPrevious = previous &&
      player.wins === previous.wins &&
      player.votes === previous.votes &&
      nearlyEqual(player.opponentWinRate, previous.opponentWinRate) &&
      nearlyEqual(player.opponentsOpponentWinRate, previous.opponentsOpponentWinRate);
    player.displayRank = tiedWithPrevious ? previous.displayRank : index + 1;
  });

  activePlayers.forEach(player => {
    player.needsTiebreaker = activePlayers.some(other =>
      other.id !== player.id && other.displayRank === player.displayRank
    );
  });

  const withdrawn = players
    .filter(player => player.isWithdrawn && !player.isMC)
    .map(player => ({ ...player, displayRank: '棄賽', needsTiebreaker: false, opponentWinRate: 0, opponentsOpponentWinRate: 0 }));
  return [...activePlayers, ...withdrawn];
};

