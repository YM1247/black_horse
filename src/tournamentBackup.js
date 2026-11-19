import { normalizeTournamentData } from './tournamentState';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const player = value => record(value) && Boolean(value.id) && typeof value.name === 'string';
const match = value => record(value) && Boolean(value.id) && player(value.p1) && player(value.p2);

export async function createTournamentBackup(event) {
  // Older events can omit fields introduced later. Keep original match and player data.
  const defaults = normalizeTournamentData(event);
  const state = Object.fromEntries(Object.keys(defaults).map(key => [key, event[key] ?? defaults[key]]));
  const backup = {
    format: 'swiss-tournament/v1', eventCode: event.id, name: event.name || event.id,
    rulesVersion: event.rulesVersion || 'legacy-v1', revision: event.revision || 0,
    exportedAt: new Date().toISOString(), state
  };
  return { ...backup, checksum: await digest(backup) };
}

async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function readTournamentBackup(text, event) {
  let backup;
  try { backup = JSON.parse(text); } catch { throw new Error('無法讀取 JSON，請選擇從後台下載的備份。'); }
  if (backup?.format !== 'swiss-tournament/v1') throw new Error('備份格式不支援。');
  if (backup.eventCode !== event.id || backup.rulesVersion !== (event.rulesVersion || 'legacy-v1')) {
    throw new Error('備份的賽事代碼或賽制與目前賽事不同。');
  }
  const { checksum, ...payload } = backup;
  if (await digest(payload) !== checksum) throw new Error('備份內容已變更或檔案不完整。');
  const s = backup.state;
  if (!record(s) || !['registration', 'playing', 'finished'].includes(s.phase) ||
      !Array.isArray(s.players) || !s.players.every(player) || !Array.isArray(s.rounds) ||
      !s.rounds.every(round => Array.isArray(round) && round.every(match)) ||
      ![3, 5].includes(s.judgeCount) || !Number.isInteger(s.currentRoundNum) || s.currentRoundNum < 1 ||
      (s.rulesVersion || 'legacy-v1') !== backup.rulesVersion ||
      (s.bracket && (!record(s.bracket) || !Object.values(s.bracket).every(match)))) {
    throw new Error('備份的賽程或選手資料不完整。');
  }
  // Import only the competition fields, never document metadata or visibility settings.
  const required = Object.keys(normalizeTournamentData(s));
  if (!required.every(key => Object.hasOwn(s, key))) throw new Error('備份缺少賽事欄位。');
  return { ...backup, state: Object.fromEntries(required.map(key => [key, s[key]])) };
}
