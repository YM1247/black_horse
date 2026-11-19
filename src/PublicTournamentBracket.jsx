import React from 'react';

const COLORS = {
  bg: '#0d0f12',
  card: '#161920',
  cardBorder: '#2a303c',
  inkBlue: '#b6d2d4',
  inkBlueDark: '#85a4a6',
  inkOrange: '#f1c6a6',
  textMain: '#e2e8f0',
  textMuted: '#a0adbf'
};

const getPlayerFontSize = (name = '') => {
  if (name.length > 12) return '0.875rem';
  if (name.length > 8) return '0.875rem';
  if (name.length > 5) return '0.9rem';
  return '1rem';
};

const groupRoundMatches = (matches, roundIndex, votesFirst) => matches.reduce((groups, match) => {
  const p1Wins = (votesFirst ? match.p1VotesSnapshot : match.p1WinsSnapshot) || 0;
  const p2Wins = (votesFirst ? match.p2VotesSnapshot : match.p2WinsSnapshot) || 0;
  const isFloat = !match.isMCMatch && p1Wins !== p2Wins;
  const score = p1Wins + (match.isMCMatch ? p1Wins : p2Wins);
  const loss = match.p1LossesSnapshot ?? match.p1.losses ?? Math.max(0, roundIndex - p1Wins);
  const rightLoss = match.p2LossesSnapshot ?? match.p2.losses ?? Math.max(0, roundIndex - p2Wins);
  const scores = [p1Wins, p2Wins].sort((a, b) => b - a);
  let label = isFloat || loss !== rightLoss ? '跨組對戰' : `${p1Wins} - ${loss}`;
  if (votesFirst) label = isFloat ? `${scores.join(' 票 ↔ ')} 票` : `${p1Wins} 票組`;
  const key = scores.join(':') + ':' + label;
  if (!groups[key]) groups[key] = { score, isFloat, label, matches: [] };
  groups[key].matches.push(match);
  return groups;
}, {});

export default function PublicTournamentBracket({ rounds = [], renderScore, votesFirst = false, publicView = false }) {
  const colors = publicView ? { bg: '#242728', card: '#2b3132', cardBorder: '#566063', inkBlue: '#b7cbd0', inkBlueDark: '#a8bdc4', inkOrange: '#d2b0b2', textMain: '#eeeae3', textMuted: '#b7cbd0' } : COLORS;
  return (
    <div className={`w-full ${renderScore ? 'overflow-x-auto' : ''}`} role="region" aria-label="完整瑞士制樹狀圖">
      <div className={`${renderScore ? 'admin-swiss-rounds' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3'} gap-5 md:gap-8 md:p-2 items-start`}>
        {rounds.map((matches, roundIndex) => {
          const groups = groupRoundMatches(matches, roundIndex, votesFirst);
          const sortedScores = Object.keys(groups).sort((first, second) => groups[first].score - groups[second].score);

          return (
            <div key={roundIndex} className="flex flex-col gap-6 w-full">
              <h3 id={`swiss-round-${roundIndex+1}`} className="text-center font-black tracking-widest text-xl py-3 rounded-lg border-2 shadow-lg"
                style={{ backgroundColor: colors.bg, borderColor: colors.inkBlue, color: colors.inkBlue }}>
                ROUND {roundIndex + 1}
              </h3>

              <div className="flex flex-col gap-6 flex-1 justify-center">
                {sortedScores.map(score => {
                  const group = groups[score];
                  const accentColor = group.isFloat ? colors.inkOrange : colors.inkBlue;

                  return (
                    <div key={`${roundIndex}-${score}`} className="rounded-xl overflow-hidden border-2 shadow-lg"
                      style={{ backgroundColor: colors.card, borderColor: accentColor }}>
                      <div className="font-black text-center py-2 text-lg tracking-widest shadow-md"
                        style={{ backgroundColor: publicView ? colors.card : accentColor, color: publicView ? colors.inkBlue : colors.bg }}>
                        {group.label}
                      </div>

                      <div className="p-2 sm:p-3 space-y-2">
                        {group.matches.map(match => {
                          const isDone = match.p1Votes !== null && match.p1Votes !== undefined;
                          const p1Won = isDone && match.p1Votes > match.p2Votes;
                          const p2Won = isDone && match.p2Votes > match.p1Votes;

                          return (
                            <div key={match.id} role={renderScore ? 'group' : undefined} aria-label={renderScore ? `第 ${roundIndex + 1} 輪 第 ${matches.indexOf(match) + 1} 場` : undefined} className={`rounded-lg border px-2 sm:px-4 py-3 ${isDone ? '' : 'border-dashed'}`}
                              style={{ backgroundColor: colors.bg, borderColor: isDone ? colors.cardBorder : colors.textMuted }}>
                              {renderScore && <p className="mb-2 text-center text-sm font-bold text-[#b6d2d4]">第 {matches.indexOf(match) + 1} 場</p>}
                              <div className="flex items-center justify-between w-full gap-2">
                                <div className="flex flex-col items-start w-0 flex-1">
                                  {match.attackOrder && <small className="text-[#b6d2d4] font-bold">先攻</small>}
                                  <div className="flex items-center gap-2 w-full">
                                    <span className={p1Won ? 'font-black text-white' : 'font-bold'}
                                      style={{ color: p1Won ? '#fff' : (isDone ? colors.textMuted : colors.textMain), fontSize: getPlayerFontSize(match.p1.name), wordBreak: 'break-word', lineHeight: 1.2 }}>
                                      {match.p1.name}
                                    </span>
                                    {p1Won && <span style={{ color: accentColor }} className="text-sm shrink-0">✓</span>}
                                  </div>
                                  {!match.p1.isMC && <div className="text-[11px] font-bold mt-1 opacity-70 whitespace-nowrap" style={{ color: accentColor }}>{match.p1WinsSnapshot || 0}W {match.p1VotesSnapshot || 0}票</div>}
                                </div>

                                {isDone && <div style={{ color: accentColor }} className="font-mono text-xl font-black w-5 sm:w-8 text-center shrink-0">{match.p1Votes}</div>}
                                <div style={{ color: group.isFloat ? colors.inkOrange : colors.inkBlueDark }} className="font-black text-xs px-1 shrink-0">{isDone ? '-' : 'VS'}</div>
                                {isDone && <div style={{ color: accentColor }} className="font-mono text-xl font-black w-5 sm:w-8 text-center shrink-0">{match.p2Votes}</div>}

                                <div className="flex flex-col items-end w-0 flex-1">
                                  {match.attackOrder && <small className="text-[#b6d2d4] font-bold">後攻</small>}
                                  <div className="flex items-center justify-end gap-2 w-full">
                                    {p2Won && <span style={{ color: accentColor }} className="text-sm shrink-0">✓</span>}
                                    <span className={`text-right ${p2Won ? 'font-black text-white' : 'font-bold'}`}
                                      style={{ color: p2Won ? '#fff' : (isDone ? colors.textMuted : colors.textMain), fontSize: getPlayerFontSize(match.p2.name), wordBreak: 'break-word', lineHeight: 1.2 }}>
                                      {match.p2.name}
                                    </span>
                                  </div>
                                  {!match.p2.isMC && <div className="text-[11px] font-bold mt-1 opacity-70 whitespace-nowrap" style={{ color: accentColor }}>{match.p2WinsSnapshot || 0}W {match.p2VotesSnapshot || 0}票</div>}
                                </div>
                              </div>
                              {renderScore && renderScore(match, roundIndex)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
