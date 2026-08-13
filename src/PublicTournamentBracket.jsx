import React from 'react';

const COLORS = {
  bg: '#0d0f12',
  card: '#161920',
  cardBorder: '#2a303c',
  inkBlue: '#b6d2d4',
  inkBlueDark: '#85a4a6',
  inkOrange: '#f1c6a6',
  textMain: '#e2e8f0',
  textMuted: '#64748b'
};

const getPlayerFontSize = (name = '') => {
  if (name.length > 12) return '0.7rem';
  if (name.length > 8) return '0.8rem';
  if (name.length > 5) return '0.9rem';
  return '1rem';
};

const groupRoundMatches = (matches, roundIndex) => matches.reduce((groups, match) => {
  const p1Wins = match.p1WinsSnapshot || 0;
  const p2Wins = match.p2WinsSnapshot || 0;
  const isFloat = !match.isMCMatch && p1Wins !== p2Wins;
  const score = p1Wins + (match.isMCMatch ? p1Wins : p2Wins);

  if (!groups[score]) {
    groups[score] = {
      isFloat,
      label: isFloat ? '跨組對戰' : `${p1Wins} - ${roundIndex - p1Wins}`,
      matches: []
    };
  }
  groups[score].matches.push(match);
  return groups;
}, {});

export default function PublicTournamentBracket({ rounds = [] }) {
  return (
    <div className="w-full" role="region" aria-label="完整瑞士制樹狀圖">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 p-2 items-center">
        {rounds.map((matches, roundIndex) => {
          const groups = groupRoundMatches(matches, roundIndex);
          const sortedScores = Object.keys(groups).map(Number).sort((first, second) => second - first);

          return (
            <div key={roundIndex} className="flex flex-col gap-6 w-full">
              <div className="text-center font-black tracking-widest text-xl py-3 rounded-lg border-2 shadow-lg"
                style={{ backgroundColor: COLORS.bg, borderColor: COLORS.inkBlue, color: COLORS.inkBlue }}>
                ROUND {roundIndex + 1}
              </div>

              <div className="flex flex-col gap-6 flex-1 justify-center">
                {sortedScores.map(score => {
                  const group = groups[score];
                  const accentColor = group.isFloat ? COLORS.inkOrange : COLORS.inkBlue;

                  return (
                    <div key={`${roundIndex}-${score}`} className="rounded-xl overflow-hidden border-2 shadow-lg"
                      style={{ backgroundColor: COLORS.card, borderColor: accentColor }}>
                      <div className="font-black text-center py-2 text-lg tracking-widest shadow-md"
                        style={{ backgroundColor: accentColor, color: COLORS.bg }}>
                        {group.label}
                      </div>

                      <div className="p-3 space-y-3">
                        {group.matches.map(match => {
                          const isDone = match.p1Votes !== null && match.p1Votes !== undefined;
                          const p1Won = isDone && match.p1Votes > match.p2Votes;
                          const p2Won = isDone && match.p2Votes > match.p1Votes;

                          return (
                            <div key={match.id} className={`rounded-lg border px-4 py-3 ${isDone ? '' : 'border-dashed'}`}
                              style={{ backgroundColor: COLORS.bg, borderColor: isDone ? COLORS.cardBorder : COLORS.textMuted }}>
                              <div className="flex items-center justify-between w-full gap-2">
                                <div className="flex flex-col items-start w-0 flex-1">
                                  <div className="flex items-center gap-2 w-full">
                                    <span className={p1Won ? 'font-black text-white' : 'font-bold'}
                                      style={{ color: p1Won ? '#fff' : (isDone ? COLORS.textMuted : COLORS.textMain), fontSize: getPlayerFontSize(match.p1.name), wordBreak: 'break-word', lineHeight: 1.2 }}>
                                      {match.p1.name}
                                    </span>
                                    {p1Won && <span style={{ color: accentColor }} className="text-sm shrink-0">✓</span>}
                                  </div>
                                  {!match.p1.isMC && <div className="text-[11px] font-bold mt-1 opacity-70 whitespace-nowrap" style={{ color: accentColor }}>{match.p1WinsSnapshot || 0}W {match.p1VotesSnapshot || 0}票</div>}
                                </div>

                                {isDone && <div style={{ color: accentColor }} className="font-mono text-xl font-black w-8 text-center shrink-0">{match.p1Votes}</div>}
                                <div style={{ color: group.isFloat ? COLORS.inkOrange : COLORS.inkBlueDark }} className="font-black text-xs px-1 shrink-0">{isDone ? '-' : 'VS'}</div>
                                {isDone && <div style={{ color: accentColor }} className="font-mono text-xl font-black w-8 text-center shrink-0">{match.p2Votes}</div>}

                                <div className="flex flex-col items-end w-0 flex-1">
                                  <div className="flex items-center justify-end gap-2 w-full">
                                    {p2Won && <span style={{ color: accentColor }} className="text-sm shrink-0">✓</span>}
                                    <span className={`text-right ${p2Won ? 'font-black text-white' : 'font-bold'}`}
                                      style={{ color: p2Won ? '#fff' : (isDone ? COLORS.textMuted : COLORS.textMain), fontSize: getPlayerFontSize(match.p2.name), wordBreak: 'break-word', lineHeight: 1.2 }}>
                                      {match.p2.name}
                                    </span>
                                  </div>
                                  {!match.p2.isMC && <div className="text-[11px] font-bold mt-1 opacity-70 whitespace-nowrap" style={{ color: accentColor }}>{match.p2WinsSnapshot || 0}W {match.p2VotesSnapshot || 0}票</div>}
                                </div>
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
        })}
      </div>
    </div>
  );
}
