import React from 'react';
import { gamesFor, resultPlayer } from './finalTournament';
import { AKASHIKI } from './tournamentState';

export default function PlayoffBracket({ event, renderScore }) {
  const bracket = event.bracket || {};
  const akashiki = event.rulesVersion === AKASHIKI;
  const title = akashiki ? '十六強淘汰賽' : '八強淘汰賽';
  const seed = (player) => event.playoffSeeds.findIndex((p) => p.id === player.id) + 1;
  const medalists = [resultPlayer(bracket.gold), resultPlayer(bracket.gold, false), resultPlayer(bracket.bronze)];
  return (
    <section id="playoff" className="playoff" aria-label={title}>
      <h2>{title}</h2>
      {akashiki && <p>首輪隨機抽籤 · 三位評審 · 冠軍戰 BO3，其餘 BO1 · 含季軍戰</p>}
      {medalists.some(Boolean) && (
        <ol className="medalists">
          {medalists.map((p, i) => (
            <li key={i}>
              {['冠軍', '亞軍', '季軍'][i]}　{p?.name || '待定'}
            </li>
          ))}
        </ol>
      )}
      <div className="playoff-grid">
        {gamesFor(event).map(([key, label]) => {
          const match = bracket[key];
          return (
            <article key={key}>
              <h3>{label}{akashiki ? key === 'gold' ? ' · BO3' : ' · BO1' : ''}</h3>
              {match ? (
                <>
                  <div className="bout">
                    <span>
                      <small>先攻 · {akashiki ? '籤位 ' : '#'}{seed(match.p1)}</small>
                      {match.p1.name}
                    </span>
                    <b>
                      {match.p1Votes ?? '–'} : {match.p2Votes ?? '–'}
                      {akashiki && key === 'gold' && <small>局數</small>}
                    </b>
                    <span>
                      <small>後攻 · {akashiki ? '籤位 ' : '#'}{seed(match.p2)}</small>
                      {match.p2.name}
                    </span>
                  </div>
                  {akashiki && key === 'gold' ? (
                    <div className="final-games">
                      {Array.from({ length: Math.min(3, (match.games?.length || 0) + (match.isDone ? 0 : 1)) }, (_, i) => {
                        const game = match.games?.[i] || {};
                        return <div key={i} role="group" aria-label={`冠軍戰第 ${i + 1} 局`}>
                          <p>第 {i + 1} 局 · {game.p1Votes ?? '–'} : {game.p2Votes ?? '–'} 票</p>
                          {renderScore?.(key, game, i)}
                        </div>;
                      })}
                    </div>
                  ) : renderScore?.(key, match)}
                </>
              ) : (
                <p>等待晉級結果</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
