import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Users, Swords, UserPlus, Play, RotateCcw, Medal, ChevronRight, AlertTriangle, LayoutList, Network, Archive, Trash2, Save, X, Clock, Home, Edit3, Check, Upload } from 'lucide-react';
import { pairSwissRound, rankPlayers, recalculatePlayerRecords, updateMatchScore } from './tournament';
import PublicTournamentPage from './PublicTournamentPage';
import { describeAuditLog, formatAuditTime, getAuditActionLabel } from './audit';
import { isFirebaseConfigured } from './firebase';
import {
  createCloudTournament,
  generateEventCode,
  normalizeEventCode,
  saveCloudTournament,
  signInAdminWithToken,
  signOutAdmin,
  subscribeAdminTournaments,
  subscribeAuth,
  subscribeTournamentAuditLogs,
  subscribeTournament,
  validateEventCode
} from './services/tournamentRepository';

const MAX_ROUNDS = 3;
const SUPPORTED_JUDGE_COUNTS = [3, 5];
const DEFAULT_JUDGE_COUNT = 5;
const ACTIVE_STORAGE_KEYS = {
  phase: 'swiss_tournament_phase',
  players: 'swiss_tournament_players',
  rounds: 'swiss_tournament_rounds',
  currentRoundNum: 'swiss_tournament_currentRoundNum',
  judgeCount: 'swiss_tournament_judgeCount'
};
const SAVES_STORAGE_KEY = 'swiss_tourney_saves_v4';
const LEGACY_SAVES_STORAGE_KEY = 'swiss_tourney_saves_v3';

const createId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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

