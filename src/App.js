import React, { useState, useEffect } from 'react';
import { Trophy, Users, Swords, UserPlus, Play, CheckCircle, RotateCcw, Medal, ChevronRight, AlertTriangle, LayoutList, Network, Archive, Trash2, Save, X, Clock, Home, Edit3, Check } from 'lucide-react';

const SCHOOLS = ['學校 A', '學校 B', '學校 C', '學校 D'];
const MAX_ROUNDS = 3;

// 主題色票 (對應黑馬記念圖片)
const COLORS = {
  bg: '#0d0f12',
  card: '#161920',
  cardBorder: '#2a303c',
  inkBlue: '#b6d2d4',
  inkBlueDark: '#85a4a6',
  inkOrange: '#f1c6a6',
  inkOrangeDark: '#d4a17a',
  textMain: '#e2e8f0',
  textMuted: '#64748b'
};

// Helper: 隨機打亂陣列
const shuffle = (array) => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
};

// Helper: 根據字數動態調整字體大小
const getDynamicFontSize = (name, isTreeMode = false) => {
  const len = name.length;
  if (isTreeMode) {
    if (len > 12) return '0.7rem';
    if (len > 8) return '0.8rem';
    if (len > 5) return '0.9rem';
    return '1rem'; // text-base
  } else {
    // List Mode
    if (len > 12) return '1rem';
    if (len > 8) return '1.125rem';
    return '1.25rem'; // text-xl
  }
};

