import React, { useEffect, useState } from 'react';
import { gamesFor } from './finalTournament';
import { AKASHIKI } from './tournamentState';
import { PublicPlayerSearch } from './PublicLayout';

const includesPlayer = (match, id) => [match?.p1?.id, match?.p2?.id].includes(id);
const hasScore = match => Number.isFinite(match?.p1Votes) && Number.isFinite(match?.p2Votes);

export function PublicMatch({ match, prominent = false, label, unit }) {
  const scored = hasScore(match);
  const completed = scored && match.isDone !== false;
  const status = completed ? '已完成' : scored ? '進行中' : '等待比分';
  return <article className={prominent ? 'public-personal-match' : 'public-match-row'} aria-label={label}>
    <div className={'public-match-player' + (completed && match.p1Votes > match.p2Votes ? ' is-winner' : '')}>
      <strong>{match.p1?.name || '等待選手'}</strong>{match.attackOrder && <small>先攻</small>}
    </div>
    <div className="public-match-score"><b>{scored ? `${match.p1Votes} : ${match.p2Votes}` : '— : —'}</b>
      {unit && <small>{unit}</small>}{prominent && <small>{status}</small>}
    </div>
    <div className={'public-match-player' + (completed && match.p2Votes > match.p1Votes ? ' is-winner' : '')}>
      <strong>{match.p2?.name || '等待選手'}</strong>{match.attackOrder && <small>後攻</small>}
    </div>
    {!prominent && <small className="public-match-status">{status}</small>}
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
    {rounds.length > 0 && <section className="public-current-matches" aria-label="本輪對戰"><h2>第 {index + 1} 輪對戰</h2>
      {visibleMatches.map((match, i) => <PublicMatch key={match.id} match={match} label={`第 ${index + 1} 輪對戰 ${i + 1}`} />)}
      {!visibleMatches.length && <p className="public-empty">{rounds.length ? '本輪沒有符合搜尋的對戰。' : '尚未產生賽程'}</p>}
    </section>}
  </section>;
}