// Helper: 從 localStorage 安全地讀取並解析 JSON
const getLocalStorageItem = (key, defaultValue) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error parsing localStorage key "${key}":`, error);
    return defaultValue;
  }
};

const normalizeJudgeCount = (value, fallback = DEFAULT_JUDGE_COUNT) =>
  SUPPORTED_JUDGE_COUNTS.includes(Number(value)) ? Number(value) : fallback;

const inferJudgeCount = (rounds, fallback = DEFAULT_JUDGE_COUNT) => {
  const completedMatch = rounds
    ?.flat()
    .find(match => Number.isFinite(match?.p1Votes) && Number.isFinite(match?.p2Votes));
  const scoreTotal = completedMatch ? completedMatch.p1Votes + completedMatch.p2Votes : fallback;
  return normalizeJudgeCount(scoreTotal, fallback);
};

// Phase 1 資料遷移：保留賽事資料，但從選手模型移除舊版 school 欄位。
const normalizePlayer = (player = {}) => ({
  id: player.id || createId(),
  name: String(player.name || '').trim(),
  wins: Number(player.wins) || 0,
  votes: Number(player.votes) || 0,
  isWithdrawn: Boolean(player.isWithdrawn),
  ...(player.isMC ? { isMC: true } : {})
});

const normalizeRounds = (rounds = []) => rounds.map(round => round.map(match => ({
  ...match,
  p1: normalizePlayer(match.p1),
  p2: normalizePlayer(match.p2)
})));

const normalizeTournamentData = (data = {}) => {
  const rounds = normalizeRounds(Array.isArray(data.rounds) ? data.rounds : []);
  return {
    phase: ['registration', 'playing', 'finished'].includes(data.phase) ? data.phase : 'registration',
    players: (Array.isArray(data.players) ? data.players : []).map(normalizePlayer).filter(player => player.name),
    rounds,
    currentRoundNum: Math.max(1, Number(data.currentRoundNum) || 1),
    judgeCount: normalizeJudgeCount(data.judgeCount, inferJudgeCount(rounds))
  };
};

const loadActiveTournament = () => normalizeTournamentData({
  phase: getLocalStorageItem(ACTIVE_STORAGE_KEYS.phase, 'registration'),
  players: getLocalStorageItem(ACTIVE_STORAGE_KEYS.players, []),
  rounds: getLocalStorageItem(ACTIVE_STORAGE_KEYS.rounds, []),
  currentRoundNum: getLocalStorageItem(ACTIVE_STORAGE_KEYS.currentRoundNum, 1),
  judgeCount: getLocalStorageItem(ACTIVE_STORAGE_KEYS.judgeCount, undefined)
});

const normalizeSave = (save = {}) => ({
  ...save,
  id: save.id || createId(),
  name: String(save.name || '未命名賽事紀錄'),
  date: save.date || new Date().toISOString(),
  data: normalizeTournamentData(save.data)
});

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

function TournamentAdminApp() {
  const [initialTournament] = useState(loadActiveTournament);
  const [phase, setPhase] = useState(initialTournament.phase); // 'registration', 'playing', 'finished'
  const [players, setPlayers] = useState(initialTournament.players);
  const [rounds, setRounds] = useState(initialTournament.rounds);
  const [currentRoundNum, setCurrentRoundNum] = useState(initialTournament.currentRoundNum);
  const [judgeCount, setJudgeCount] = useState(initialTournament.judgeCount);
  const [viewMode, setViewMode] = useState('tree'); // 預設改為樹狀圖

  // Modal 視窗狀態
  const [confirmAction, setConfirmAction] = useState(null);

  // 存檔管理狀態
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [saves, setSaves] = useState(() => {
    try {
      const current = localStorage.getItem(SAVES_STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_SAVES_STORAGE_KEY);
      const parsed = JSON.parse(current || legacy || '[]');
      return Array.isArray(parsed) ? parsed.map(normalizeSave) : [];
    } catch {
      return [];
    }
  });
  
  // 編輯存檔名稱狀態
  const [editingSaveId, setEditingSaveId] = useState(null);
  const [editingSaveName, setEditingSaveName] = useState('');

  // 新增參賽者狀態
  const [newName, setNewName] = useState('');

  // Firebase 雲端後台狀態
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [adminToken, setAdminToken] = useState('');
  const [cloudTournaments, setCloudTournaments] = useState([]);
  const [cloudAuditLogs, setCloudAuditLogs] = useState([]);
  const [activeCloudCode, setActiveCloudCode] = useState('');
  const [activeCloudName, setActiveCloudName] = useState('');
  const [cloudIsPublic, setCloudIsPublic] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState('local');
  const [cloudError, setCloudError] = useState('');
  const [newCloudName, setNewCloudName] = useState('');
  const [newCloudCode, setNewCloudCode] = useState(() => generateEventCode());
  const [publicLookupCode, setPublicLookupCode] = useState('');
  const [isPublicLookupOpen, setIsPublicLookupOpen] = useState(false);
  const cloudReadyRef = useRef(false);
  const lastCloudStateRef = useRef(null);
  const pendingAuditRef = useRef(null);

  const markCloudAudit = (action, details = {}) => {
    pendingAuditRef.current = { action, details };
  };

  useEffect(() => subscribeAuth(setAdminUser), []);

  useEffect(() => {
    if (!isFirebaseConfigured || !adminUser) {
      setCloudTournaments([]);
      return undefined;
    }
    return subscribeAdminTournaments(setCloudTournaments, error => setCloudError(error.message));
  }, [adminUser]);

  useEffect(() => {
    if (!isFirebaseConfigured || !adminUser || !activeCloudCode) {
      cloudReadyRef.current = false;
      return undefined;
    }
    cloudReadyRef.current = false;
    lastCloudStateRef.current = null;
    setCloudSyncStatus('loading');
    return subscribeTournament(activeCloudCode, data => {
      if (!data) {
        setCloudError('找不到指定的雲端賽事。');
        setCloudSyncStatus('error');
        return;
      }
      const normalized = normalizeTournamentData(data);
      lastCloudStateRef.current = JSON.stringify(normalized);
      cloudReadyRef.current = true;
      setPhase(normalized.phase);
      setPlayers(normalized.players);
      setRounds(normalized.rounds);
      setCurrentRoundNum(normalized.currentRoundNum);
      setJudgeCount(normalized.judgeCount);
      setActiveCloudName(data.name || activeCloudCode);
      setCloudIsPublic(Boolean(data.isPublic));
      setCloudSyncStatus(data.sync?.hasPendingWrites ? 'pending' : data.sync?.fromCache ? 'offline' : 'synced');
      setCloudError('');
    }, error => {
      setCloudError(error.message);
      setCloudSyncStatus('error');
    });
  }, [adminUser, activeCloudCode]);

  useEffect(() => {
    if (!isFirebaseConfigured || !adminUser || !activeCloudCode) {
      setCloudAuditLogs([]);
      return undefined;
    }
    return subscribeTournamentAuditLogs(
      activeCloudCode,
      setCloudAuditLogs,
      error => setCloudError(error.message)
    );
  }, [adminUser, activeCloudCode]);

  useEffect(() => {
    if (!adminUser || !activeCloudCode || !cloudReadyRef.current) return undefined;
    const cloudState = { phase, players, rounds, currentRoundNum, judgeCount };
    const serialized = JSON.stringify(cloudState);
    if (serialized === lastCloudStateRef.current) return undefined;

    setCloudSyncStatus('pending');
    const timeout = window.setTimeout(async () => {
      const audit = pendingAuditRef.current || {
        action: 'TOURNAMENT_STATE_UPDATED',
        details: { phase, currentRoundNum }
      };
      pendingAuditRef.current = null;
      lastCloudStateRef.current = serialized;
      try {
        await saveCloudTournament(activeCloudCode, cloudState, audit);
      } catch (error) {
        lastCloudStateRef.current = null;
        setCloudError(error.message);
        setCloudSyncStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [adminUser, activeCloudCode, phase, players, rounds, currentRoundNum, judgeCount]);

  // 自動同步存檔到 LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(SAVES_STORAGE_KEY, JSON.stringify(saves));
    } catch (e) {
      console.error("存檔寫入失敗", e);
    }
  }, [saves]);

  // 自動儲存當前賽事進度到 LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STORAGE_KEYS.phase, JSON.stringify(phase));
      localStorage.setItem(ACTIVE_STORAGE_KEYS.players, JSON.stringify(players));
      localStorage.setItem(ACTIVE_STORAGE_KEYS.rounds, JSON.stringify(rounds));
      localStorage.setItem(ACTIVE_STORAGE_KEYS.currentRoundNum, JSON.stringify(currentRoundNum));
      localStorage.setItem(ACTIVE_STORAGE_KEYS.judgeCount, JSON.stringify(judgeCount));
    } catch (error) {
      console.error("Error saving current game state to localStorage:", error);
    }
  }, [phase, players, rounds, currentRoundNum, judgeCount]);

  const scoreOptions = Array.from({ length: judgeCount + 1 }, (_, p2Votes) => ({
    v1: judgeCount - p2Votes,
    v2: p2Votes
  }));

  const handleCloudLogin = async (event) => {
    event.preventDefault();
    setCloudError('');
    try {
      const user = await signInAdminWithToken(adminToken);
      setAdminUser(user);
      setAdminToken('');
    } catch {
      setCloudError('登入失敗，請確認管理 token 與 Firebase 設定。');
    }
  };

  const handleCreateCloudTournament = async () => {
    setCloudError('');
    try {
      const code = await createCloudTournament({
        eventCode: newCloudCode,
        name: newCloudName,
        tournament: { phase, players, rounds, currentRoundNum, judgeCount }
      });
      cloudReadyRef.current = false;
      lastCloudStateRef.current = null;
      setActiveCloudCode(code);
      setNewCloudCode(generateEventCode());
      setNewCloudName('');
    } catch (error) {
      setCloudError(error.message);
    }
  };

  const handleToggleCloudVisibility = async () => {
    const nextValue = !cloudIsPublic;
    setCloudError('');
    try {
      await saveCloudTournament(activeCloudCode, { isPublic: nextValue }, {
        action: 'PUBLIC_VISIBILITY_CHANGED',
        details: { before: cloudIsPublic, after: nextValue }
      });
      setCloudIsPublic(nextValue);
    } catch (error) {
      setCloudError(error.message);
    }
  };

  const openPublicTournament = (code) => {
    const normalized = normalizeEventCode(code);
    if (!validateEventCode(normalized)) {
      setCloudError('賽事代碼需為 4–10 位英文字母或數字。');
      return;
    }
    window.open(`${window.location.pathname}?event=${normalized}`, '_blank', 'noopener,noreferrer');
  };

  const handleAddPlayer = (e) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName || players.some(p => p.name === trimmedName)) return; // 避免重複名稱
    const newPlayer = { id: createId(), name: trimmedName, wins: 0, votes: 0, isWithdrawn: false };
    markCloudAudit('PLAYER_ADDED', { playerId: newPlayer.id, name: newPlayer.name });
    setPlayers(prev => [...prev, newPlayer]);
    setNewName('');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const newPlayers = [];
      
      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        
        const parts = trimmedLine.split(',');
        if (parts.length >= 1) {
          // 如果第一行看起來像標題，跳過不匯入
          if (index === 0 && (parts[0].toLowerCase().includes('name') || parts[0].includes('姓名') || parts[0].includes('名稱') || parts[0].includes('選手'))) return;
          
          const name = parts[0].trim();
          if (name && !players.some(p => p.name === name) && !newPlayers.some(p => p.name === name)) { // 避免重複名稱
            newPlayers.push({ id: createId(), name, wins: 0, votes: 0, isWithdrawn: false });
          }
        }
      });
      
      if (newPlayers.length > 0) {
        markCloudAudit('PLAYERS_IMPORTED', { count: newPlayers.length, names: newPlayers.map(player => player.name) });
        setPlayers(prev => [...prev, ...newPlayers]);
      }
      e.target.value = null; // 重置 input 讓下次可以選同一個檔案
    };
    reader.readAsText(file);
  };

  const loadMockData = () => {
    const mockPlayers = [
      ...Array.from({ length: 8 }, (_, index) => ({
        id: createId(), name: `player-${String(index + 1).padStart(3, '0')}`, wins: 0, votes: 0, isWithdrawn: false
      }))
    ];
    markCloudAudit('TEST_PLAYERS_LOADED', { count: mockPlayers.length });
    setPlayers(mockPlayers);
  };

  const removePlayer = (id) => {
    const target = players.find(player => player.id === id);
    markCloudAudit('PLAYER_REMOVED', { playerId: id, name: target?.name });
    setPlayers(players.filter(p => p.id !== id));
  };

  // --- 存檔管理功能 ---
  const handleCreateSave = () => {
    const name = saveNameInput.trim() || `手動存檔 - ${new Date().toLocaleString()}`;
    const newSave = { id: createId(), name, date: new Date().toISOString(), isAuto: false, data: { phase, players, rounds, currentRoundNum, judgeCount } };
    setSaves([newSave, ...saves]);
    setSaveNameInput('');
  };

  const executeLoadSave = (saveId) => {
    const targetSave = saves.find(s => s.id === saveId);
    if (targetSave) {
      const data = normalizeTournamentData(targetSave.data);
      markCloudAudit('LOCAL_SAVE_LOADED', { saveId, saveName: targetSave.name });
      setPhase(data.phase);
      setPlayers(data.players);
      setRounds(data.rounds);
      setCurrentRoundNum(data.currentRoundNum);
      setJudgeCount(data.judgeCount);
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
    markCloudAudit('TOURNAMENT_STARTED', { playerCount: players.filter(player => !player.isWithdrawn).length, judgeCount });
    setPhase('playing');
    generateRound(1, players.filter(p => !p.isWithdrawn)); // 第一輪只配對未棄賽選手
  };

  const generateRound = (roundNum, currentPlayers) => {
    const newMatches = pairSwissRound({ players: currentPlayers, rounds, roundNum });
    setRounds(prev => [...prev, newMatches]);
    setPlayers([...currentPlayers]);
  };

  const applyHistoricalEdit = (roundIndex, matchId, p1Score, p2Score) => {
    const previousMatch = rounds[roundIndex]?.find(match => match.id === matchId);
    markCloudAudit('HISTORICAL_SCORE_UPDATED', {
      round: roundIndex + 1,
      matchId,
      before: previousMatch ? { p1Votes: previousMatch.p1Votes, p2Votes: previousMatch.p2Votes } : null,
      after: { p1Votes: p1Score, p2Votes: p2Score }
    });
    const truncatedRounds = rounds.slice(0, roundIndex + 1);
    const newRounds = updateMatchScore(truncatedRounds, roundIndex, matchId, p1Score, p2Score);
    const updatedPlayers = recalculatePlayerRecords(players, newRounds);

    setRounds(newRounds); setPlayers(updatedPlayers); setCurrentRoundNum(roundIndex + 1);
    setPhase('playing'); setConfirmAction(null);
  };

  const handleMatchResult = (roundIndex, matchId, p1Score, p2Score) => {
    if (roundIndex < currentRoundNum - 1) {
      setConfirmAction({ type: 'EDIT_HISTORY', roundIndex, matchId, p1Score, p2Score });
      return;
    }
    const match = rounds[roundIndex]?.find(item => item.id === matchId);
    if (!match) return;
    if (match.p1Votes === p1Score && match.p2Votes === p2Score) return;
    markCloudAudit('SCORE_UPDATED', {
      round: roundIndex + 1,
      matchId,
      players: [match.p1.name, match.p2.name],
      before: { p1Votes: match.p1Votes, p2Votes: match.p2Votes },
      after: { p1Votes: p1Score, p2Votes: p2Score }
    });
    const updatedRounds = updateMatchScore(rounds, roundIndex, matchId, p1Score, p2Score);
    const updatedPlayers = recalculatePlayerRecords(players, updatedRounds);
    setRounds(updatedRounds); setPlayers(updatedPlayers);
  };

  const advanceToNextRound = () => {
    if (currentRoundNum < MAX_ROUNDS) {
      const nextRoundNum = currentRoundNum + 1;
      markCloudAudit('ROUND_ADVANCED', { from: currentRoundNum, to: nextRoundNum });
      setCurrentRoundNum(nextRoundNum);
      generateRound(nextRoundNum, players);
    } else {
      markCloudAudit('TOURNAMENT_FINISHED', { round: currentRoundNum });
      setPhase('finished');
      const newSave = { id: createId(), name: `(自動紀錄) 完賽 - ${new Date().toLocaleString()}`, date: new Date().toISOString(), isAuto: true, data: { phase: 'finished', players, rounds, currentRoundNum, judgeCount } };
      setSaves(prev => [newSave, ...prev]);
    }
  };

  const confirmFullReset = () => { markCloudAudit('TOURNAMENT_RESET', { keptPlayers: false }); setPlayers([]); setRounds([]); setCurrentRoundNum(1); setPhase('registration'); setJudgeCount(DEFAULT_JUDGE_COUNT); setConfirmAction(null); };
  const confirmRematch = () => {
    markCloudAudit('TOURNAMENT_RESET', { keptPlayers: true });
    const resetPlayers = players.map(p => ({ ...p, wins: 0, votes: 0, isWithdrawn: false }));
    setPlayers(resetPlayers); setRounds([]); setCurrentRoundNum(1); setPhase('registration'); setConfirmAction(null);
  };

  const confirmWithdraw = (playerId) => {
    const withdrawingPlayer = players.find(player => player.id === playerId);
    markCloudAudit('PLAYER_WITHDRAWN', { playerId, name: withdrawingPlayer?.name, round: currentRoundNum });
    let updatedPlayers = players.map(p => p.id === playerId ? { ...p, isWithdrawn: true } : { ...p });
    let updatedRounds = rounds;
    const roundIndex = currentRoundNum - 1;
    const unplayedMatch = rounds[roundIndex]?.find(match =>
      (match.p1.id === playerId || match.p2.id === playerId) &&
      (match.p1Votes === null || match.p2Votes === null)
    );
    if (unplayedMatch) {
      const p1Score = unplayedMatch.p1.id === playerId ? 0 : judgeCount;
      const p2Score = unplayedMatch.p2.id === playerId ? 0 : judgeCount;
      updatedRounds = updateMatchScore(rounds, roundIndex, unplayedMatch.id, p1Score, p2Score);
      updatedPlayers = recalculatePlayerRecords(updatedPlayers, updatedRounds);
    }
    setPlayers(updatedPlayers);
    setRounds(updatedRounds);
    setConfirmAction(null);
  };

  // 並列計算功能
  const getRankedPlayersWithTies = () => rankPlayers(players, rounds);

  // --- 繪製樹狀圖共用函數 (用於進行中與結算畫面) ---
  const renderBracket = (isReadOnly = false) => (
    <div className="w-full">
      {/* 加入 items-center 以達成垂直置中 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10 p-2 items-center">
        {rounds.map((roundMatches, rIdx) => {
          const groups = roundMatches.reduce((acc, match) => {
            const w1 = match.p1WinsSnapshot || 0; const w2 = match.p2WinsSnapshot || 0;
            const isFloat = !match.isMCMatch && (w1 !== w2);
            const effectiveW2 = match.isMCMatch ? w1 : w2;
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
                                  {!match.p1.isMC && (
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
                                  {!match.p2.isMC && (
                                    <div className="text-[11px] font-bold mt-1 opacity-70 whitespace-nowrap" style={{ color: accentColor }}>
                                      {match.p2WinsSnapshot}W {match.p2VotesSnapshot}票
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 比分輸入按鈕區塊 (唯讀模式下不顯示) */}
                              {!isReadOnly && ( // 允許 MC 對戰手動輸入比分
                                  <div className={`grid ${judgeCount === 3 ? 'grid-cols-4' : 'grid-cols-6'} gap-1 mt-3 border-t border-slate-800 pt-3`}>
                                    {scoreOptions.map((score) => {
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
        <button onClick={() => {
          if (activeCloudCode) {
            cloudReadyRef.current = false;
            lastCloudStateRef.current = null;
            setActiveCloudCode('');
            setActiveCloudName('');
            setCloudSyncStatus('local');
            return;
          }
          if (phase === 'registration' && players.length === 0) return;
          setConfirmAction({ type: 'GO_HOME' });
        }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-bold brush-border border"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder, color: COLORS.textMain }}>
          <Home size={18} style={{color: COLORS.inkOrange}} /> {activeCloudCode ? '離開雲端賽事' : '回首頁'}
        </button>
      </div>

      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex flex-wrap justify-end gap-2 z-30 max-w-[75%]">
        <button onClick={() => setIsPublicLookupOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg transition-all text-sm font-black tracking-widest brush-border border"
          style={{ backgroundColor: COLORS.card, color: COLORS.inkOrange, borderColor: COLORS.inkOrange }}>
          <Network size={18} /> 公開查詢
        </button>
        {isFirebaseConfigured && <button onClick={() => setIsCloudModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg transition-all text-sm font-black tracking-widest brush-border border"
          style={{ backgroundColor: activeCloudCode ? COLORS.inkOrange : COLORS.card, color: activeCloudCode ? COLORS.bg : COLORS.inkBlue, borderColor: COLORS.inkBlue }}>
          <Archive size={18} /> {activeCloudCode || '雲端後台'}
        </button>}
        <button onClick={() => setIsSaveModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg transition-all text-sm font-black tracking-widest uppercase brush-border"
          style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>
          <Archive size={18} /> 賽事檔案庫
        </button>
      </div>

      {/* Public lookup modal */}
      {isPublicLookupOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-md p-7 border-2 brush-border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-white">公開賽事查詢</h2>
              <button onClick={() => setIsPublicLookupOpen(false)} aria-label="關閉公開查詢"><X size={24} /></button>
            </div>
            <label htmlFor="lookup-code" className="block text-sm font-bold mb-2" style={{ color: COLORS.textMuted }}>賽事代碼</label>
            <input id="lookup-code" value={publicLookupCode} onChange={event => setPublicLookupCode(event.target.value.toUpperCase())}
              placeholder="例如 BH2026" className="w-full px-4 py-3 rounded-lg border font-black uppercase" />
            <button onClick={() => openPublicTournament(publicLookupCode)} className="w-full mt-4 py-3 rounded-lg font-black" style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>開啟公開頁面</button>
            {!isFirebaseConfigured && <p className="mt-4 text-xs font-bold text-amber-300">目前部署尚未設定 Firebase，公開頁會顯示設定提示。</p>}
          </div>
        </div>
      )}

      {/* Cloud admin modal */}
      {isCloudModalOpen && isFirebaseConfigured && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[88vh] border-2 brush-border" style={{ backgroundColor: COLORS.bg, borderColor: COLORS.cardBorder }}>
            <div className="flex justify-between items-center p-5 border-b" style={{ borderColor: COLORS.cardBorder, backgroundColor: COLORS.card }}>
              <div>
                <h2 className="text-xl font-black text-white">Firebase 雲端後台</h2>
                <p className="text-xs font-bold mt-1" style={{ color: COLORS.textMuted }}>即時同步・離線快取・操作稽核</p>
              </div>
              <button onClick={() => setIsCloudModalOpen(false)} aria-label="關閉雲端後台"><X size={28} /></button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
              {cloudError && <div role="alert" className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-red-300 font-bold text-sm">{cloudError}</div>}

              {!adminUser ? (
                <form onSubmit={handleCloudLogin} className="max-w-md mx-auto py-8">
                  <label htmlFor="admin-token" className="block font-black mb-2">管理 token</label>
                  <input id="admin-token" type="password" value={adminToken} onChange={event => setAdminToken(event.target.value)}
                    autoComplete="current-password" className="w-full px-4 py-3 rounded-lg border" placeholder="輸入共用管理 token" />
                  <button type="submit" className="w-full mt-4 py-3 rounded-lg font-black" style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>登入後台</button>
                </form>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                    <div className="font-bold text-sm">管理員已登入</div>
                    <button onClick={async () => { await signOutAdmin(); setActiveCloudCode(''); cloudReadyRef.current = false; }} className="px-4 py-2 rounded-lg text-sm font-black text-red-300 border border-red-500/40">登出</button>
                  </div>

                  {activeCloudCode && (
                    <>
                      <section className="p-5 rounded-xl border-2" style={{ backgroundColor: '#131e24', borderColor: COLORS.inkBlue }}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <div className="text-xs font-black tracking-widest" style={{ color: COLORS.textMuted }}>目前雲端賽事</div>
                            <h3 className="text-xl font-black mt-1">{activeCloudName || activeCloudCode} <span style={{ color: COLORS.inkOrange }}>#{activeCloudCode}</span></h3>
                            <div className="text-xs font-bold mt-2" style={{ color: cloudSyncStatus === 'error' ? '#f87171' : COLORS.inkBlue }}>
                              {{ loading: '讀取中', pending: '同步中', offline: '離線快取・等待網路', synced: '已與雲端同步', error: '同步失敗', local: '本機模式' }[cloudSyncStatus]}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={handleToggleCloudVisibility} className="px-4 py-2 rounded-lg font-black border" style={{ borderColor: cloudIsPublic ? '#4ade80' : COLORS.inkOrange, color: cloudIsPublic ? '#4ade80' : COLORS.inkOrange }}>
                              {cloudIsPublic ? '已公開' : '未公開'}
                            </button>
                            <button onClick={() => openPublicTournament(activeCloudCode)} className="px-4 py-2 rounded-lg font-black" style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>查看公開頁</button>
                          </div>
                        </div>
                      </section>

                      <section className="p-5 rounded-xl border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <h3 className="font-black flex items-center gap-2"><Clock size={18} style={{ color: COLORS.inkOrange }} /> 最近操作紀錄</h3>
                          <span className="text-xs font-bold" style={{ color: COLORS.textMuted }}>最多顯示 50 筆</span>
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                          {cloudAuditLogs.map(audit => {
                            const description = describeAuditLog(audit);
                            return (
                              <div key={audit.id} className="p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2" style={{ backgroundColor: COLORS.bg, borderColor: COLORS.cardBorder }}>
                                <div>
                                  <div className="text-sm font-black text-white">{getAuditActionLabel(audit.action)}</div>
                                  {description && <div className="text-xs font-bold mt-1" style={{ color: COLORS.textMuted }}>{description}</div>}
                                </div>
                                <time className="text-[11px] font-bold whitespace-nowrap" style={{ color: COLORS.inkBlue }}>{formatAuditTime(audit)}</time>
                              </div>
                            );
                          })}
                          {cloudAuditLogs.length === 0 && <div className="p-6 text-center text-sm font-bold border border-dashed rounded-lg" style={{ color: COLORS.textMuted, borderColor: COLORS.cardBorder }}>尚無操作紀錄</div>}
                        </div>
                      </section>
                    </>
                  )}

                  <section className="p-5 rounded-xl border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                    <h3 className="font-black mb-4">將目前進度建立為雲端賽事</h3>
                    <div className="grid sm:grid-cols-[1fr_10rem_auto] gap-3">
                      <input value={newCloudName} onChange={event => setNewCloudName(event.target.value)} placeholder="賽事名稱" className="px-4 py-3 rounded-lg border" />
                      <input value={newCloudCode} onChange={event => setNewCloudCode(normalizeEventCode(event.target.value))} aria-label="新賽事代碼" className="px-4 py-3 rounded-lg border font-black uppercase" />
                      <button onClick={handleCreateCloudTournament} className="px-5 py-3 rounded-lg font-black" style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg }}>建立</button>
                    </div>
                    <p className="text-xs mt-3" style={{ color: COLORS.textMuted }}>建立需要連線以確認代碼唯一；建立後的賽事預設不公開。</p>
                  </section>

                  <section>
                    <h3 className="font-black mb-3">既有雲端賽事 ({cloudTournaments.length})</h3>
                    <div className="space-y-3">
                      {cloudTournaments.map(tournament => (
                        <button key={tournament.id} onClick={() => { cloudReadyRef.current = false; lastCloudStateRef.current = null; setActiveCloudCode(tournament.id); }} className="w-full p-4 rounded-xl border text-left flex items-center justify-between gap-4 hover:bg-white/5" style={{ borderColor: tournament.id === activeCloudCode ? COLORS.inkBlue : COLORS.cardBorder }}>
                          <div>
                            <div className="font-black text-white">{tournament.name || tournament.id}</div>
                            <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>#{tournament.id}・{tournament.phase === 'finished' ? '已完賽' : `第 ${tournament.currentRoundNum || 1} 輪`}</div>
                          </div>
                          <span className="text-xs font-black" style={{ color: tournament.isPublic ? '#4ade80' : COLORS.textMuted }}>{tournament.isPublic ? '公開' : '關閉'}</span>
                        </button>
                      ))}
                      {cloudTournaments.length === 0 && <div className="p-8 text-center border border-dashed rounded-xl" style={{ borderColor: COLORS.cardBorder, color: COLORS.textMuted }}>尚無雲端賽事</div>}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
                            <span>評審: {save.data.judgeCount} 位</span>
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
                {confirmAction.type === 'EDIT_HISTORY' ? '修改歷史賽果' : confirmAction.type === 'REMATCH' ? '保留選手重賽' : confirmAction.type === 'FULL_RESET' ? '完全重設賽事' : confirmAction.type === 'LOAD_SAVE' ? '讀取賽事紀錄' : confirmAction.type === 'DELETE_SAVE' ? '刪除賽事紀錄' : confirmAction.type === 'GO_HOME' ? '回到首頁' : confirmAction.type === 'CLEAR_PLAYERS' ? '清空選手名單' : confirmAction.type === 'WITHDRAW' ? `確定要讓 ${confirmAction.playerName} 棄賽嗎？` : ''}
              </h3>
            </div>
            <p className="mb-8 font-bold leading-relaxed text-base" style={{ color: COLORS.textMuted }}>
              {confirmAction.type === 'EDIT_HISTORY' ? '修改之前的賽果將會作廢並重新計算後續的所有賽程，您確定要覆寫此筆成績嗎？' : confirmAction.type === 'REMATCH' ? '確定要保留現有的選手名單，清空所有戰績並重新開始報名階段嗎？' : confirmAction.type === 'FULL_RESET' ? '此動作將會清除所有選手名單與賽程資料，確定要返回初始狀態嗎？' : confirmAction.type === 'LOAD_SAVE' ? '確定要讀取這筆紀錄嗎？當前未儲存的進度將會完全遺失。' : confirmAction.type === 'DELETE_SAVE' ? '確定要永久刪除這筆存檔嗎？此動作無法復原。' : confirmAction.type === 'GO_HOME' ? '確定要回到首頁嗎？如果直接離開，當前未儲存的賽程將會遺失。' : confirmAction.type === 'CLEAR_PLAYERS' ? '確定要清除所有已加入的選手嗎？此動作無法復原。' : confirmAction.type === 'WITHDRAW' ? `棄賽前已完成的成績會保留；本輪未完成的對戰將直接判為 0:${judgeCount} 敗，且退出後續輪次。` : ''}
            </p>
            
            {confirmAction.type === 'GO_HOME' ? (
              <div className="flex flex-col gap-3">
                <button onClick={() => {
                    const newSave = { id: createId(), name: `(自動) 離開前存檔 - ${new Date().toLocaleString()}`, date: new Date().toISOString(), isAuto: true, data: { phase, players, rounds, currentRoundNum, judgeCount } };
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
                    else if (confirmAction.type === 'CLEAR_PLAYERS') { setPlayers([]); setConfirmAction(null); }
                    else if (confirmAction.type === 'WITHDRAW') confirmWithdraw(confirmAction.playerId);
                  }}
                  className="px-6 py-2.5 rounded-lg font-black tracking-widest brush-border"
                  style={{ backgroundColor: (confirmAction.type === 'DELETE_SAVE' || confirmAction.type === 'CLEAR_PLAYERS' || confirmAction.type === 'WITHDRAW') ? '#ef4444' : COLORS.inkOrange, color: COLORS.bg }}>
                  確定執行
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-full mx-auto relative z-10 ink-splash-bg pt-16 md:pt-0 min-h-[90vh] px-4">
        
        {/* Header - 水墨黑馬記念風格 */}
        <header className="mb-12 text-center space-y-4 pt-4">
          <h1 className="text-5xl md:text-6xl font-black tracking-[0.2em] uppercase" style={{ color: COLORS.textMain }}>
            黑馬<span style={{color: COLORS.inkOrange}}>記念</span>
          </h1>
          <p className="font-bold tracking-widest text-lg" style={{ color: COLORS.textMuted }}>
            挑戰組瑞士制配對系統
          </p>
          {activeCloudCode && <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border text-xs font-black tracking-widest" style={{ backgroundColor: COLORS.card, borderColor: COLORS.inkBlue, color: COLORS.inkBlue }}>
            雲端賽事 #{activeCloudCode}
            <span style={{ color: cloudSyncStatus === 'error' ? '#f87171' : cloudSyncStatus === 'offline' ? COLORS.inkOrange : '#4ade80' }}>
              {{ loading: '讀取中', pending: '同步中', offline: '離線', synced: '已同步', error: '同步失敗', local: '本機' }[cloudSyncStatus]}
            </span>
          </div>}
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
                  <button type="submit" className="w-full font-black py-4 rounded-xl transition-all text-lg tracking-widest mt-4 brush-border"
                    style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg }}>
                    加入名單 ADD
                  </button>
                </form>

                <fieldset className="mt-8 pt-8 border-t border-dashed" style={{ borderColor: COLORS.cardBorder }}>
                  <legend className="block text-sm font-bold px-2 tracking-widest" style={{ color: COLORS.textMuted }}>單場評審人數</legend>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {SUPPORTED_JUDGE_COUNTS.map(count => (
                      <button key={count} type="button" onClick={() => { markCloudAudit('JUDGE_COUNT_CHANGED', { before: judgeCount, after: count }); setJudgeCount(count); }}
                        aria-pressed={judgeCount === count}
                        className="py-3 rounded-xl border font-black tracking-widest transition-all"
                        style={{
                          backgroundColor: judgeCount === count ? COLORS.inkBlue : 'transparent',
                          borderColor: judgeCount === count ? COLORS.inkBlue : COLORS.cardBorder,
                          color: judgeCount === count ? COLORS.bg : COLORS.textMuted
                        }}>
                        {count} 位評審
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-bold leading-relaxed" style={{ color: COLORS.textMuted }}>
                    每場比分合計固定為 {judgeCount} 票，賽事開始後不可變更。
                  </p>
                </fieldset>

                <div className="mt-8 pt-8 border-t border-dashed flex flex-col gap-3" style={{ borderColor: COLORS.cardBorder }}>
                  <label className="w-full font-bold py-3 rounded-xl transition-colors text-sm tracking-widest border border-dashed flex items-center justify-center gap-2 cursor-pointer hover:bg-white/5"
                    style={{ backgroundColor: 'transparent', color: COLORS.inkOrange, borderColor: COLORS.inkOrange }}>
                    <Upload size={18} />
                    匯入 CSV 選手名單
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  </label>
                  
                  <button onClick={loadMockData} className="w-full font-bold py-3 rounded-xl transition-colors text-sm tracking-widest border border-dashed hover:bg-white/5"
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
                  <div className="flex gap-3 w-full sm:w-auto">
                    {players.length > 0 && (
                      <button onClick={() => setConfirmAction({ type: 'CLEAR_PLAYERS' })}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all hover:bg-red-500/10 border border-dashed text-sm tracking-widest flex-1 sm:flex-none"
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}>
                        <Trash2 size={18} /> 清空名單
                      </button>
                    )}
                    <button onClick={startTournament} disabled={players.length < 2}
                      className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-black uppercase tracking-widest shadow-lg disabled:opacity-30 transition-all hover:scale-105 active:scale-95 brush-border flex-1 sm:flex-none"
                      style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>
                      <Play size={20} fill="currentColor" /> 開始抽籤
                    </button>
                  </div>
                </div>
                
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: COLORS.cardBorder }}>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-xs uppercase tracking-widest border-b" style={{ backgroundColor: '#111318', color: COLORS.textMuted, borderColor: COLORS.cardBorder }}>
                        <th className="p-4 font-black">#</th>
                        <th className="p-4 font-black">選手名 NAME</th>
                        <th className="p-4 font-black text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.length === 0 ? (
                        <tr><td colSpan="3" className="p-10 text-center font-bold tracking-widest" style={{ color: COLORS.textMuted }}>尚無參賽者，請從左側新增。</td></tr>
                      ) : (
                        players.map((p, idx) => (
                          <tr key={p.id} className="border-b transition-colors hover:bg-white/5" style={{ borderColor: COLORS.cardBorder }}>
                            <td className="p-4 font-black" style={{ color: COLORS.textMuted }}>{idx + 1}</td>
                            <td className="p-4 font-black text-lg text-white">{p.name}</td>
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
              <div className="inline-flex flex-wrap justify-center p-1.5 rounded-xl border border-dashed shadow-lg" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-black text-sm transition-all tracking-widest ${viewMode === 'list' ? 'bg-[#1e293b] text-white' : 'opacity-50 hover:opacity-100'}`}>
                  <LayoutList size={18} style={{ color: viewMode === 'list' ? COLORS.inkOrange : 'inherit' }} /> 對戰列表
                </button>
                <button onClick={() => setViewMode('tree')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-black text-sm transition-all tracking-widest ${viewMode === 'tree' ? 'bg-[#1e293b] text-white' : 'opacity-50 hover:opacity-100'}`}>
                  <Network size={18} style={{ color: viewMode === 'tree' ? COLORS.inkBlue : 'inherit' }} /> 賽況樹狀圖
                </button>
                <span className="flex items-center px-5 text-sm font-black tracking-widest" style={{ color: COLORS.inkOrange }}>{judgeCount} 位評審制</span>
              </div>
            </div>

            <div className="grid xl:grid-cols-4 gap-8">
              
              {/* 左側主要賽程區塊 */}
              <div className="xl:col-span-3 space-y-8"> {/* 佔 3/5 寬度 */}
                {viewMode === 'list' && rounds.map((roundMatches, rIdx) => {
                  const isCurrentRound = (rIdx + 1 === currentRoundNum);
                  return (
                    <div key={rIdx} className={`p-8 rounded-3xl shadow-xl border-2 transition-all brush-border ${isCurrentRound ? 'ring-4 ring-offset-4 ring-offset-[#0d0f12]' : 'opacity-80'}`}
                         style={{ backgroundColor: COLORS.card, borderColor: isCurrentRound ? COLORS.inkBlue : COLORS.cardBorder, ringColor: COLORS.inkBlueDark }}>
                      <div className="flex justify-between items-center mb-8 border-b pb-4" style={{ borderColor: COLORS.cardBorder }}>
                        <h2 className="text-2xl font-black flex items-center gap-3 tracking-widest uppercase" style={{ color: isCurrentRound ? COLORS.inkBlue : COLORS.textMuted }}>
                          <Swords size={28} />
                          Round {rIdx + 1}
                          {rIdx === 0 && <span className="text-xs font-black px-3 py-1 rounded-md ml-3" style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg }}>隨機配對</span>}
                        </h2>
                      </div>
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {roundMatches.map((match) => {
                          const isFloat = !match.isMCMatch && (match.p1WinsSnapshot !== match.p2WinsSnapshot);
                          return (
                            <div key={match.id} className={`rounded-xl p-5 flex flex-col justify-between relative transition-all border-2 brush-border shadow-md`}
                                 style={{ backgroundColor: COLORS.bg, borderColor: isFloat ? COLORS.inkOrange : COLORS.cardBorder }}>
                              {/* {match.isMCMatch && <div className="absolute top-0 right-0 text-[10px] font-black px-3 py-1 rounded-bl-lg z-10 bg-purple-500 text-white shadow-md border-l border-b border-purple-700">對戰魔王</div>} */}
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
                                  {!match.p1.isMC && <div className="inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-black" style={{ backgroundColor: '#1e293b', color: COLORS.inkBlue }}>{match.p1WinsSnapshot}W {match.p1VotesSnapshot}票</div>}
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
                                  {!match.p2.isMC && <div className="inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-black" style={{ backgroundColor: '#1e293b', color: COLORS.inkBlue }}>{match.p2WinsSnapshot}W {match.p2VotesSnapshot}票</div>}
                                </div>
                              </div>

                                <div className={`grid ${judgeCount === 3 ? 'grid-cols-4' : 'grid-cols-6'} gap-1 mt-2`}>
                                  {scoreOptions.map((score) => {
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
              <div className="xl:col-span-1"> {/* 佔 1/4 寬度 */}
                <div className="p-6 rounded-3xl shadow-xl sticky top-6 border brush-border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                  <h3 className="text-xl font-black flex items-center gap-3 border-b pb-4 mb-4 tracking-widest" style={{ color: COLORS.inkOrange, borderColor: COLORS.cardBorder }}>
                    <Trophy size={24} /> 即時排名
                  </h3>
                  <div className="space-y-3">
                    {getRankedPlayersWithTies().map((p) => (
                      <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${p.isWithdrawn ? 'opacity-40 bg-black/50' : (p.displayRank <= 2 ? 'bg-[#1a1f26]' : 'hover:bg-white/5')} gap-2`}
                           style={{ borderColor: p.displayRank <= 2 && !p.isWithdrawn ? COLORS.inkOrange : COLORS.cardBorder }}>
                        <div className="flex items-center gap-4">
                          <div className={`w-6 text-center font-black text-xl ${p.displayRank <= 2 && !p.isWithdrawn ? '' : 'text-slate-600'} whitespace-nowrap`}
                               style={p.displayRank <= 2 && !p.isWithdrawn ? { color: COLORS.inkOrange } : {}}>
                            {p.isWithdrawn ? '棄賽' : p.displayRank}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <div className="font-black text-white text-base flex items-center">
                                {p.name}
                                {p.isWithdrawn && <span className="text-sm text-red-400 ml-2 border border-red-500/30 px-1 rounded whitespace-nowrap">已棄賽</span>}
                              </div>
                              {!p.isWithdrawn && (p.needsTiebreaker || p.displayRank <= 2) && <span className="text-[10px] px-1.5 py-0.5 rounded font-black tracking-wider whitespace-nowrap" style={{backgroundColor: COLORS.inkOrange, color: COLORS.bg}}>{p.needsTiebreaker ? '需加賽' : '晉級'}</span>}
                            </div>
                            {!p.isWithdrawn && <div className="text-[10px] font-bold mt-1 whitespace-nowrap" style={{ color: COLORS.textMuted }}>
                              對手勝率 {(p.opponentWinRate * 100).toFixed(1)}% · 次級 {(p.opponentsOpponentWinRate * 100).toFixed(1)}%
                            </div>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-base whitespace-nowrap" style={{ color: p.displayRank <= 2 && !p.isWithdrawn ? COLORS.inkOrange : COLORS.inkBlue }}>{p.wins} W</div>
                          <div className="text-xs font-bold whitespace-nowrap" style={{ color: COLORS.textMuted }}>{p.votes} pt</div>
                        </div>
                        {!p.isWithdrawn && <button onClick={() => setConfirmAction({ type: 'WITHDRAW', playerId: p.id, playerName: p.name })} className="px-1.5 py-0.5 text-[10px] font-bold text-red-400 hover:bg-red-500/20 rounded border border-red-500/30 transition-colors shrink-0">棄賽</button>}
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
            <div className="w-full max-w-6xl p-10 md:p-14 rounded-3xl shadow-2xl text-center relative overflow-hidden border-2 brush-border"
                 style={{ backgroundColor: COLORS.card, borderColor: COLORS.inkOrange }}>
              <div className="absolute top-0 left-0 w-full h-3" style={{ background: `linear-gradient(90deg, ${COLORS.inkOrange}, ${COLORS.inkBlue})` }}></div>
              
              <Medal size={64} className="mx-auto mb-6" style={{ color: COLORS.inkOrange }} />
              <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-[0.2em] text-white">賽事<span style={{color: COLORS.inkBlue}}>結果</span></h2>
              <p className="font-bold tracking-widest mb-10 text-lg" style={{ color: COLORS.textMuted }}>挑戰組賽事・{judgeCount} 位評審制・最終結果</p>

              <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: COLORS.cardBorder }}>
                <table className="w-full text-left border-collapse bg-black/40">
                  <thead>
                    <tr className="uppercase tracking-widest text-sm border-b" style={{ backgroundColor: '#111318', color: COLORS.textMuted, borderColor: COLORS.cardBorder }}>
                      <th className="p-5 font-black text-center">RANK</th>
                      <th className="p-5 font-black">NAME</th>
                      <th className="p-5 font-black text-center whitespace-nowrap">WINS</th>
                      <th className="p-5 font-black text-center whitespace-nowrap">POINTS</th>
                      <th className="p-5 font-black text-center whitespace-nowrap">OPP WIN%</th>
                      <th className="p-5 font-black text-center whitespace-nowrap">OPP² WIN%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getRankedPlayersWithTies().map((p) => (
                      <tr key={p.id} className={`border-b transition-colors ${p.isWithdrawn ? 'opacity-40 bg-black/50' : (p.displayRank <= 2 ? 'bg-[#1a1f26]' : 'hover:bg-white/5')}`} style={{ borderColor: p.displayRank <= 2 && !p.isWithdrawn ? COLORS.inkOrange : COLORS.cardBorder }}>
                        <td className="p-5 text-center font-black text-2xl" style={{ color: p.displayRank <= 2 && !p.isWithdrawn ? COLORS.inkOrange : COLORS.textMuted }}>
                          {p.displayRank}
                        </td>
                        <td className="p-5 font-black text-white text-xl">
                          <div className="flex items-center gap-3">
                            <span style={{ color: p.displayRank <= 2 && !p.isWithdrawn ? COLORS.inkOrange : 'white' }}>{p.name} {p.isWithdrawn && <span className="text-sm text-red-400 ml-2 border border-red-500/30 px-1 rounded whitespace-nowrap">已棄賽</span>}</span>
                            {!p.isWithdrawn && (p.needsTiebreaker || p.displayRank <= 2) && <span className="text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-widest whitespace-nowrap" style={{backgroundColor: COLORS.inkOrange, color: COLORS.bg}}>{p.needsTiebreaker ? '需加賽' : '晉級'}</span>}
                          </div>
                        </td>
                        <td className="p-5 text-center font-black text-2xl whitespace-nowrap" style={{ color: p.displayRank <= 2 && !p.isWithdrawn ? COLORS.inkOrange : COLORS.inkBlue }}>{p.wins}</td>
                        <td className="p-5 text-center font-black text-lg whitespace-nowrap" style={{ color: COLORS.textMuted }}>{p.votes}</td>
                        <td className="p-5 text-center font-bold whitespace-nowrap" style={{ color: COLORS.textMuted }}>{p.isWithdrawn ? '—' : `${(p.opponentWinRate * 100).toFixed(1)}%`}</td>
                        <td className="p-5 text-center font-bold whitespace-nowrap" style={{ color: COLORS.textMuted }}>{p.isWithdrawn ? '—' : `${(p.opponentsOpponentWinRate * 100).toFixed(1)}%`}</td>
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

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const publicEventCode = params.get('event');
  if (publicEventCode) return <PublicTournamentPage initialCode={publicEventCode} />;
  return <TournamentAdminApp />;
}
