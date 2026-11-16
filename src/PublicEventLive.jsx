import React, { useEffect, useState } from 'react';
import { gamesFor } from './finalTournament';
import { AKASHIKI } from './tournamentState';
import { PublicPlayerSearch } from './PublicLayout';

const includesPlayer = (match, id) => [match?.p1?.id, match?.p2?.id].includes(id);
const hasScore = match => Number.isFinite(match?.p1Votes) && Number.isFinite(match?.p2Votes);

export function matchRecord(match, side, roundIndex = 0) {
  const player = match[side];
  const wins = match[`${side}WinsSnapshot`] ?? player?.wins ?? 0;
  return { wins, losses: Math.max(0, roundIndex - wins), votes: match[`${side}VotesSnapshot`] ?? player?.votes ?? 0 };
}

export function groupPublicMatches(matches, roundIndex, votesFirst = false) {
  const groups = new Map();
  for (const match of matches) {
    const a = matchRecord(match, 'p1', roundIndex);
    const b = matchRecord(match, 'p2', roundIndex);
    const records = votesFirst ? [a.votes, b.votes].sort((x,y)=>y-x).map(v=>`${v} 票`) : [a,b].sort((x,y)=>y.wins-x.wins).map(r=>`${r.wins}-${r.losses}`);
    const label = records[0] === records[1] ? `${records[0]} 組` : `跨組（${records.join('／')}）`;
    if (!groups.has(label)) groups.set(label, { label, score: votesFirst ? a.votes+b.votes : a.wins+b.wins, matches: [] });
    groups.get(label).matches.push(match);
  }
  return [...groups.values()].sort((a,b)=>b.score-a.score);
}

export function PublicMatch({ match, prominent = false, label, unit, showStatus = true, showRecord = false, roundIndex = 0 }) {
  const left = matchRecord(match, 'p1', roundIndex);
  const right = matchRecord(match, 'p2', roundIndex);
  const scored = hasScore(match);
  const completed = scored && match.isDone !== false;
  const status = completed ? '已完成' : scored ? '進行中' : '等待比分';
  return <article className={prominent ? 'public-personal-match' : 'public-match-row'} aria-label={label}>
    <div className={'public-match-player' + (completed && match.p1Votes > match.p2Votes ? ' is-winner' : '')}>
      <strong>{match.p1?.name || '等待選手'}</strong>{showRecord && <small className="public-match-record">{left.wins} 勝 {left.losses} 敗・{left.votes} 票</small>}{match.attackOrder && <small>先攻</small>}
    </div>
    <div className="public-match-score"><b>{scored ? `${match.p1Votes} : ${match.p2Votes}` : '— : —'}</b>
      {unit && <small>{unit}</small>}{prominent && <small>{status}</small>}
    </div>
    <div className={'public-match-player' + (completed && match.p2Votes > match.p1Votes ? ' is-winner' : '')}>
      <strong>{match.p2?.name || '等待選手'}</strong>{showRecord && <small className="public-match-record">{right.wins} 勝 {right.losses} 敗・{right.votes} 票</small>}{match.attackOrder && <small>後攻</small>}
    </div>
    {!prominent && showStatus && <small className="public-match-status">{status}</small>}
    {unit && match.games?.length > 0 && <p className="public-match-games">{match.games.map((game, i) => `第${i + 1}局 ${game.p1Votes ?? '—'} : ${game.p2Votes ?? '—'} 票`).join('　')}</p>}
  </article>;
}

