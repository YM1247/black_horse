import { eventRanking, FINAL, QUALIFIER } from './seasonTournament';
import { rankPlayers } from './tournament';

export const SIMULATION_SERIES = Object.freeze({
  id: 'simulation-series',
  name: '模擬賽',
  description: '各場獨立報名的系列積分賽',
  publicCode: 'SIM2026',
  isPublic: true,
  revision: 0,
  events: Object.freeze([
    Object.freeze({ id: 'aug-19', name: '8/19', eventCode: 'MOCK819', judgeCount: 3, doubleElimination: true }),
    Object.freeze({ id: 'aug-21', name: '8/21', eventCode: 'MOCK821', judgeCount: 3, doubleElimination: true }),
    Object.freeze({ id: 'aug-26', name: '8/26', eventCode: 'MOCK826', judgeCount: 3, doubleElimination: true })
  ])
});

export const BLACK_HORSE = {
  id: 'black-horse-26-27', name: '黑馬記念26-27', publicCode: 'BH2627', isPublic: true, revision: 0,
  description: '四場積分賽取最佳三站，前二十一名取得最終戰資格',
  events: [...['一', '二', '三', '四'].map((number, i) => ({
    id: 'station-' + (i + 1), name: '積分賽第' + number + '場', eventCode: 'BH2627S' + (i + 1),
    rulesVersion: QUALIFIER, judgeCount: 3, doubleElimination: true
  })), { id: 'final', name: '最終戰', eventCode: 'BH2627F', rulesVersion: FINAL, judgeCount: 5, doubleElimination: false }]
};
export const SERIES = Object.freeze([SIMULATION_SERIES, BLACK_HORSE]);

const normalizePlayerName = (name) => String(name || '').trim();

export const normalizeSeriesDefinition = (data, fallback) => {
  if (!data) return { ...fallback, events: fallback.events.map(event => ({ ...event })) };
  const events = Array.isArray(data.events) ? data.events : [];
  return {
    id: data.id || fallback.id,
    name: String(data.name || fallback.name).trim(),
    description: String(data.description || fallback.description).trim(),
    publicCode: String(data.publicCode || fallback.publicCode || '').trim().toUpperCase(),
    isPublic: data.isPublic !== false,
    revision: Number(data.revision) || 0,
    events: events
      .map(event => {
        const eventCode = String(event?.eventCode || '').trim().toUpperCase();
        if (!eventCode || !String(event?.name || '').trim()) return null;
        return {
          ...(event.rulesVersion ? { rulesVersion: event.rulesVersion } : {}),
          id: String(event.id || `event-${eventCode.toLowerCase()}`),
          name: String(event.name).trim(),
          eventCode,
          judgeCount: [3, 5].includes(Number(event.judgeCount)) ? Number(event.judgeCount) : 3,
          doubleElimination: event.doubleElimination !== false
        };
      })
      .filter(Boolean)
  };
};

export const buildSeriesStandings = (series, tournaments = []) => {
  if (!series?.events?.length) return [];
  if (series.publicCode === BLACK_HORSE.publicCode || series.events.some(event => event.rulesVersion === QUALIFIER)) return seasonStandings(series, tournaments);
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


function seasonStandings(series, tournaments) {
  const players = new Map();
  const events = series.events.filter(event => event.rulesVersion === QUALIFIER);
  for (const event of events) {
    const tournament = tournaments.find(t => (t.id || t.eventCode) === event.eventCode);
    if (!tournament) continue;
    for (const player of eventRanking(tournament).filter(p => !p.isOrganizer)) {
      const row = players.get(player.id) || { id: player.id, name: player.name, eventPoints: {}, participatedEvents: 0 };
      row.name = player.name;
      row.participatedEvents++;
      if (tournament.phase === 'finished') row.eventPoints[event.eventCode] = player.rankingPoints;
      players.set(player.id, row);
    }
  }
  const rows = [...players.values()];
  for (const row of rows) {
    row.countedEvents = Object.keys(row.eventPoints).sort((a,b) => row.eventPoints[b] - row.eventPoints[a]).slice(0,3);
    row.totalPoints = row.countedEvents.reduce((sum, code) => sum + row.eventPoints[code], 0);
  }
  rows.sort((a,b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name,'zh-TW'));
  rows.forEach((row,i) => { row.displayRank = i && rows[i-1].totalPoints === row.totalPoints ? rows[i-1].displayRank : i+1; });
  return rows;
}
