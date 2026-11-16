import React, { useLayoutEffect, useRef } from 'react';
import { gamesFor, resultPlayer } from './finalTournament';
import { AKASHIKI } from './tournamentState';

const treeRounds = [
  ['十六強', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']],
  ['八強', ['q1', 'q2', 'q3', 'q4']],
  ['四強', ['s1', 's2']],
  ['獎牌戰', ['gold']]
];

function FinalGames({ match, renderScore, highlightQuery = '', publicView = false }) {
  return <div className="final-games">
    {Array.from({ length: Math.min(3, (match.games?.length || 0) + (match.isDone ? 0 : 1)) }, (_, i) => {
      const game = match.games?.[i] || {};
      return <div key={i} role="group" aria-label={`冠軍戰第 ${i + 1} 局`}>
        <p>第 {i + 1} 局 · {game.p1Votes ?? '–'} : {game.p2Votes ?? '–'} 票</p>
        {renderScore?.('gold', game, i)}
      </div>;
    })}
  </div>;
}

function PlayoffMatch({ event, game: [key, label, first, second], tree = false, renderScore, highlightQuery = '', publicView = false, hideHeading = false }) {
  const match = event.bracket?.[key];
  const highlighted = Boolean(highlightQuery) && [match?.p1?.name, match?.p2?.name].some(name => name?.toLocaleLowerCase().includes(highlightQuery));
  const bo3 = event.rulesVersion === AKASHIKI && key === 'gold';
  const displayLabel = publicView ? label.replace(/\s+\d+$/, '') : label;
  const winnerId = resultPlayer(match)?.id;
  const outcomeClass = player => publicView && winnerId && player ? player.id === winnerId ? ' is-winner' : ' is-loser' : '';
  const seed = (player) => event.playoffSeeds.findIndex((p) => p.id === player.id) + 1;
  const Heading = tree ? 'h4' : 'h3';
  const sourceLabel = (source) => {
    const sourceGame = gamesFor(event).find(([id]) => id === source);
    return sourceGame ? `${publicView ? sourceGame[1].replace(/\s+\d+$/, '') : sourceGame[1]} ${key === 'bronze' ? '敗者' : '勝者'}` : publicView ? '等待選手' : `籤位 ${source}`;
  };
  return <article className={(tree ? 'playoff-tree-match' : '') + (highlighted ? ' is-search-match' : '')} tabIndex={highlighted ? -1 : undefined} aria-label={label} data-playoff-game={key}>
    {!hideHeading && <Heading>{displayLabel}{tree ? bo3 ? ' · BO3' : ' · BO1' : ''}</Heading>}
    {tree && <p className="playoff-source">{key === 'bronze' ? '四強敗者對戰' : key.startsWith('r') ? '首輪隨機籤位' : `${sourceLabel(first)} × ${sourceLabel(second)}`}</p>}
    {tree ? <div className="playoff-entrants">
      {[0, 1].map(i => {
        const player = i === 0 ? match?.p1 : match?.p2;
        const score = i === 0 ? match?.p1Votes : match?.p2Votes;
        const winner = player && resultPlayer(match)?.id === player.id;
        return <div key={i} className={'playoff-entrant' + (publicView ? outcomeClass(player) : winner ? ' is-winner' : '')}>
          <span>
            {player && <small>{i === 0 ? '先攻' : '後攻'}{!publicView && ` · 籤位 ${seed(player)}`}</small>}
            <strong>{player?.name || sourceLabel(i === 0 ? first : second)}</strong>
          </span>
          <b>{score ?? '–'}{bo3 && <small>局</small>}</b>
        </div>;
      })}
    </div> : match ? <div className="bout">
      <span className={outcomeClass(match.p1)}><small>先攻{!publicView && ` · #${seed(match.p1)}`}</small>{publicView ? <strong>{match.p1.name}</strong> : match.p1.name}</span>
      <b>{match.p1Votes ?? '–'} : {match.p2Votes ?? '–'}</b>
      <span className={outcomeClass(match.p2)}><small>後攻{!publicView && ` · #${seed(match.p2)}`}</small>{publicView ? <strong>{match.p2.name}</strong> : match.p2.name}</span>
    </div> : <p>等待晉級結果</p>}
    {match && (bo3 ? <FinalGames match={match} renderScore={renderScore} highlightQuery={highlightQuery} publicView={publicView} /> : renderScore?.(key, match))}
  </article>;
}

function PlayoffTree({ event, renderScore, highlightQuery = '', publicView = false }) {
  const canvas = useRef(null);
  const scoring = Boolean(renderScore);
  useLayoutEffect(() => {
    if (!globalThis.ResizeObserver) return;
    const element = canvas.current;
    const matches = [...element.querySelectorAll('[data-playoff-game^="r"]')];
    const fitRows = () => {
      const height = Math.max(...matches.map(match => match.getBoundingClientRect().height));
      // All rows stay equal, so feeder lines retain their exact quarter/half
      // alignment even when long names wrap or text is enlarged.
      element.style.setProperty('--tree-step', `max(${scoring ? '6.5rem' : '5.25rem'}, ${Math.ceil((height + 16) / 2)}px)`);
    };
    const observer = new ResizeObserver(fitRows);
    matches.forEach(match => observer.observe(match));
    fitRows();
    return () => observer.disconnect();
  }, [scoring]);
  const games = new Map(gamesFor(event).map(game => [game[0], game]));
  return <>
    <p className="playoff-tree-hint" id="playoff-tree-help">連線表示勝者晉級路徑；季軍戰由兩場四強敗者出賽。可在圖內左右滑動查看各輪。</p>
    <div className={'playoff-tree-scroll' + (renderScore ? ' is-scoring' : '')}
      role="region" aria-label="十六強晉級樹狀圖" aria-describedby="playoff-tree-help" tabIndex={0}>
      <div className="playoff-tree-canvas" ref={canvas}>
        <div className="playoff-tree-headings">
          {treeRounds.map(([label]) => <h3 key={label}>{label}</h3>)}
        </div>
        <div className="playoff-tree">
          {treeRounds.flatMap(([, keys], stage) => keys.map((key, index) => {
            const span = 2 ** (stage + 1);
            return <div key={key} className={'playoff-tree-node' + (stage ? ' has-feeders' : '')}
              style={{ gridColumn: stage + 1, gridRow: `${index * span + 1} / span ${span}` }}>
              <PlayoffMatch event={event} game={games.get(key)} tree renderScore={renderScore} highlightQuery={highlightQuery} publicView={publicView} />
            </div>;
          }))}
          <div className="playoff-tree-node playoff-tree-bronze" style={{ gridColumn: 4, gridRow: '13 / span 4' }}>
            <PlayoffMatch event={event} game={games.get('bronze')} tree renderScore={renderScore} highlightQuery={highlightQuery} publicView={publicView} />
          </div>
        </div>
      </div>
    </div>
  </>;
}

export default function PlayoffBracket({ event, renderScore, highlightQuery = '', publicView = false }) {
  const bracket = event.bracket || {};
  const akashiki = event.rulesVersion === AKASHIKI;
  const title = publicView ? '淘汰賽' : akashiki ? '十六強淘汰賽' : '八強淘汰賽';
  const medalists = [resultPlayer(bracket.gold), resultPlayer(bracket.gold, false), resultPlayer(bracket.bronze)];
  const readyGames = gamesFor(event).filter(([key]) => bracket[key]?.p1 && bracket[key]?.p2);
  return <section id="playoff" className={'playoff' + (publicView ? ' public-playoff' : '')} aria-label={title}>
    <h2>{title}</h2>
    {akashiki && <p>首輪隨機抽籤 · 三位評審 · 冠軍戰 BO3，其餘 BO1 · 含季軍戰</p>}
    {medalists.some(Boolean) && <ol className="medalists">
      {medalists.map((p, i) => <li key={i}>{['冠軍', '亞軍', '季軍'][i]}　{p?.name || '待定'}</li>)}
    </ol>}
    {publicView ? <div className="public-playoff-groups">
      {[...new Set(readyGames.map(([, label]) => label.replace(/\s+\d+$/, '')))].map(stage => <section className="public-playoff-stage" key={stage} aria-label={stage}>
        <h3>{stage}</h3>
        {readyGames.filter(([, label]) => label.replace(/\s+\d+$/, '') === stage).map(game => <PlayoffMatch key={game[0]} event={event} game={game} renderScore={renderScore} highlightQuery={highlightQuery} publicView hideHeading />)}
      </section>)}
    </div> : akashiki ? <PlayoffTree event={event} renderScore={renderScore} highlightQuery={highlightQuery} publicView={publicView} /> : <div className="playoff-grid">
      {gamesFor(event).map(game => <PlayoffMatch key={game[0]} event={event} game={game} renderScore={renderScore} highlightQuery={highlightQuery} publicView={publicView} />)}
    </div>}
  </section>;
}
