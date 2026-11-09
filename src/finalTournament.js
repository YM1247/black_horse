import { assignAttackOrder, createMatch } from './tournament';
import { eventRanking, publicPlayer, refreshRecords } from './seasonTournament';

// Each tied group that affects the draw needs an explicit permutation.
// Groups entirely below the cutoff or entirely within the six seeded places do not.
export function resolveOrder(rows, limit, decisions = {}, unorderedSeeds = 0) {
  const ordered = [], ties = [];
  for (let i = 0; i < rows.length && i < limit;) {
    let end = i + 1;
    while (end < rows.length && rows[end].displayRank === rows[i].displayRank) end++;
    const group = rows.slice(i,end);
    if (group.length > 1 && end > unorderedSeeds) {
      const key = group.map(p => p.id).sort().join('|');
      const ids = decisions[key] || [];
      if (ids.length !== group.length || new Set(ids).size !== group.length || ids.some(id=>!group.some(p=>p.id===id))) ties.push({key,group});
      else group.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
    }
    ordered.push(...group);
    i = end;
  }
  return { players: ordered.slice(0,limit), ties };
}

export function qualification(standings, profiles, config = {}) {
  const { online = [], local = '', decisions = {} } = config;
  const ids = [...online.filter(Boolean), local].filter(Boolean);
  const error = text => ({ error:text, players:[], ties:[] });
  if (ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id=>!profiles.some(p=>p.id===id))) return error('請選擇三位不同的保送與海選選手。');
  const byId = new Map(profiles.map(p=>[p.id,p]));
  const selected = resolveOrder(standings.filter(p=>!online.includes(p.id)),21,decisions,6);
  if (selected.players.length < 21) return error('積分榜人數不足 21 位。');
  if (selected.ties.length) return { ...selected, error:'請完成影響入圍或配對的同分裁定。' };
  if (selected.players.some(p=>p.id===local)) return error('現場海選與積分入圍重複，請選擇另一位。');
  const list = [...online.map(id=>({...publicPlayer(byId.get(id)),source:'線上保送',seedCredit:true})),
    ...selected.players.map((p,i)=>({...publicPlayer(p),source:'積分',seedCredit:i<6})),
    {...publicPlayer(byId.get(local)),source:'現場海選',seedCredit:false}];
  return { players:list, ties:[], error:'' };
}

export function startFinal(event, preview) {
  if (preview.error || preview.players.length !== 24 || new Set(preview.players.map(p=>p.id)).size !== 24) throw new Error(preview.error || '資格名單未完成。');
  const pool = preview.players.filter(p=>!p.seedCredit);
  if (pool.length !== 16) throw new Error('應有八位種子。');
  const matches = pool.slice(0,8).map((p,i)=>assignAttackOrder(createMatch(p,pool[15-i])));
  return refreshRecords({...event, phase:'playing', currentRoundNum:1, players:preview.players, rounds:[matches],
    qualifiedIds:preview.players.map(p=>p.id)});
}

export const playoffGames = [
  ['q1','八強 1','1','8'],['q2','八強 2','4','5'],['q3','八強 3','2','7'],['q4','八強 4','3','6'],
  ['s1','四強 1','q1','q2'],['s2','四強 2','q3','q4'],
  ['bronze','季軍戰','s1','s2'],['gold','冠軍戰','s1','s2']
];
export function resultPlayer(match, winner = true) {
  if (!match?.isDone) return null;
  return (match.p1Votes > match.p2Votes) === winner ? match.p1 : match.p2;
}

export function buildPlayoff(seeds, existing = {}) {
  const bracket = {};
  for (const [key,, first,second] of playoffGames) {
    const entrant = source => seeds[Number(source)-1] || resultPlayer(bracket[source], key !== 'bronze');
    const a = entrant(first), b = entrant(second);
    if (!a || !b) continue;
    const previous = existing[key];
    bracket[key] = previous && [a,b].every(p=>[previous.p1.id,previous.p2.id].includes(p.id))
      ? previous : assignAttackOrder(createMatch(publicPlayer(a),publicPlayer(b)));
  }
  return bracket;
}

export function playoffSelection(event, decisions = event.playoffDecisions || {}) {
  return resolveOrder(eventRanking(event, true).filter(p=>!p.isWithdrawn),8,decisions);
}

export function seedPlayoff(event, decisions) {
  const selection = playoffSelection(event,decisions);
  if (selection.players.length !== 8 || selection.ties.length) throw new Error('請先確認八強種子順序。');
  const seeds = selection.players.map(publicPlayer);
  return {...event, playoffSeeds:seeds, playoffDecisions:decisions, bracket:buildPlayoff(seeds,event.bracket)};
}

export function scorePlayoff(event, key, left) {
  if (!event.bracket[key] || !Number.isInteger(left) || left < 0 || left > 5) throw new Error('無效的五票比分。');
  const updated = {...event.bracket,[key]:{...event.bracket[key],p1Votes:left,p2Votes:5-left,isDone:true}};
  return {...event,bracket:buildPlayoff(event.playoffSeeds,updated)};
}

export const displacedGames = (before, after) => playoffGames.filter(([key]) =>
  before.bracket?.[key] && before.bracket[key].id !== after.bracket?.[key]?.id).map(([,name])=>name);
