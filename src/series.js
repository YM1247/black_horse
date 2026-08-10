import { rankPlayers } from './tournament';

export const SIMULATION_SERIES = Object.freeze({
  id: 'simulation-series',
  name: '模擬賽',
  description: '三場獨立報名的系列積分賽',
  events: Object.freeze([
    Object.freeze({ id: 'aug-19', name: '8/19', eventCode: 'MOCK819', judgeCount: 3, doubleElimination: true }),
    Object.freeze({ id: 'aug-21', name: '8/21', eventCode: 'MOCK821', judgeCount: 3, doubleElimination: true }),
    Object.freeze({ id: 'aug-26', name: '8/26', eventCode: 'MOCK826', judgeCount: 3, doubleElimination: true })
  ])
});

export const SERIES = Object.freeze([SIMULATION_SERIES]);

const normalizePlayerName = (name) => String(name || '').trim();

export const buildSeriesStandings = (series, tournaments = []) => {
  if (!series?.events?.length) return [];
  const tournamentsByCode = new Map(tournaments.map(tournament => [tournament.id || tournament.eventCode, tournament]));
  const blankEventPoints = () => Object.fromEntries(series.events.map(event => [event.eventCode, 0]));
  const standingsByName = new Map();

  const ensurePlayer = (name) => {
    const normalizedName = normalizePlayerName(name);
    if (!normalizedName) return null;
    if (!standingsByName.has(normalizedName)) {
      standingsByName.set(normalizedName, {
        name: normalizedName,
        eventPoints: blankEventPoints(),
        participatedEvents: 0,
        totalPoints: 0
      });
    }
    return standingsByName.get(normalizedName);
  };

  series.events.forEach(event => {
    const tournament = tournamentsByCode.get(event.eventCode);
    if (!tournament) return;
    const eventPlayerNames = new Set();
    (Array.isArray(tournament.players) ? tournament.players : []).forEach(player => {
      if (player.isMC) return;
      const standing = ensurePlayer(player.name);
      if (standing) eventPlayerNames.add(standing.name);
    });
    eventPlayerNames.forEach(name => { standingsByName.get(name).participatedEvents += 1; });

    if (tournament.phase !== 'finished') return;
    rankPlayers(tournament.players || [], tournament.rounds || []).forEach(player => {
      const standing = ensurePlayer(player.name);
      if (!standing) return;
      standing.eventPoints[event.eventCode] = player.rankingPoints || 0;
      standing.totalPoints += player.rankingPoints || 0;
    });
  });

  const standings = Array.from(standingsByName.values()).sort((first, second) =>
    second.totalPoints - first.totalPoints || first.name.localeCompare(second.name, 'zh-TW')
  );
  standings.forEach((standing, index) => {
    const previous = standings[index - 1];
    standing.displayRank = previous && previous.totalPoints === standing.totalPoints
      ? previous.displayRank
      : index + 1;
  });
  return standings;
};
