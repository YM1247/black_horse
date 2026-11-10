import React from 'react';
import { playoffGames, resultPlayer } from './finalTournament';

export default function PlayoffBracket({ event, renderScore }) {
  const bracket = event.bracket || {};
  const seed = (player) => event.playoffSeeds.findIndex((p) => p.id === player.id) + 1;
  const medalists = [resultPlayer(bracket.gold), resultPlayer(bracket.gold, false), resultPlayer(bracket.bronze)];
  return (
    <section id="playoff" className="playoff" aria-label="八強淘汰賽">
      <h2>八強淘汰賽</h2>
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
        {playoffGames.map(([key, label]) => {
          const match = bracket[key];
          return (
            <article key={key}>
              <h3>{label}</h3>
              {match ? (
                <>
                  <div className="bout">
                    <span>
                      <small>先攻 · #{seed(match.p1)}</small>
                      {match.p1.name}
                    </span>
                    <b>
                      {match.p1Votes ?? '–'} : {match.p2Votes ?? '–'}
                    </b>
                    <span>
                      <small>後攻 · #{seed(match.p2)}</small>
                      {match.p2.name}
                    </span>
                  </div>
                  {renderScore?.(key, match)}
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