export default function PublicEventLive({ tournament }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [roundChoice, setRoundChoice] = useState(null);
  useEffect(() => { setQuery(''); setSelectedId(''); setRoundChoice(null); }, [tournament.id]);
  const rounds = tournament.rounds || [];
  const index = Math.min(roundChoice ?? Math.max(0, rounds.length - 1), Math.max(0, rounds.length - 1));
  const matches = rounds[index] || [];
  const term = query.trim().toLocaleLowerCase();
  const players = (tournament.players || []).filter(player => !player.isMC);
  const suggestions = term && !selectedId ? players.filter(player => player.name.toLocaleLowerCase().includes(term)) : [];
  const selected = players.find(player => player.id === selectedId);
  const selectedMatch = selected && matches.find(match => includesPlayer(match, selectedId));
  const playoff = selected && roundChoice === null && [...gamesFor(tournament)].reverse().map(([key, label]) => ({ key, label, match: tournament.bracket?.[key] })).find(({ match }) => match && includesPlayer(match, selectedId));
  const personal = playoff || (selectedMatch ? { match: selectedMatch, label: `第 ${index + 1} 輪` } : null);
  const visibleMatches = term && !selectedId ? matches.filter(match => [match.p1?.name, match.p2?.name].some(name => name?.toLocaleLowerCase().includes(term))) : matches;

  if (!rounds.length && !tournament.playoffSeeds?.length) return <section id="current-round" className="public-live" aria-label="當輪賽況"><p className="public-empty">賽程尚未公布，開賽後會即時更新。</p></section>;

  return <section className="public-live" id="current-round" aria-label="當輪賽況">
    {players.length > 0 && <PublicPlayerSearch value={query} onChange={value => { setQuery(value); setSelectedId(''); }}>
      {term && !selectedId && <div className="public-search-results" role="region" aria-label="選手搜尋結果">
        <p role="status">{suggestions.length ? `找到 ${suggestions.length} 位選手，選擇後查看對戰` : '找不到這位選手，請確認打師名。'}</p>
        <ul>{suggestions.map(player => <li key={player.id}><button type="button" onClick={() => { setSelectedId(player.id); setQuery(player.name); }}>{player.name}</button></li>)}</ul>
      </div>}
    </PublicPlayerSearch>}
    {(rounds.length > 1 || tournament.playoffSeeds?.length > 0) && <nav aria-label="單場賽況導覽" className="public-round-tabs">
      {rounds.map((_, i) => <a key={i} href="#current-round" aria-current={index === i ? 'true' : undefined} onClick={() => setRoundChoice(i)}>第 {i + 1} 輪</a>)}
      {tournament.playoffSeeds?.length > 0 && <a href="#playoff">{tournament.rulesVersion === AKASHIKI ? '十六強' : '八強'}</a>}
    </nav>}
    {selected ? <section className="public-personal" aria-label="你的對戰">
      <div className="public-section-heading"><h2>你的對戰{personal && <small>{personal.label}</small>}</h2><button type="button" className="public-text-action" onClick={() => { setSelectedId(''); setQuery(''); }} aria-label="清除選手選擇">清除</button></div>
      {personal ? <PublicMatch match={personal.match} prominent label={`${selected.name}的對戰`} unit={playoff?.key === 'gold' && tournament.rulesVersion === AKASHIKI ? '局（BO3）' : undefined} />
        : <p className="public-empty">{selected.name}在第 {index + 1} 輪尚無對戰。{selected.isWithdrawn ? '此選手已棄賽。' : selected.seedCredit && index === 0 ? '首輪種子記一勝五票。' : '請查看其他輪次或排名。'}</p>}
    </section> : null}
    {rounds.length > 0 && <section className="public-current-matches public-balanced-matches" aria-label="本輪對戰"><h2>第 {index + 1} 輪對戰</h2>
      {groupPublicMatches(visibleMatches, index, tournament.rulesVersion === AKASHIKI).map(group => <section className="public-match-group" key={group.label} aria-label={group.label}>
        <h3>{group.label}</h3>
        {group.matches.map(match => <PublicMatch key={match.id} match={match} roundIndex={index} showStatus={false} showRecord label={`第 ${index + 1} 輪對戰 ${matches.indexOf(match) + 1}`} />)}
      </section>)}
      {!visibleMatches.length && <p className="public-empty">本輪沒有符合搜尋的對戰。</p>}
    </section>}
  </section>;
}
