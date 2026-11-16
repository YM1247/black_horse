import React, { useEffect, useState, useRef } from 'react';
import { gamesFor } from './finalTournament';
import { AKASHIKI } from './tournamentState';
import PlayoffBracket from './PlayoffBracket';
import { PublicPlayerSearch } from './PublicLayout';

const matchesQuery = (match, query) => Boolean(query) && [match?.p1?.name, match?.p2?.name].some(name => name?.toLocaleLowerCase().includes(query));
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

export function PublicMatch({ match, prominent = false, label, unit, showStatus = true, showRecord = false, roundIndex = 0, highlighted = false }) {
  const left = matchRecord(match, 'p1', roundIndex);
  const right = matchRecord(match, 'p2', roundIndex);
  const scored = hasScore(match);
  const completed = scored && match.isDone !== false;
  const status = completed ? '已完成' : scored ? '進行中' : '等待比分';
  return <article className={(prominent ? 'public-personal-match' : 'public-match-row') + (highlighted ? ' is-search-match' : '')} aria-label={label} tabIndex={highlighted ? -1 : undefined}>
    <div className={'public-match-player' + (completed && match.p1Votes > match.p2Votes ? ' is-winner' : completed && match.p1Votes < match.p2Votes ? ' is-loser' : '')}>
      <strong>{match.p1?.name || '等待選手'}</strong>{showRecord && <small className="public-match-record">{left.wins} 勝 {left.losses} 敗・{left.votes} 票</small>}{match.attackOrder && <small>先攻</small>}
    </div>
    <div className="public-match-score"><b>{scored ? `${match.p1Votes} : ${match.p2Votes}` : '— : —'}</b>
      {unit && <small>{unit}</small>}{prominent && <small>{status}</small>}
    </div>
    <div className={'public-match-player' + (completed && match.p2Votes > match.p1Votes ? ' is-winner' : completed && match.p2Votes < match.p1Votes ? ' is-loser' : '')}>
      <strong>{match.p2?.name || '等待選手'}</strong>{showRecord && <small className="public-match-record">{right.wins} 勝 {right.losses} 敗・{right.votes} 票</small>}{match.attackOrder && <small>後攻</small>}
    </div>
    {!prominent && showStatus && <small className="public-match-status">{status}</small>}
    {unit && match.games?.length > 0 && <p className="public-match-games">{match.games.map((game, i) => `第${i + 1}局 ${game.p1Votes ?? '—'} : ${game.p2Votes ?? '—'} 票`).join('　')}</p>}
  </article>;
}

export default function PublicEventLive({ tournament }) {
  const [query, setQuery] = useState('');
  const schedule = useRef(null);
  const [roundChoice, setRoundChoice] = useState(null);
  useEffect(() => { setQuery(''); setRoundChoice(null); }, [tournament.id]);
  const rounds = tournament.rounds || [];
  const index = Math.min(roundChoice ?? Math.max(0, rounds.length - 1), Math.max(0, rounds.length - 1));
  const matches = rounds[index] || [];
  const term = query.trim().toLocaleLowerCase();
  const players = (tournament.players || []).filter(player => !player.isMC);
  const matchingCount = matches.filter(match => matchesQuery(match, term)).length + gamesFor(tournament).filter(([key]) => tournament.bracket?.[key]?.p1 && tournament.bracket?.[key]?.p2 && matchesQuery(tournament.bracket[key], term)).length;
  const jumpToMatch = event => {
    event.preventDefault();
    if (!term) return;
    const target = schedule.current?.querySelector('.is-search-match');
    if (target) {
      target.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    }
  };

  if (!rounds.length && !tournament.playoffSeeds?.length) return <section id="current-round" className="public-live" aria-label="當輪賽況"><p className="public-empty">賽程尚未公布，開賽後會即時更新。</p></section>;

  return <section ref={schedule} className="public-live" id="current-round" aria-label="當輪賽況">
    {players.length > 0 && <PublicPlayerSearch value={query} onChange={setQuery} onSubmit={jumpToMatch}>
      {term && matchingCount === 0 && <p className="public-search-feedback" role="status">目前沒有符合的對戰，可切換其他輪次或確認打師名。</p>}
    </PublicPlayerSearch>}
    {tournament.playoffSeeds?.length > 0 && <PlayoffBracket event={tournament} highlightQuery={term} publicView />}
    {tournament.playoffSeeds?.length > 0 && rounds.length > 0 && <h2 className="public-swiss-heading">瑞士輪</h2>}
    {(rounds.length > 1 || tournament.playoffSeeds?.length > 0) && <nav aria-label="單場賽況導覽" className="public-round-tabs">
      {rounds.map((_, i) => <a key={i} href="#swiss-round-matches" aria-current={index === i ? 'true' : undefined} onClick={() => setRoundChoice(i)}>第 {i + 1} 輪</a>)}
    </nav>}
    {rounds.length > 0 && <section id="swiss-round-matches" className="public-current-matches public-balanced-matches" aria-label="本輪對戰">
      {groupPublicMatches(matches, index, tournament.rulesVersion === AKASHIKI).map(group => <section className="public-match-group" key={group.label} aria-label={group.label}>
        <h3>{group.label}</h3>
        {group.matches.map(match => <PublicMatch key={match.id} match={match} highlighted={matchesQuery(match, term)} roundIndex={index} showStatus={false} showRecord label={`第 ${index + 1} 輪對戰 ${matches.indexOf(match) + 1}`} />)}
      </section>)}
      {!matches.length && <p className="public-empty">本輪沒有符合搜尋的對戰。</p>}
    </section>}
  </section>;
}