export default function App() {
  const [phase, setPhase] = useState('registration'); // 'registration', 'playing', 'finished'
  const [players, setPlayers] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [currentRoundNum, setCurrentRoundNum] = useState(1);
  const [viewMode, setViewMode] = useState('tree'); // 預設改為樹狀圖

  // Modal 視窗狀態
  const [confirmAction, setConfirmAction] = useState(null);

  // 存檔管理狀態
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [saves, setSaves] = useState(() => {
    try {
      const local = localStorage.getItem('swiss_tourney_saves_v3');
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });
  
  // 編輯存檔名稱狀態
  const [editingSaveId, setEditingSaveId] = useState(null);
  const [editingSaveName, setEditingSaveName] = useState('');

  // 新增參賽者狀態
  const [newName, setNewName] = useState('');
  const [newSchool, setNewSchool] = useState(SCHOOLS[0]);

  // 自動同步存檔到 LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('swiss_tourney_saves_v3', JSON.stringify(saves));
    } catch (e) {
      console.error("存檔寫入失敗", e);
    }
  }, [saves]);

  const handleAddPlayer = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const newPlayer = { id: crypto.randomUUID(), name: newName.trim(), school: newSchool, wins: 0, votes: 0, isBye: false };
    setPlayers([...players, newPlayer]);
    setNewName('');
  };

  const loadMockData = () => {
    const mockPlayers = [
      { id: crypto.randomUUID(), name: 'player-001', school: '學校 A', wins: 0, votes: 0, isBye: false },
      { id: crypto.randomUUID(), name: 'player-002', school: '學校 A', wins: 0, votes: 0, isBye: false },
      { id: crypto.randomUUID(), name: 'player-003', school: '學校 B', wins: 0, votes: 0, isBye: false },
      { id: crypto.randomUUID(), name: 'player-004', school: '學校 B', wins: 0, votes: 0, isBye: false },
      { id: crypto.randomUUID(), name: 'player-005', school: '學校 C', wins: 0, votes: 0, isBye: false },
      { id: crypto.randomUUID(), name: 'player-006', school: '學校 C', wins: 0, votes: 0, isBye: false },
      { id: crypto.randomUUID(), name: 'player-007', school: '學校 D', wins: 0, votes: 0, isBye: false },
      { id: crypto.randomUUID(), name: 'player-008', school: '學校 D', wins: 0, votes: 0, isBye: false },
    ];
    setPlayers(mockPlayers);
  };

  const removePlayer = (id) => setPlayers(players.filter(p => p.id !== id));

  // --- 存檔管理功能 ---
  const handleCreateSave = () => {
    const name = saveNameInput.trim() || `手動存檔 - ${new Date().toLocaleString()}`;
    const newSave = { id: crypto.randomUUID(), name, date: new Date().toISOString(), isAuto: false, data: { phase, players, rounds, currentRoundNum } };
    setSaves([newSave, ...saves]);
    setSaveNameInput('');
  };

  const executeLoadSave = (saveId) => {
    const targetSave = saves.find(s => s.id === saveId);
    if (targetSave) {
      setPhase(targetSave.data.phase);
      setPlayers(targetSave.data.players);
      setRounds(targetSave.data.rounds);
      setCurrentRoundNum(targetSave.data.currentRoundNum);
      setIsSaveModalOpen(false);
      setConfirmAction(null);
    }
  };

  const executeDeleteSave = (saveId) => {
    setSaves(saves.filter(s => s.id !== saveId));
    setConfirmAction(null);
  };

  const saveRename = (id) => {
    setSaves(saves.map(s => s.id === id ? { ...s, name: editingSaveName } : s));
    setEditingSaveId(null);
  };

  // --- 賽事核心邏輯 ---
  const startTournament = () => {
    let tournamentPlayers = [...players];
    if (tournamentPlayers.length % 2 !== 0) {
      tournamentPlayers.push({ id: 'BYE', name: '輪空 (BYE)', school: '-', wins: 0, votes: 0, isBye: true });
    }
    setPhase('playing');
    generateRound(1, tournamentPlayers);
  };

  const generateRound = (roundNum, currentPlayers) => {
    let newMatches = [];
    
    if (roundNum === 1) {
      let success = false;
      let attempts = 0;
      while (!success && attempts < 100) {
        attempts++;
        let pool = shuffle([...currentPlayers]);
        let tempMatches = [];
        let ok = true;
        
        while (pool.length >= 2) {
          let p1 = pool.pop();
          if (p1.isBye) {
             let p2 = pool.pop();
             tempMatches.push({ id: crypto.randomUUID(), p1, p2, p1Votes: 0, p2Votes: 5, isByeMatch: true });
             continue;
          }

          let p2Idx = pool.findIndex(p => p.school !== p1.school || p.isBye);
          if (p2Idx === -1) { ok = false; break; }
          let p2 = pool.splice(p2Idx, 1)[0];
          
          if (p2.isBye) { tempMatches.push({ id: crypto.randomUUID(), p1, p2, p1Votes: 5, p2Votes: 0, isByeMatch: true }); } 
          else { tempMatches.push({ id: crypto.randomUUID(), p1, p2, p1Votes: null, p2Votes: null, isByeMatch: false }); }
        }
        if (ok) { success = true; newMatches = tempMatches; }
      }
      if (!success) {
        let pool = shuffle([...currentPlayers]);
        while (pool.length >= 2) {
          let p1 = pool.pop(); let p2 = pool.pop(); let isByeMatch = p1.isBye || p2.isBye;
          newMatches.push({ id: crypto.randomUUID(), p1, p2, p1Votes: p1.isBye ? 0 : (p2.isBye ? 5 : null), p2Votes: p2.isBye ? 0 : (p1.isBye ? 5 : null), isByeMatch });
        }
      }
    } else {
      let pool = [...currentPlayers.filter(p => !p.isBye)];
      let byePlayer = currentPlayers.find(p => p.isBye);
      let groups = {};
      
      pool.forEach(p => { if (!groups[p.wins]) groups[p.wins] = []; groups[p.wins].push(p); });
      let scoreKeys = Object.keys(groups).map(Number).sort((a, b) => b - a); 
      
      for (let i = 0; i < scoreKeys.length; i++) {
        let s = scoreKeys[i];
        if (groups[s].length % 2 !== 0) {
          let minVotes = Math.min(...groups[s].map(p => p.votes));
          let candsLow = groups[s].filter(p => p.votes === minVotes);
          let pLow = candsLow[Math.floor(Math.random() * candsLow.length)];
          groups[s] = groups[s].filter(p => p.id !== pLow.id); 
          
          let nextS = -1;
          for (let j = i + 1; j < scoreKeys.length; j++) {
            if (groups[scoreKeys[j]].length > 0) { nextS = scoreKeys[j]; break; }
          }
          if (nextS !== -1) {
            let maxVotes = Math.max(...groups[nextS].map(p => p.votes));
            let candsHigh = groups[nextS].filter(p => p.votes === maxVotes);
            let pHigh = candsHigh[Math.floor(Math.random() * candsHigh.length)];
            groups[nextS] = groups[nextS].filter(p => p.id !== pHigh.id);
            newMatches.push({ id: crypto.randomUUID(), p1: pLow, p2: pHigh, p1Votes: null, p2Votes: null, isByeMatch: false });
          } else if (byePlayer) {
            newMatches.push({ id: crypto.randomUUID(), p1: pLow, p2: byePlayer, p1Votes: 5, p2Votes: 0, isByeMatch: true });
            byePlayer = null;
          }
        }
        
        let remaining = shuffle(groups[s]);
        while (remaining.length >= 2) {
          newMatches.push({ id: crypto.randomUUID(), p1: remaining.pop(), p2: remaining.pop(), p1Votes: null, p2Votes: null, isByeMatch: false });
        }
        if (remaining.length === 1 && byePlayer) {
          newMatches.push({ id: crypto.randomUUID(), p1: remaining.pop(), p2: byePlayer, p1Votes: 5, p2Votes: 0, isByeMatch: true });
          byePlayer = null;
        }
      }
    }
    
    // 寫入快照
    newMatches = newMatches.map(match => ({
      ...match, p1WinsSnapshot: match.p1.wins, p1VotesSnapshot: match.p1.votes, p2WinsSnapshot: match.p2.wins, p2VotesSnapshot: match.p2.votes
    }));

    // 套用 BYE
    let updatedPlayers = [...currentPlayers];
    newMatches.forEach(match => {
      if (match.isByeMatch) {
        let p1 = updatedPlayers.find(p => p.id === match.p1.id); let p2 = updatedPlayers.find(p => p.id === match.p2.id);
        if (p1 && !p1.isBye) { p1.votes += match.p1Votes; if (match.p1Votes > match.p2Votes) p1.wins += 1; }
        if (p2 && !p2.isBye) { p2.votes += match.p2Votes; if (match.p2Votes > match.p1Votes) p2.wins += 1; }
      }
    });

    setRounds(prev => [...prev, newMatches]);
    setPlayers(updatedPlayers);
  };

  const applyHistoricalEdit = (roundIndex, matchId, p1Score, p2Score) => {
    let newRounds = rounds.slice(0, roundIndex + 1);
    const roundMatches = [...newRounds[roundIndex]];
    const matchIndex = roundMatches.findIndex(m => m.id === matchId);
    roundMatches[matchIndex] = { ...roundMatches[matchIndex], p1Votes: p1Score, p2Votes: p2Score };
    newRounds[roundIndex] = roundMatches;

    let updatedPlayers = players.map(p => ({ ...p, wins: 0, votes: 0 }));

    newRounds.forEach(r => {
      r.forEach(m => {
        if (m.p1Votes !== null && m.p2Votes !== null) {
          let p1 = updatedPlayers.find(p => p.id === m.p1.id); let p2 = updatedPlayers.find(p => p.id === m.p2.id);
          if (p1 && !p1.isBye) { p1.votes += m.p1Votes; if (m.p1Votes > m.p2Votes) p1.wins += 1; }
          if (p2 && !p2.isBye) { p2.votes += m.p2Votes; if (m.p2Votes > m.p1Votes) p2.wins += 1; }
        }
      });
    });

    setRounds(newRounds); setPlayers(updatedPlayers); setCurrentRoundNum(roundIndex + 1);
    setPhase('playing'); setConfirmAction(null);
  };

  const handleMatchResult = (roundIndex, matchId, p1Score, p2Score) => {
    if (roundIndex < currentRoundNum - 1) {
      setConfirmAction({ type: 'EDIT_HISTORY', roundIndex, matchId, p1Score, p2Score });
      return;
    }
    const updatedRounds = [...rounds];
    const currentRoundMatches = updatedRounds[currentRoundNum - 1];
    const matchIndex = currentRoundMatches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;
    const match = currentRoundMatches[matchIndex];
    if (match.p1Votes === p1Score && match.p2Votes === p2Score) return;

    let updatedPlayers = [...players];

    if (match.p1Votes !== null && match.p2Votes !== null) {
      let p1 = updatedPlayers.find(p => p.id === match.p1.id); let p2 = updatedPlayers.find(p => p.id === match.p2.id);
      if (p1 && !p1.isBye) { p1.votes -= match.p1Votes; if (match.p1Votes > match.p2Votes) p1.wins -= 1; }
      if (p2 && !p2.isBye) { p2.votes -= match.p2Votes; if (match.p2Votes > match.p1Votes) p2.wins -= 1; }
    }

    match.p1Votes = p1Score; match.p2Votes = p2Score;

    let p1 = updatedPlayers.find(p => p.id === match.p1.id); let p2 = updatedPlayers.find(p => p.id === match.p2.id);
    if (p1 && !p1.isBye) { p1.votes += p1Score; if (p1Score > p2Score) p1.wins += 1; }
    if (p2 && !p2.isBye) { p2.votes += p2Score; if (p2Score > p1Score) p2.wins += 1; }

    setRounds(updatedRounds); setPlayers(updatedPlayers);
  };

  const advanceToNextRound = () => {
    if (currentRoundNum < MAX_ROUNDS) {
      const nextRoundNum = currentRoundNum + 1;
      setCurrentRoundNum(nextRoundNum);
      generateRound(nextRoundNum, players);
    } else {
      setPhase('finished');
      const newSave = { id: crypto.randomUUID(), name: `(自動紀錄) 完賽 - ${new Date().toLocaleString()}`, date: new Date().toISOString(), isAuto: true, data: { phase: 'finished', players, rounds, currentRoundNum } };
      setSaves(prev => [newSave, ...prev]);
    }
  };

  const confirmFullReset = () => { setPlayers([]); setRounds([]); setCurrentRoundNum(1); setPhase('registration'); setConfirmAction(null); };
  const confirmRematch = () => {
    const resetPlayers = players.filter(p => !p.isBye).map(p => ({ ...p, wins: 0, votes: 0 }));
    setPlayers(resetPlayers); setRounds([]); setCurrentRoundNum(1); setPhase('registration'); setConfirmAction(null);
  };

  const getRankedPlayers = () => {
    return [...players].filter(p => !p.isBye).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins; 
      return b.votes - a.votes; 
    });
  };

  // --- 繪製樹狀圖共用函數 (用於進行中與結算畫面) ---
  const renderBracket = (isReadOnly = false) => (
    <div className="w-full">
      {/* 加入 items-center 以達成垂直置中 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10 p-2 items-center">
        {rounds.map((roundMatches, rIdx) => {
          const groups = roundMatches.reduce((acc, match) => {
            const w1 = match.p1WinsSnapshot || 0; const w2 = match.p2WinsSnapshot || 0;
            const isFloat = !match.isByeMatch && (w1 !== w2);
            const effectiveW2 = match.isByeMatch ? w1 : w2;
            const score = w1 + effectiveW2;

            if (!acc[score]) { acc[score] = { isFloat, matches: [], label: isFloat ? '跨組對戰' : `${w1} - ${rIdx - w1}` }; }
            acc[score].matches.push(match); return acc;
          }, {});

          const sortedScores = Object.keys(groups).map(Number).sort((a, b) => b - a);
          const isCurrentRound = (rIdx + 1 === currentRoundNum);

          return (
            <div key={rIdx} className="flex flex-col gap-6 w-full">
              {/* Round Title */}
              <div className="text-center font-black tracking-widest text-xl uppercase py-3 rounded-lg border-2 shadow-lg brush-border"
                   style={{ backgroundColor: COLORS.bg, borderColor: COLORS.inkBlue, color: COLORS.inkBlue }}>
                ROUND {rIdx + 1}
              </div>
              
              <div className="flex flex-col gap-6 flex-1 justify-center">
                {sortedScores.map(score => {
                  const group = groups[score];
                  const isFloatGroup = group.isFloat;

                  return (
                    <div key={`${rIdx}-${score}`} className="rounded-xl overflow-hidden relative border-2 shadow-lg brush-border"
                         style={{ backgroundColor: COLORS.card, borderColor: isFloatGroup ? COLORS.inkOrange : COLORS.inkBlue }}>
                      {/* Group Label */}
                      <div className="font-black text-center py-2 text-lg tracking-widest uppercase shadow-md"
                           style={{ backgroundColor: isFloatGroup ? COLORS.inkOrange : COLORS.inkBlue, color: COLORS.bg }}>
                        {group.label}
                      </div>
                      
                      <div className="p-3 space-y-3">
                        {group.matches.map(match => {
                          const p1Won = match.p1Votes !== null && match.p1Votes > match.p2Votes;
                          const p2Won = match.p2Votes !== null && match.p2Votes > match.p1Votes;
                          const isDone = match.p1Votes !== null;
                          const accentColor = isFloatGroup ? COLORS.inkOrange : COLORS.inkBlue;

                          return (
                            <div key={match.id} className={`flex flex-col rounded-lg border relative transition-all brush-border
                              ${isDone ? 'py-3 px-4' : 'border-dashed py-3 px-4'}
                              ${isCurrentRound && !isDone && !isReadOnly ? 'ring-2' : ''}`}
                              style={{ backgroundColor: COLORS.bg, borderColor: isDone ? COLORS.cardBorder : COLORS.textMuted, ringColor: accentColor }}>
                              
                              <div className="flex items-center justify-between w-full">
                                {/* P1 */}
                                <div className="flex flex-col items-start w-0 flex-1">
                                  <div className="flex items-center gap-2 w-full">
                                    <span className={`${p1Won ? 'font-black text-white' : (isDone ? 'font-medium' : 'font-bold')}`} 
                                          style={{ 
                                            color: p1Won ? '#fff' : (isDone ? COLORS.textMuted : COLORS.textMain),
                                            fontSize: getDynamicFontSize(match.p1.name, true),
                                            wordBreak: 'break-word',
                                            lineHeight: 1.2
                                          }}>
                                      {match.p1.name}
                                    </span>
                                    {p1Won && <span style={{ color: accentColor }} className="text-sm shrink-0">✓</span>}
                                  </div>
                                  {!match.p1.isBye && (
                                    <div className="text-[11px] font-bold mt-1 opacity-70 whitespace-nowrap" style={{ color: accentColor }}>
                                      {match.p1WinsSnapshot}W {match.p1VotesSnapshot}票
                                    </div>
                                  )}
                                </div>
                                
                                {isDone && <div style={{ color: accentColor }} className="font-mono text-xl font-black w-8 text-center shrink-0">{match.p1Votes}</div>}

                                <div style={{ color: isFloatGroup ? COLORS.inkOrangeDark : COLORS.inkBlueDark }} className="font-black text-xs px-2 shrink-0">{isDone ? '-' : 'VS'}</div>

                                {isDone && <div style={{ color: accentColor }} className="font-mono text-xl font-black w-8 text-center shrink-0">{match.p2Votes}</div>}
                                
                                {/* P2 */}
                                <div className="flex flex-col items-end w-0 flex-1">
                                  <div className="flex items-center justify-end gap-2 w-full">
                                    {p2Won && <span style={{ color: accentColor }} className="text-sm shrink-0">✓</span>}
                                    <span className={`text-right ${p2Won ? 'font-black text-white' : (isDone ? 'font-medium' : 'font-bold')}`} 
                                          style={{ 
                                            color: p2Won ? '#fff' : (isDone ? COLORS.textMuted : COLORS.textMain),
                                            fontSize: getDynamicFontSize(match.p2.name, true),
                                            wordBreak: 'break-word',
                                            lineHeight: 1.2
                                          }}>
                                      {match.p2.name}
                                    </span>
                                  </div>
                                  {!match.p2.isBye && (
                                    <div className="text-[11px] font-bold mt-1 opacity-70 whitespace-nowrap" style={{ color: accentColor }}>
                                      {match.p2WinsSnapshot}W {match.p2VotesSnapshot}票
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 比分輸入按鈕區塊 (唯讀模式下不顯示) */}
                              {!isReadOnly && (
                                match.isByeMatch ? (
                                  <div className="mt-3 text-center text-xs font-bold text-green-400 border-t border-slate-800 pt-2">自動判定：5 - 0</div>
                                ) : (
                                  <div className="grid grid-cols-6 gap-1 mt-3 border-t border-slate-800 pt-3">
                                    {[ {v1: 5, v2: 0}, {v1: 4, v2: 1}, {v1: 3, v2: 2}, {v1: 2, v2: 3}, {v1: 1, v2: 4}, {v1: 0, v2: 5} ].map((score) => {
                                      const isSelected = match.p1Votes === score.v1 && match.p2Votes === score.v2;
                                      return (
                                        <button key={`${score.v1}-${score.v2}`} onClick={() => handleMatchResult(rIdx, match.id, score.v1, score.v2)}
                                          className={`py-1.5 text-xs font-black rounded-md transition-all brush-border border ${
                                            isSelected 
                                            ? `text-[#0d0f12]` 
                                            : `bg-transparent text-slate-400 border-slate-700 hover:text-white`
                                          }`}
                                          style={{ 
                                            backgroundColor: isSelected ? accentColor : 'transparent',
                                            borderColor: isSelected ? accentColor : undefined,
                                          }}>
                                          {score.v1}:{score.v2}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )
                              )}
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
      
      {/* 下一輪按鈕 */}
      {!isReadOnly && rounds[currentRoundNum - 1]?.every(m => m.p1Votes !== null && m.p2Votes !== null) && currentRoundNum <= MAX_ROUNDS && (
        <div className="mt-10 flex justify-center sticky bottom-6 z-20">
           <button onClick={advanceToNextRound}
              className="flex items-center gap-3 px-10 py-4 rounded-xl font-black text-xl uppercase tracking-widest shadow-2xl transition-all hover:scale-105 active:scale-95 brush-border"
              style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg, boxShadow: `0 0 25px ${COLORS.inkBlue}60` }}>
              {currentRoundNum === MAX_ROUNDS ? '結算最終排名' : '進入下一輪'} <ChevronRight size={24} />
            </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen font-sans p-4 md:p-8 relative selection:bg-cyan-900 selection:text-white"
         style={{ backgroundColor: COLORS.bg, color: COLORS.textMain }}>
      
      {/* 水墨風格全局 CSS (注入) */}
      <style>{`
        .brush-border {
          border-radius: 3px 255px 5px 25px / 255px 5px 225px 3px;
        }
        .ink-splash-bg {
          background-image: 
            radial-gradient(circle at 10% 20%, ${COLORS.inkOrange}10 0%, transparent 40%),
            radial-gradient(circle at 90% 80%, ${COLORS.inkBlue}10 0%, transparent 40%),
            radial-gradient(circle at 50% 50%, #ffffff03 0%, transparent 60%);
        }
        input, select { background-color: ${COLORS.card}; color: ${COLORS.textMain}; border-color: ${COLORS.cardBorder}; }
        input:focus, select:focus { border-color: ${COLORS.inkBlue}; outline: none; box-shadow: 0 0 0 2px ${COLORS.inkBlue}40; }
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: ${COLORS.bg}; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${COLORS.cardBorder}; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${COLORS.inkBlueDark}; }
      `}</style>

      {/* 頂部 工具列 */}
      <div className="absolute top-4 left-4 md:top-8 md:left-8 z-30">
        <button onClick={() => { if(phase === 'registration' && players.length===0) return; setConfirmAction({ type: 'GO_HOME' }); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-bold brush-border border"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder, color: COLORS.textMain }}>
          <Home size={18} style={{color: COLORS.inkOrange}} /> 回首頁
        </button>
      </div>

      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex gap-3 z-30">
        <button onClick={() => setIsSaveModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg shadow-lg transition-all text-sm font-black tracking-widest uppercase brush-border"
          style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>
          <Archive size={18} /> 賽事檔案庫
        </button>
      </div>

      {/* Save Manager Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] border-2 brush-border" style={{ backgroundColor: COLORS.bg, borderColor: COLORS.cardBorder }}>
            <div className="flex justify-between items-center p-5 border-b" style={{ borderColor: COLORS.cardBorder, backgroundColor: COLORS.card }}>
              <h2 className="text-xl font-black flex items-center gap-3 tracking-widest" style={{ color: COLORS.textMain }}>
                <Archive style={{ color: COLORS.inkBlue }} /> 賽事紀錄與存檔中心
              </h2>
              <button onClick={() => setIsSaveModalOpen(false)} className="opacity-70 hover:opacity-100 transition-opacity">
                <X size={28} style={{ color: COLORS.textMuted }} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              <div className="p-5 rounded-xl border flex flex-col sm:flex-row gap-4 brush-border" style={{ backgroundColor: '#131e24', borderColor: '#1d323b' }}>
                <input type="text" value={saveNameInput} onChange={(e) => setSaveNameInput(e.target.value)}
                  placeholder="為當前進度命名 (例如: 決賽Day1進度)..."
                  className="flex-1 px-4 py-3 rounded-lg border outline-none text-base" />
                <button onClick={handleCreateSave} className="px-6 py-3 rounded-lg font-black transition-colors flex items-center justify-center gap-2 brush-border"
                  style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>
                  <Save size={20} /> 儲存當前進度
                </button>
              </div>

              <div>
                <h3 className="text-sm font-black uppercase tracking-widest mb-4" style={{ color: COLORS.textMuted }}>已儲存的紀錄 ({saves.length})</h3>
                {saves.length === 0 ? (
                  <div className="text-center py-12 rounded-xl border border-dashed font-bold tracking-widest" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder, color: COLORS.textMuted }}>
                    尚無任何存檔紀錄
                  </div>
                ) : (
                  <div className="space-y-4">
                    {saves.map(save => (
                      <div key={save.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 rounded-xl border transition-colors gap-4 brush-border"
                           style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                        
                        <div className="flex-1 min-w-0 w-full">
                          {editingSaveId === save.id ? (
                            <div className="flex items-center gap-2 mb-2 w-full">
                              <input autoFocus type="text" value={editingSaveName} onChange={(e) => setEditingSaveName(e.target.value)} 
                                     className="flex-1 px-3 py-1.5 rounded-md text-sm border font-bold" />
                              <button onClick={() => saveRename(save.id)} className="p-1.5 rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30"><Check size={18}/></button>
                              <button onClick={() => setEditingSaveId(null)} className="p-1.5 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30"><X size={18}/></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 mb-2">
                              {save.isAuto && <span className="text-[10px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider" style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg }}>Auto</span>}
                              <h4 className="font-bold truncate text-lg text-white flex-1">{save.name}</h4>
                              <button onClick={() => {setEditingSaveId(save.id); setEditingSaveName(save.name);}} className="opacity-50 hover:opacity-100"><Edit3 size={16} style={{color: COLORS.inkBlue}}/></button>
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-xs font-bold" style={{ color: COLORS.textMuted }}>
                            <span className="flex items-center gap-1.5"><Clock size={14}/> {new Date(save.date).toLocaleString()}</span>
                            <span>狀態: {save.data.phase === 'finished' ? '已完賽' : `進行至第 ${save.data.currentRoundNum} 輪`}</span>
                            <span>參賽: {save.data.players.length} 人</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                          <button onClick={() => setConfirmAction({ type: 'LOAD_SAVE', saveId: save.id })} 
                            className="flex-1 sm:flex-none px-6 py-2.5 font-black rounded-lg transition-colors tracking-widest uppercase brush-border"
                            style={{ backgroundColor: '#1e293b', color: COLORS.inkBlue, border: `1px solid ${COLORS.inkBlue}` }}>
                            讀取
                          </button>
                          <button onClick={() => setConfirmAction({ type: 'DELETE_SAVE', saveId: save.id })} className="p-2.5 rounded-lg transition-colors bg-red-900/20 text-red-400 hover:bg-red-900/40">
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 全局確認視窗 Modal (Highest Z-index) */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="rounded-2xl p-8 max-w-md w-full shadow-2xl transform transition-all border-2 brush-border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
            <div className="flex items-center gap-4 mb-6">
              <AlertTriangle size={32} style={{ color: COLORS.inkOrange }} />
              <h3 className="text-2xl font-black tracking-widest text-white">
                {confirmAction.type === 'EDIT_HISTORY' ? '修改歷史賽果' : confirmAction.type === 'REMATCH' ? '保留選手重賽' : confirmAction.type === 'FULL_RESET' ? '完全重設賽事' : confirmAction.type === 'LOAD_SAVE' ? '讀取賽事紀錄' : confirmAction.type === 'DELETE_SAVE' ? '刪除賽事紀錄' : confirmAction.type === 'GO_HOME' ? '回到首頁' : ''}
              </h3>
            </div>
            <p className="mb-8 font-bold leading-relaxed text-base" style={{ color: COLORS.textMuted }}>
              {confirmAction.type === 'EDIT_HISTORY' ? '修改之前的賽果將會作廢並重新計算後續的所有賽程，您確定要覆寫此筆成績嗎？' : confirmAction.type === 'REMATCH' ? '確定要保留現有的選手名單，清空所有戰績並重新開始報名階段嗎？' : confirmAction.type === 'FULL_RESET' ? '此動作將會清除所有選手名單與賽程資料，確定要返回初始狀態嗎？' : confirmAction.type === 'LOAD_SAVE' ? '確定要讀取這筆紀錄嗎？當前未儲存的進度將會完全遺失。' : confirmAction.type === 'DELETE_SAVE' ? '確定要永久刪除這筆存檔嗎？此動作無法復原。' : confirmAction.type === 'GO_HOME' ? '確定要回到首頁嗎？如果直接離開，當前未儲存的賽程將會遺失。' : ''}
            </p>
            
            {confirmAction.type === 'GO_HOME' ? (
              <div className="flex flex-col gap-3">
                <button onClick={() => {
                    const newSave = { id: crypto.randomUUID(), name: `(自動) 離開前存檔 - ${new Date().toLocaleString()}`, date: new Date().toISOString(), isAuto: true, data: { phase, players, rounds, currentRoundNum } };
                    setSaves(prev => [newSave, ...prev]);
                    confirmFullReset();
                  }} 
                  className="w-full py-3 rounded-lg font-black tracking-widest text-lg brush-border transition-all hover:scale-[1.02]" style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>
                  儲存並離開
                </button>
                <div className="flex justify-between gap-3 mt-2">
                  <button onClick={() => setConfirmAction(null)} className="flex-1 py-3 rounded-lg font-bold" style={{ backgroundColor: '#1e293b', color: COLORS.textMain }}>取消</button>
                  <button onClick={confirmFullReset} className="flex-1 py-3 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-lg font-bold">放棄並離開</button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-4">
                <button onClick={() => setConfirmAction(null)} className="px-6 py-2.5 rounded-lg font-bold" style={{ backgroundColor: '#1e293b', color: COLORS.textMain }}>取消</button>
                <button
                  onClick={() => {
                    if (confirmAction.type === 'EDIT_HISTORY') applyHistoricalEdit(confirmAction.roundIndex, confirmAction.matchId, confirmAction.p1Score, confirmAction.p2Score);
                    else if (confirmAction.type === 'REMATCH') confirmRematch();
                    else if (confirmAction.type === 'FULL_RESET') confirmFullReset();
                    else if (confirmAction.type === 'LOAD_SAVE') executeLoadSave(confirmAction.saveId);
                    else if (confirmAction.type === 'DELETE_SAVE') executeDeleteSave(confirmAction.saveId);
                  }}
                  className="px-6 py-2.5 rounded-lg font-black tracking-widest brush-border"
                  style={{ backgroundColor: confirmAction.type === 'DELETE_SAVE' ? '#ef4444' : COLORS.inkOrange, color: COLORS.bg }}>
                  確定執行
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto relative z-10 ink-splash-bg pt-16 md:pt-0 min-h-[90vh]">
        
        {/* Header - 水墨黑馬記念風格 */}
        <header className="mb-12 text-center space-y-4 pt-4">
          <div className="inline-flex items-center justify-center p-4 rounded-full border-2 border-dashed shadow-2xl brush-border"
               style={{ backgroundColor: COLORS.card, borderColor: COLORS.inkOrange, color: COLORS.inkOrange }}>
            <Swords size={48} strokeWidth={1.5} />
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-[0.2em] uppercase" style={{ color: COLORS.textMain, textShadow: `2px 2px 0px ${COLORS.inkBlue}` }}>
            黑馬<span style={{color: COLORS.inkOrange}}>記念</span>
          </h1>
          <p className="font-bold tracking-widest text-lg" style={{ color: COLORS.textMuted }}>
            瑞士制配對系統 • {MAX_ROUNDS} 輪對決 • 五評委判決
          </p>
        </header>

        {/* Phase 1: Registration */}
        {phase === 'registration' && (
          <div className="grid lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="lg:col-span-1 space-y-6">
              <div className="p-8 rounded-2xl border brush-border shadow-xl" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                <h2 className="text-xl font-black flex items-center gap-3 mb-6 tracking-widest" style={{ color: COLORS.inkBlue }}>
                  <UserPlus size={24} /> 新增選手
                </h2>
                <form onSubmit={handleAddPlayer} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold mb-2 tracking-widest" style={{ color: COLORS.textMuted }}>選手名稱 (NAME)</label>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border font-bold text-lg" placeholder="輸入名字..." />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2 tracking-widest" style={{ color: COLORS.textMuted }}>代表所屬 (CREW/SCHOOL)</label>
                    <select value={newSchool} onChange={(e) => setNewSchool(e.target.value)} className="w-full px-4 py-3 rounded-lg border font-bold text-lg">
                      {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="w-full font-black py-4 rounded-xl transition-all text-lg tracking-widest mt-4 brush-border"
                    style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg }}>
                    加入名單 ADD
                  </button>
                </form>

                <div className="mt-8 pt-8 border-t border-dashed" style={{ borderColor: COLORS.cardBorder }}>
                  <button onClick={loadMockData} className="w-full font-bold py-3 rounded-xl transition-colors text-sm tracking-widest border border-dashed"
                    style={{ backgroundColor: 'transparent', color: COLORS.inkBlue, borderColor: COLORS.inkBlue }}>
                    載入測試名單 (8人)
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="p-8 rounded-2xl border h-full brush-border shadow-xl" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <h2 className="text-xl font-black flex items-center gap-3 tracking-widest" style={{ color: COLORS.inkOrange }}>
                    <Users size={24} /> 參賽陣容 ({players.length})
                  </h2>
                  <button onClick={startTournament} disabled={players.length < 2}
                    className="flex items-center gap-2 px-8 py-3 rounded-xl font-black uppercase tracking-widest shadow-lg disabled:opacity-30 transition-all hover:scale-105 active:scale-95 brush-border"
                    style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>
                    <Play size={20} fill="currentColor" /> 開始抽籤
                  </button>
                </div>
                
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: COLORS.cardBorder }}>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-xs uppercase tracking-widest border-b" style={{ backgroundColor: '#111318', color: COLORS.textMuted, borderColor: COLORS.cardBorder }}>
                        <th className="p-4 font-black">#</th>
                        <th className="p-4 font-black">選手名 NAME</th>
                        <th className="p-4 font-black">所屬 CREW</th>
                        <th className="p-4 font-black text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.length === 0 ? (
                        <tr><td colSpan="4" className="p-10 text-center font-bold tracking-widest" style={{ color: COLORS.textMuted }}>尚無參賽者，請從左側新增。</td></tr>
                      ) : (
                        players.map((p, idx) => (
                          <tr key={p.id} className="border-b transition-colors hover:bg-white/5" style={{ borderColor: COLORS.cardBorder }}>
                            <td className="p-4 font-black" style={{ color: COLORS.textMuted }}>{idx + 1}</td>
                            <td className="p-4 font-black text-lg text-white">{p.name}</td>
                            <td className="p-4 font-bold">
                              <span className="px-3 py-1 rounded-md text-xs tracking-wider" style={{ backgroundColor: '#1a1f26', color: COLORS.inkBlue }}>{p.school}</span>
                            </td>
                            <td className="p-4 text-right">
                              <button onClick={() => removePlayer(p.id)} className="text-red-400 hover:text-red-300 font-bold text-sm tracking-widest">移除</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 2: Playing */}
        {phase === 'playing' && (
          <div className="flex flex-col gap-8">
            <div className="flex justify-center">
              <div className="inline-flex p-1.5 rounded-xl border border-dashed shadow-lg" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-black text-sm transition-all tracking-widest ${viewMode === 'list' ? 'bg-[#1e293b] text-white' : 'opacity-50 hover:opacity-100'}`}>
                  <LayoutList size={18} style={{ color: viewMode === 'list' ? COLORS.inkOrange : 'inherit' }} /> 對戰列表
                </button>
                <button onClick={() => setViewMode('tree')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-black text-sm transition-all tracking-widest ${viewMode === 'tree' ? 'bg-[#1e293b] text-white' : 'opacity-50 hover:opacity-100'}`}>
                  <Network size={18} style={{ color: viewMode === 'tree' ? COLORS.inkBlue : 'inherit' }} /> 賽況樹狀圖
                </button>
              </div>
            </div>

            <div className="grid xl:grid-cols-4 gap-8">
              
              {/* 左側主要賽程區塊 */}
              <div className="xl:col-span-3 space-y-8">
                {viewMode === 'list' && rounds.map((roundMatches, rIdx) => {
                  const isCurrentRound = (rIdx + 1 === currentRoundNum);
                  return (
                    <div key={rIdx} className={`p-8 rounded-3xl shadow-xl border-2 transition-all brush-border ${isCurrentRound ? 'ring-4 ring-offset-4 ring-offset-[#0d0f12]' : 'opacity-80'}`}
                         style={{ backgroundColor: COLORS.card, borderColor: isCurrentRound ? COLORS.inkBlue : COLORS.cardBorder, ringColor: COLORS.inkBlueDark }}>
                      <div className="flex justify-between items-center mb-8 border-b pb-4" style={{ borderColor: COLORS.cardBorder }}>
                        <h2 className="text-2xl font-black flex items-center gap-3 tracking-widest uppercase" style={{ color: isCurrentRound ? COLORS.inkBlue : COLORS.textMuted }}>
                          <Swords size={28} />
                          Round {rIdx + 1}
                          {rIdx === 0 && <span className="text-xs font-black px-3 py-1 rounded-md ml-3" style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg }}>同校迴避</span>}
                        </h2>
                      </div>
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {roundMatches.map((match) => {
                          const isFloat = !match.isByeMatch && (match.p1WinsSnapshot !== match.p2WinsSnapshot);
                          return (
                            <div key={match.id} className={`rounded-xl p-5 flex flex-col justify-between relative transition-all border-2 brush-border shadow-md`}
                                 style={{ backgroundColor: COLORS.bg, borderColor: isFloat ? COLORS.inkOrange : COLORS.cardBorder }}>
                              {match.isByeMatch && <div className="absolute top-0 right-0 text-[10px] font-black px-3 py-1 rounded-bl-lg z-10 bg-green-500 text-black">輪空勝</div>}
                              {isFloat && <div className="absolute top-0 left-0 w-full text-[10px] font-black py-1 text-center tracking-widest uppercase z-10" style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg }}>跨組對戰</div>}
                              
                              <div className={`flex justify-between items-center mb-4 ${isFloat ? 'mt-6' : ''}`}>
                                <div className="flex-1 text-center">
                                  <div className="font-black text-white" style={{
                                    fontSize: getDynamicFontSize(match.p1.name, false),
                                    wordBreak: 'break-word',
                                    lineHeight: 1.2
                                  }}>
                                    {match.p1.name}
                                  </div>
                                  <div className="text-xs font-bold mt-1" style={{ color: COLORS.textMuted }}>{match.p1.school}</div>
                                  {!match.p1.isBye && <div className="inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-black" style={{ backgroundColor: '#1e293b', color: COLORS.inkBlue }}>{match.p1WinsSnapshot}W {match.p1VotesSnapshot}票</div>}
                                </div>
                                <div className="px-2 font-black italic text-sm" style={{ color: isFloat ? COLORS.inkOrange : COLORS.inkBlue }}>VS</div>
                                <div className="flex-1 text-center">
                                  <div className="font-black text-white" style={{
                                    fontSize: getDynamicFontSize(match.p2.name, false),
                                    wordBreak: 'break-word',
                                    lineHeight: 1.2
                                  }}>
                                    {match.p2.name}
                                  </div>
                                  <div className="text-xs font-bold mt-1" style={{ color: COLORS.textMuted }}>{match.p2.school}</div>
                                  {!match.p2.isBye && <div className="inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-black" style={{ backgroundColor: '#1e293b', color: COLORS.inkBlue }}>{match.p2WinsSnapshot}W {match.p2VotesSnapshot}票</div>}
                                </div>
                              </div>

                              {match.isByeMatch ? (
                                <div className="text-center py-2 rounded-lg font-black text-xs border border-green-900 bg-green-900/20 text-green-400">自動判定：5 - 0</div>
                              ) : (
                                <div className="grid grid-cols-6 gap-1 mt-2">
                                  {[ {v1: 5, v2: 0}, {v1: 4, v2: 1}, {v1: 3, v2: 2}, {v1: 2, v2: 3}, {v1: 1, v2: 4}, {v1: 0, v2: 5} ].map((score) => {
                                    const isSelected = match.p1Votes === score.v1 && match.p2Votes === score.v2;
                                    return (
                                      <button key={`${score.v1}-${score.v2}`} onClick={() => handleMatchResult(rIdx, match.id, score.v1, score.v2)}
                                        className={`py-1.5 text-xs font-black rounded transition-all border ${
                                          isSelected ? `bg-[${COLORS.inkBlue}] text-black border-transparent shadow-[0_0_10px_rgba(182,210,212,0.5)]` : `bg-transparent border-slate-700 hover:border-[${COLORS.inkBlue}] text-slate-400 hover:text-[${COLORS.inkBlue}]`
                                        }`}
                                        style={isSelected ? { backgroundColor: isFloat ? COLORS.inkOrange : COLORS.inkBlue, color: COLORS.bg } : {}}>
                                        {score.v1}:{score.v2}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {isCurrentRound && (
                        <div className="mt-8 pt-6 border-t flex justify-end" style={{ borderColor: COLORS.cardBorder }}>
                          <button onClick={advanceToNextRound} disabled={!roundMatches.every(m => m.p1Votes !== null && m.p2Votes !== null)}
                            className="flex items-center gap-2 px-8 py-3 rounded-xl font-black uppercase tracking-widest transition-all disabled:opacity-30 brush-border"
                            style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>
                            {currentRoundNum === MAX_ROUNDS ? '結算賽事' : '下一輪'} <ChevronRight size={20} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 模式 2: 樹狀圖視圖 (Bracket View) - 黑馬記念網格版 */}
                {viewMode === 'tree' && renderBracket(false)}
              </div>

              {/* 右側：即時戰績排名 */}
              <div className="xl:col-span-1">
                <div className="p-6 rounded-3xl shadow-xl sticky top-6 border brush-border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                  <h3 className="text-xl font-black flex items-center gap-3 border-b pb-4 mb-4 tracking-widest" style={{ color: COLORS.inkOrange, borderColor: COLORS.cardBorder }}>
                    <Trophy size={24} /> 即時排名
                  </h3>
                  <div className="space-y-3">
                    {getRankedPlayers().map((p, idx) => (
                      <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${idx < 2 ? 'bg-[#1a1f26]' : 'hover:bg-white/5'}`}
                           style={{ borderColor: idx < 2 ? COLORS.inkOrange : COLORS.cardBorder }}>
                        <div className="flex items-center gap-4">
                          <div className={`w-6 text-center font-black text-xl ${idx < 2 ? '' : 'text-slate-600'}`}
                               style={idx < 2 ? { color: COLORS.inkOrange } : {}}>
                            {idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="font-black text-white text-base">{p.name}</div>
                              {idx < 2 && <span className="text-[10px] px-1.5 py-0.5 rounded font-black tracking-wider" style={{backgroundColor: COLORS.inkOrange, color: COLORS.bg}}>晉級</span>}
                            </div>
                            <div className="text-[10px] font-bold mt-0.5 tracking-wider" style={{ color: COLORS.textMuted }}>{p.school}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-base" style={{ color: idx < 2 ? COLORS.inkOrange : COLORS.inkBlue }}>{p.wins} W</div>
                          <div className="text-xs font-bold" style={{ color: COLORS.textMuted }}>{p.votes} pt</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3: Finished / Standings */}
        {phase === 'finished' && (
          <div className="space-y-12 max-w-7xl mx-auto flex flex-col items-center">
            
            {/* 最終排名區塊 */}
            <div className="w-full max-w-4xl p-10 md:p-14 rounded-3xl shadow-2xl text-center relative overflow-hidden border-2 brush-border"
                 style={{ backgroundColor: COLORS.card, borderColor: COLORS.inkOrange }}>
              <div className="absolute top-0 left-0 w-full h-3" style={{ background: `linear-gradient(90deg, ${COLORS.inkOrange}, ${COLORS.inkBlue})` }}></div>
              
              <Medal size={64} className="mx-auto mb-6" style={{ color: COLORS.inkOrange }} />
              <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-[0.2em] text-white">黑馬<span style={{color: COLORS.inkBlue}}>誕生</span></h2>
              <p className="font-bold tracking-widest mb-10 text-lg" style={{ color: COLORS.textMuted }}>全三輪瑞士制賽事・最終結果</p>

              <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: COLORS.cardBorder }}>
                <table className="w-full text-left border-collapse bg-black/40">
                  <thead>
                    <tr className="uppercase tracking-widest text-sm border-b" style={{ backgroundColor: '#111318', color: COLORS.textMuted, borderColor: COLORS.cardBorder }}>
                      <th className="p-5 font-black text-center">RANK</th>
                      <th className="p-5 font-black">NAME</th>
                      <th className="p-5 font-black">CREW</th>
                      <th className="p-5 font-black text-center">WINS</th>
                      <th className="p-5 font-black text-center">POINTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getRankedPlayers().map((p, idx) => (
                      <tr key={p.id} className={`border-b transition-colors ${idx < 2 ? 'bg-[#1a1f26]' : 'hover:bg-white/5'}`} style={{ borderColor: idx < 2 ? COLORS.inkOrange : COLORS.cardBorder }}>
                        <td className="p-5 text-center font-black text-2xl" style={{ color: idx < 2 ? COLORS.inkOrange : COLORS.textMuted }}>
                          {idx + 1}
                        </td>
                        <td className="p-5 font-black text-white text-xl">
                          <div className="flex items-center gap-3">
                            <span style={{ color: idx < 2 ? COLORS.inkOrange : 'white' }}>{p.name}</span>
                            {idx < 2 && <span className="text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-widest" style={{backgroundColor: COLORS.inkOrange, color: COLORS.bg}}>晉級</span>}
                          </div>
                        </td>
                        <td className="p-5 font-bold" style={{ color: COLORS.textMuted }}>{p.school}</td>
                        <td className="p-5 text-center font-black text-2xl" style={{ color: idx < 2 ? COLORS.inkOrange : COLORS.inkBlue }}>{p.wins}</td>
                        <td className="p-5 text-center font-black text-lg" style={{ color: COLORS.textMuted }}>{p.votes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-12 flex flex-col sm:flex-row justify-center gap-6">
                 <button onClick={() => setConfirmAction({ type: 'REMATCH' })}
                  className="flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-black text-lg tracking-widest transition-all brush-border border-2"
                  style={{ backgroundColor: 'transparent', color: COLORS.inkOrange, borderColor: COLORS.inkOrange }}>
                  <RotateCcw size={22} /> 保留名單重賽
                </button>
                <button onClick={() => setConfirmAction({ type: 'FULL_RESET' })}
                  className="flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-black text-lg tracking-widest transition-all brush-border border"
                  style={{ backgroundColor: COLORS.bg, color: COLORS.textMuted, borderColor: COLORS.cardBorder }}>
                  <Users size={22} /> 全新開賽
                </button>
              </div>
            </div>

            {/* 最終完整賽況樹狀圖 */}
            <div className="w-full mt-10">
              <div className="text-center mb-8">
                <h3 className="text-3xl font-black tracking-widest text-white inline-block border-b-4 pb-2" style={{ borderColor: COLORS.inkBlue }}>
                  完整賽況回顧
                </h3>
              </div>
              <div className="bg-black/30 p-6 md:p-10 rounded-3xl border border-dashed brush-border" style={{ borderColor: COLORS.cardBorder }}>
                {renderBracket(true)}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}