import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Trophy, Users, Swords, UserPlus, Play, Medal, ChevronRight, AlertTriangle, LayoutList, Network, Archive, Trash2, X, Clock, Home, Upload } from 'lucide-react';
import { applyDoubleElimination, pairSwissRound, rankPlayers, recalculatePlayerRecords, updateMatchScore } from './tournament';
import {
  createEmptyTournament,
  createId,
  DEFAULT_DOUBLE_ELIMINATION,
  DEFAULT_JUDGE_COUNT,
  MAX_PLAYERS,
  normalizePlayer,
  normalizeTournamentData,
  SUPPORTED_JUDGE_COUNTS
} from './tournamentState';
import PublicTournamentPage from './PublicTournamentPage';
import PublicSeriesPage from './PublicSeriesPage';
import { describeAuditLog, formatAuditTime, getAuditActionLabel } from './audit';
import { isFirebaseConfigured } from './firebase';
import { canLeaveWithoutTournamentWrite, runWithCloudRetry, shouldApplyCloudSnapshot, shouldShowCloudSyncAlert } from './cloudSync';
import FullScreenCloudManager from './FullScreenCloudManager';
import { buildSeriesStandings, normalizeSeriesDefinition, SERIES } from './series';
import SeriesAdminDashboard from './SeriesAdminDashboard';
import ResultCorrectionPanel from './ResultCorrectionPanel';
import {
  createCloudTournament,
  deleteCloudTournament,
  ensureTournamentSummaries,
  generateEventCode,
  getAdminLoginErrorMessage,
  normalizeEventCode,
  saveCloudTournament,
  saveCloudSeries,
  saveTournamentVersion,
  signInAdminWithToken,
  signOutAdmin,
  subscribeAdminTournaments,
  subscribeAuth,
  subscribeCloudSeries,
  subscribeTournamentAuditLogs,
  subscribeTournamentVersions,
  subscribeTournament,
  syncPublicSeriesProjection,
  validateEventCode
} from './services/tournamentRepository';

const MAX_ROUNDS = 3;
export { createEmptyTournament, MAX_PLAYERS };

const useDialogFocusTrap = (active, onDismiss) => {
  const containerRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!active) return undefined;
    const previousFocus = document.activeElement;
    const container = containerRef.current;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    window.setTimeout(() => container?.querySelector(focusableSelector)?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !container) return;
      const focusable = Array.from(container.querySelectorAll(focusableSelector));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [active]);
  return containerRef;
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

export function TournamentAdminApp({ authenticatedUser = null }) {
  const [initialTournament] = useState(createEmptyTournament);
  const [phase, setPhase] = useState(initialTournament.phase); // 'registration', 'playing', 'finished'
  const [players, setPlayers] = useState(initialTournament.players);
  const [rounds, setRounds] = useState(initialTournament.rounds);
  const [currentRoundNum, setCurrentRoundNum] = useState(initialTournament.currentRoundNum);
  const [judgeCount, setJudgeCount] = useState(initialTournament.judgeCount);
  const [doubleElimination, setDoubleElimination] = useState(initialTournament.doubleElimination);
  const [runId, setRunId] = useState(initialTournament.runId);
  const [runNumber, setRunNumber] = useState(initialTournament.runNumber);
  const [resultLocked, setResultLocked] = useState(initialTournament.resultLocked);
  const [currentVersion, setCurrentVersion] = useState(initialTournament.currentVersion);
  const [viewMode, setViewMode] = useState('tree'); // 預設改為樹狀圖

  // Modal 視窗狀態
  const [confirmAction, setConfirmAction] = useState(null);

  // 新增參賽者狀態
  const [newName, setNewName] = useState('');
  const [rosterError, setRosterError] = useState('');
  const [renamePlayerId, setRenamePlayerId] = useState('');
  const [renamePlayerName, setRenamePlayerName] = useState('');
  const [mockConfirmUntil, setMockConfirmUntil] = useState(0);

  // Firebase 雲端後台狀態
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(isFirebaseConfigured);
  const [adminUser, setAdminUser] = useState(authenticatedUser);
  const [adminToken, setAdminToken] = useState('');
  const [cloudTournaments, setCloudTournaments] = useState([]);
  const [seriesTournaments, setSeriesTournaments] = useState([]);
  const [cloudAuditLogs, setCloudAuditLogs] = useState([]);
  const [cloudVersions, setCloudVersions] = useState([]);
  const [activeCloudCode, setActiveCloudCode] = useState('');
  const [activeCloudName, setActiveCloudName] = useState('');
  const [cloudIsPublic, setCloudIsPublic] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState('local');
  const [cloudError, setCloudError] = useState('');
  const [newCloudName, setNewCloudName] = useState('');
  const [newCloudCode, setNewCloudCode] = useState(() => generateEventCode());
  const [newCloudJudgeCount, setNewCloudJudgeCount] = useState(DEFAULT_JUDGE_COUNT);
  const [newCloudDoubleElimination, setNewCloudDoubleElimination] = useState(DEFAULT_DOUBLE_ELIMINATION);
  const [seriesDefinitions, setSeriesDefinitions] = useState(() => SERIES.map(series => normalizeSeriesDefinition(null, series)));
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [activeSeriesId, setActiveSeriesId] = useState('');
  const [creatingSeriesEventCode, setCreatingSeriesEventCode] = useState('');
  const [seriesMutationStatus, setSeriesMutationStatus] = useState('');
  const [standaloneSearch, setStandaloneSearch] = useState('');
  const [showArchivedTournaments, setShowArchivedTournaments] = useState(false);
  const [publicQrCode, setPublicQrCode] = useState('');
  const [pendingOperationCount, setPendingOperationCount] = useState(0);
  const [lastCloudSuccessAt, setLastCloudSuccessAt] = useState(null);
  const [cloudRetryMessage, setCloudRetryMessage] = useState('');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isCorrectionMode, setIsCorrectionMode] = useState(false);
  const cloudReadyRef = useRef(false);
  const lastCloudStateRef = useRef(null);
  const pendingCloudStateRef = useRef(null);
  const currentCloudStateRef = useRef(null);
  const pendingAuditRef = useRef([]);
  const cloudSyncTimeoutRef = useRef(null);
  const cloudRevisionRef = useRef(0);
  const cloudSyncInFlightRef = useRef(false);
  const cloudSyncRequestedRef = useRef(false);
  const cloudSyncPromiseRef = useRef(null);
  const flushCloudSyncRef = useRef(null);
  const versionMigrationRef = useRef(false);
  const projectionSyncSignaturesRef = useRef({});
  const transitionGuardRef = useRef(false);
  const renameDialogRef = useDialogFocusTrap(Boolean(renamePlayerId), () => { setRenamePlayerId(''); setRenamePlayerName(''); });
  const confirmDialogRef = useDialogFocusTrap(Boolean(confirmAction), () => { if (!seriesMutationStatus) setConfirmAction(null); });
  currentCloudStateRef.current = JSON.stringify({ phase, players, rounds, currentRoundNum, judgeCount, doubleElimination, runId, runNumber, resultLocked, currentVersion });

  const markCloudAudit = (action, details = {}) => {
    const operation = { clientOperationId: createId(), action, details };
    pendingAuditRef.current = [...pendingAuditRef.current, operation];
    setPendingOperationCount(pendingAuditRef.current.length);
    return operation;
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    setMockConfirmUntil(0);
  }, [activeCloudCode, phase]);

  useEffect(() => {
    if (!mockConfirmUntil) return undefined;
    const timer = window.setTimeout(() => setMockConfirmUntil(0), Math.max(0, mockConfirmUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [mockConfirmUntil]);

  useEffect(() => subscribeAuth(setAdminUser), []);

  useEffect(() => {
    if (isFirebaseConfigured && adminUser && !activeCloudCode) {
      setIsCloudModalOpen(true);
    }
  }, [adminUser, activeCloudCode]);

  useEffect(() => {
    if (!adminUser || !activeCloudCode || !cloudReadyRef.current || phase !== 'finished' || resultLocked || versionMigrationRef.current || !isOnline) return;
    versionMigrationRef.current = true;
    const legacyState = { phase, players, rounds, currentRoundNum, judgeCount, doubleElimination, runId, runNumber, resultLocked: true, currentVersion };
    saveTournamentVersion(activeCloudCode, legacyState, {
      expectedRevision: cloudRevisionRef.current,
      type: 'migration',
      reason: '既有完賽資料建立初始鎖定版本',
      changes: []
    }).then(result => {
      const migrated = { ...legacyState, resultLocked: true, currentVersion: result.version };
      cloudRevisionRef.current = result.revision;
      lastCloudStateRef.current = JSON.stringify(migrated);
      setResultLocked(true);
      setCurrentVersion(result.version);
      setLastCloudSuccessAt(new Date());
      setCloudSyncStatus('synced');
    }).catch(error => {
      setCloudError(error.message);
      setCloudSyncStatus('error');
    }).finally(() => { versionMigrationRef.current = false; });
  }, [adminUser, activeCloudCode, phase, players, rounds, currentRoundNum, judgeCount, doubleElimination, runId, runNumber, resultLocked, currentVersion, isOnline]);

  useEffect(() => {
    if (!isFirebaseConfigured || !adminUser) {
      setCloudTournaments([]);
      return undefined;
    }
    let active = true;
    let unsubscribe = () => {};
    ensureTournamentSummaries()
      .then(() => {
        if (active) unsubscribe = subscribeAdminTournaments(setCloudTournaments, error => setCloudError(error.message));
      })
      .catch(error => setCloudError(`賽事摘要載入失敗：${error.message}`));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [adminUser]);

  useEffect(() => {
    if (!isFirebaseConfigured || !adminUser) {
      setSeriesDefinitions(SERIES.map(series => normalizeSeriesDefinition(null, series)));
      return undefined;
    }
    const unsubscribers = SERIES.map(fallback => subscribeCloudSeries(fallback.id, data => {
      const normalized = normalizeSeriesDefinition(data, fallback);
      setSeriesDefinitions(current => current.map(series => series.id === normalized.id ? normalized : series));
    }, error => setCloudError(error.message)));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [adminUser]);

  useEffect(() => {
    const seriesId = selectedSeriesId || activeSeriesId;
    const series = seriesDefinitions.find(item => item.id === seriesId);
    if (!isFirebaseConfigured || !adminUser || !series) {
      setSeriesTournaments([]);
      return undefined;
    }
    setSeriesTournaments([]);
    const unsubscribers = series.events.map(event => subscribeTournament(event.eventCode, tournament => {
      setSeriesTournaments(current => {
        const withoutCurrent = current.filter(item => item.id !== event.eventCode);
        return tournament ? [...withoutCurrent, tournament] : withoutCurrent;
      });
    }, error => {
      if (error.code !== 'permission-denied') setCloudError(`系列場次 ${event.name} 載入失敗：${error.message}`);
    }));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [activeSeriesId, adminUser, selectedSeriesId, seriesDefinitions]);

  useEffect(() => {
    if (!isFirebaseConfigured || !adminUser || !isOnline) return;
    seriesDefinitions.forEach(series => {
      const relatedTournaments = cloudTournaments.filter(tournament =>
        series.events.some(event => event.eventCode === tournament.id)
      );
      const signature = JSON.stringify({
        publicCode: series.publicCode,
        isPublic: series.isPublic,
        revision: series.revision,
        events: series.events,
        tournaments: relatedTournaments.map(tournament => ({
          id: tournament.id,
          name: tournament.name,
          isPublic: tournament.isPublic
        }))
      });
      if (projectionSyncSignaturesRef.current[series.id] === signature) return;
      projectionSyncSignaturesRef.current[series.id] = signature;
      syncPublicSeriesProjection(series, relatedTournaments).catch(error => {
        delete projectionSyncSignaturesRef.current[series.id];
        setCloudError(`公開系列資料同步失敗：${error.message}`);
      });
    });
  }, [adminUser, cloudTournaments, isOnline, seriesDefinitions]);

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
      const serialized = JSON.stringify(normalized);
      const pendingLocalState = pendingCloudStateRef.current || (
        cloudReadyRef.current && currentCloudStateRef.current !== lastCloudStateRef.current
          ? currentCloudStateRef.current
          : null
      );
      if (!shouldApplyCloudSnapshot({
        cloudReady: cloudReadyRef.current,
        pendingLocalState,
        snapshotState: serialized
      })) {
        setCloudSyncStatus('pending');
        return;
      }
      lastCloudStateRef.current = serialized;
      cloudRevisionRef.current = Number(data.revision) || 0;
      if (pendingCloudStateRef.current === serialized) pendingCloudStateRef.current = null;
      cloudReadyRef.current = true;
      setPhase(normalized.phase);
      setPlayers(normalized.players);
      setRounds(normalized.rounds);
      setCurrentRoundNum(normalized.currentRoundNum);
      setJudgeCount(normalized.judgeCount);
      setDoubleElimination(normalized.doubleElimination);
      setRunId(normalized.runId);
      setRunNumber(normalized.runNumber);
      setResultLocked(normalized.resultLocked);
      setCurrentVersion(normalized.currentVersion);
      setActiveCloudName(data.name || activeCloudCode);
      setCloudIsPublic(Boolean(data.isPublic));
      setCloudSyncStatus(data.sync?.hasPendingWrites ? 'pending' : data.sync?.fromCache ? 'offline' : 'synced');
      setCloudError('');
    }, error => {
      setCloudError(error.message);
      setCloudSyncStatus('error');
      setIsCloudModalOpen(true);
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
    if (!isFirebaseConfigured || !adminUser || !activeCloudCode) {
      setCloudVersions([]);
      return undefined;
    }
    return subscribeTournamentVersions(activeCloudCode, setCloudVersions, error => setCloudError(error.message));
  }, [adminUser, activeCloudCode]);

  flushCloudSyncRef.current = async () => {
    if (!adminUser || !activeCloudCode || !cloudReadyRef.current || !isOnline) return false;
    if (cloudSyncInFlightRef.current) {
      cloudSyncRequestedRef.current = true;
      return cloudSyncPromiseRef.current;
    }
    const cloudState = { phase, players, rounds, currentRoundNum, judgeCount, doubleElimination, runId, runNumber, resultLocked, currentVersion };
    const serialized = JSON.stringify(cloudState);
    if (serialized === lastCloudStateRef.current && pendingAuditRef.current.length === 0) return true;

    const audits = pendingAuditRef.current.length > 0 ? [...pendingAuditRef.current] : [{
      clientOperationId: createId(),
      action: 'TOURNAMENT_STATE_UPDATED',
      details: { phase, currentRoundNum }
    }];
    const operationIds = new Set(audits.map(audit => audit.clientOperationId));
    pendingCloudStateRef.current = serialized;
    cloudSyncInFlightRef.current = true;
    setCloudSyncStatus('pending');
    setCloudRetryMessage('');
    cloudSyncPromiseRef.current = runWithCloudRetry(
      // 現階段後台採單一管理裝置：transaction 以雲端當下 revision 寫入，避免本機 listener
      // 尚未收到自己的上一筆確認時，誤判成多人衝突並卡住後續操作。
      () => saveCloudTournament(activeCloudCode, cloudState, audits, null),
      { onRetry: ({ attempt, delay }) => setCloudRetryMessage(`同步失敗，${delay / 1000} 秒後進行第 ${attempt} 次重試`) }
    ).then(nextRevision => {
      cloudRevisionRef.current = nextRevision;
      pendingAuditRef.current = pendingAuditRef.current.filter(audit => !operationIds.has(audit.clientOperationId));
      setPendingOperationCount(pendingAuditRef.current.length);
      if (!pendingCloudStateRef.current || pendingCloudStateRef.current === serialized) {
        lastCloudStateRef.current = serialized;
        pendingCloudStateRef.current = null;
      }
      setLastCloudSuccessAt(new Date());
      setCloudRetryMessage('');
      setCloudSyncStatus('synced');
      return true;
    }).catch(error => {
      lastCloudStateRef.current = null;
      setCloudError(error.message);
      setCloudSyncStatus('error');
      return false;
    }).finally(() => {
      cloudSyncInFlightRef.current = false;
      cloudSyncPromiseRef.current = null;
      if (cloudSyncRequestedRef.current) {
        cloudSyncRequestedRef.current = false;
        window.setTimeout(() => flushCloudSyncRef.current?.(), 0);
      }
    });
    return cloudSyncPromiseRef.current;
  };

  useEffect(() => {
    if (!adminUser || !activeCloudCode || !cloudReadyRef.current || !isOnline) return undefined;
    const serialized = JSON.stringify({ phase, players, rounds, currentRoundNum, judgeCount, doubleElimination, runId, runNumber, resultLocked, currentVersion });
    if (serialized === lastCloudStateRef.current && pendingAuditRef.current.length === 0) return undefined;
    pendingCloudStateRef.current = serialized;
    setCloudSyncStatus('pending');
    cloudSyncTimeoutRef.current = window.setTimeout(() => flushCloudSyncRef.current?.(), 400);
    return () => {
      if (cloudSyncTimeoutRef.current) window.clearTimeout(cloudSyncTimeoutRef.current);
      cloudSyncTimeoutRef.current = null;
    };
  }, [adminUser, activeCloudCode, phase, players, rounds, currentRoundNum, judgeCount, doubleElimination, runId, runNumber, resultLocked, currentVersion, isOnline]);

  const publicTournamentUrl = activeCloudCode
    ? `${window.location.origin}${window.location.pathname}?event=${activeCloudCode}`
    : '';

  useEffect(() => {
    if (!publicTournamentUrl) {
      setPublicQrCode('');
      return undefined;
    }
    let active = true;
    QRCode.toDataURL(publicTournamentUrl, { width: 240, margin: 2, errorCorrectionLevel: 'M' })
      .then(dataUrl => { if (active) setPublicQrCode(dataUrl); })
      .catch(error => setCloudError(`QR Code 產生失敗：${error.message}`));
    return () => { active = false; };
  }, [publicTournamentUrl]);

  const scoreOptions = Array.from({ length: judgeCount + 1 }, (_, p2Votes) => ({
    v1: judgeCount - p2Votes,
    v2: p2Votes
  }));
  const selectedSeries = seriesDefinitions.find(series => series.id === selectedSeriesId) || null;
  const activeSeries = seriesDefinitions.find(series => series.id === activeSeriesId) || null;
  const seriesEventCodes = new Set(seriesDefinitions.flatMap(series => series.events.map(event => event.eventCode)));
  const standaloneTournaments = cloudTournaments.filter(tournament => !seriesEventCodes.has(tournament.id));
  const visibleStandaloneTournaments = standaloneTournaments.filter(tournament => {
    const keyword = standaloneSearch.trim().toLocaleLowerCase('zh-TW');
    const matchesSearch = !keyword
      || String(tournament.name || '').toLocaleLowerCase('zh-TW').includes(keyword)
      || tournament.id.toLocaleLowerCase('zh-TW').includes(keyword);
    return matchesSearch && (showArchivedTournaments || !tournament.isArchived);
  });
  const selectedSeriesTournaments = selectedSeries
    ? selectedSeries.events.map(event =>
      seriesTournaments.find(tournament => tournament.id === event.eventCode)
      || cloudTournaments.find(tournament => tournament.id === event.eventCode)
    ).filter(Boolean)
    : [];
  const selectedSeriesStandings = selectedSeries ? buildSeriesStandings(selectedSeries, seriesTournaments) : [];
  const otherSeriesPlayerNames = activeSeries
    ? seriesTournaments
      .filter(tournament => tournament.id !== activeCloudCode && activeSeries.events.some(event => event.eventCode === tournament.id))
      .flatMap(tournament => (tournament.players || []).filter(player => !player.isMC).map(player => player.name))
    : [];

  const handleCloudLogin = async (event) => {
    event.preventDefault();
    setCloudError('');
    try {
      const user = await signInAdminWithToken(adminToken);
      setAdminUser(user);
      setAdminToken('');
    } catch (error) {
      setCloudError(getAdminLoginErrorMessage(error));
    }
  };

  const persistCurrentCloudState = async () => {
    if (!adminUser || !activeCloudCode || !cloudReadyRef.current) return true;
    if (cloudSyncTimeoutRef.current) {
      window.clearTimeout(cloudSyncTimeoutRef.current);
      cloudSyncTimeoutRef.current = null;
    }
    if (!isOnline) {
      setCloudError('目前沒有網路連線，恢復連線並完成同步後才能離開賽事。');
      return false;
    }
    const firstFlush = await flushCloudSyncRef.current?.();
    if (!firstFlush) return false;
    const currentSerialized = JSON.stringify({ phase, players, rounds, currentRoundNum, judgeCount, doubleElimination, runId, runNumber, resultLocked, currentVersion });
    if (lastCloudStateRef.current !== currentSerialized || pendingAuditRef.current.length > 0) {
      return Boolean(await flushCloudSyncRef.current?.());
    }
    return true;
  };

  const handleLeaveCloudTournament = async () => {
    const resultAlreadyCommitted = canLeaveWithoutTournamentWrite({ phase, resultLocked });
    const persisted = resultAlreadyCommitted ? true : await persistCurrentCloudState();
    if (!persisted) return;
    // 完賽版本已由 saveTournamentVersion 原子儲存；返回首頁是純導航，
    // 不得再將 TOURNAMENT_CLOSED 當成賽事變更寫回已鎖定文件。
    pendingAuditRef.current = [];
    setPendingOperationCount(0);
    cloudReadyRef.current = false;
    pendingCloudStateRef.current = null;
    lastCloudStateRef.current = null;
    setActiveCloudCode('');
    setActiveCloudName('');
    setCloudSyncStatus('local');
    setSelectedSeriesId(activeSeriesId);
    setIsCloudModalOpen(true);
  };

  const handleSelectCloudTournament = async (code, seriesId = '') => {
    if (code === activeCloudCode) {
      setActiveSeriesId(seriesId);
      setSelectedSeriesId('');
      setIsCloudModalOpen(false);
      return;
    }
    if (activeCloudCode && !await persistCurrentCloudState()) return;
    cloudReadyRef.current = false;
    pendingCloudStateRef.current = null;
    lastCloudStateRef.current = null;
    setActiveSeriesId(seriesId);
    setSelectedSeriesId('');
    setCloudError('');
    setCloudSyncStatus('loading');
    setActiveCloudCode(code);
    setIsCloudModalOpen(false);
  };

  const handleCloudSignOut = async () => {
    const resultAlreadyCommitted = canLeaveWithoutTournamentWrite({ phase, resultLocked });
    if (activeCloudCode && !resultAlreadyCommitted && !await persistCurrentCloudState()) return;
    cloudReadyRef.current = false;
    pendingCloudStateRef.current = null;
    pendingAuditRef.current = [];
    setPendingOperationCount(0);
    setSelectedSeriesId('');
    setActiveSeriesId('');
    setActiveCloudCode('');
    await signOutAdmin();
  };

  const handleCreateCloudTournament = async () => {
    setCloudError('');
    try {
      if (activeCloudCode && !await persistCurrentCloudState()) return;
      const tournament = createEmptyTournament({
        judgeCount: newCloudJudgeCount,
        doubleElimination: newCloudDoubleElimination
      });
      const code = await createCloudTournament({
        eventCode: newCloudCode,
        name: newCloudName,
        tournament
      });
      cloudReadyRef.current = false;
      pendingCloudStateRef.current = null;
      pendingAuditRef.current = [];
      setPendingOperationCount(0);
      lastCloudStateRef.current = null;
      setPhase(tournament.phase);
      setPlayers(tournament.players);
      setRounds(tournament.rounds);
      setCurrentRoundNum(tournament.currentRoundNum);
      setJudgeCount(tournament.judgeCount);
      setDoubleElimination(tournament.doubleElimination);
      setRunId(tournament.runId);
      setRunNumber(tournament.runNumber);
      setResultLocked(tournament.resultLocked);
      setCurrentVersion(tournament.currentVersion);
      setSelectedSeriesId('');
      setActiveSeriesId('');
      setActiveCloudCode(code);
      setIsCloudModalOpen(false);
      setNewCloudCode(generateEventCode());
      setNewCloudName('');
      setNewCloudJudgeCount(DEFAULT_JUDGE_COUNT);
      setNewCloudDoubleElimination(DEFAULT_DOUBLE_ELIMINATION);
    } catch (error) {
      setCloudError(error.message);
    }
  };

  const handleCreateSeriesTournament = async (series, eventDefinition) => {
    const existing = cloudTournaments.find(tournament => tournament.id === eventDefinition.eventCode);
    if (existing) {
      await handleSelectCloudTournament(existing.id, series.id);
      return;
    }

    setCloudError('');
    setCreatingSeriesEventCode(eventDefinition.eventCode);
    try {
      const tournament = createEmptyTournament({
        judgeCount: eventDefinition.judgeCount,
        doubleElimination: eventDefinition.doubleElimination
      });
      const code = await createCloudTournament({
        eventCode: eventDefinition.eventCode,
        name: eventDefinition.name,
        tournament: {
          ...tournament,
          seriesId: series.id,
          seriesEventId: eventDefinition.id
        }
      });
      cloudReadyRef.current = false;
      pendingCloudStateRef.current = null;
      pendingAuditRef.current = [];
      setPendingOperationCount(0);
      lastCloudStateRef.current = null;
      setPhase(tournament.phase);
      setPlayers(tournament.players);
      setRounds(tournament.rounds);
      setCurrentRoundNum(tournament.currentRoundNum);
      setJudgeCount(tournament.judgeCount);
      setDoubleElimination(tournament.doubleElimination);
      setRunId(tournament.runId);
      setRunNumber(tournament.runNumber);
      setResultLocked(tournament.resultLocked);
      setCurrentVersion(tournament.currentVersion);
      setActiveSeriesId(series.id);
      setSelectedSeriesId('');
      setActiveCloudCode(code);
      setIsCloudModalOpen(false);
    } catch (error) {
      setCloudError(error.message);
    } finally {
      setCreatingSeriesEventCode('');
    }
  };

  const replaceSeriesDefinition = (nextSeries) => {
    setSeriesDefinitions(current => current.map(series => series.id === nextSeries.id ? nextSeries : series));
  };

  const handleAddSeriesEvent = async (series, { name, eventCode }) => {
    const normalizedName = String(name || '').trim();
    const normalizedCode = normalizeEventCode(eventCode);
    setCloudError('');
    if (!normalizedName) {
      setCloudError('請輸入系列場次名稱。');
      return false;
    }
    if (!validateEventCode(normalizedCode)) {
      setCloudError('賽事代碼需為 4–10 位英文字母或數字。');
      return false;
    }
    if (seriesDefinitions.some(item => item.events.some(event => event.eventCode === normalizedCode)) || cloudTournaments.some(tournament => tournament.id === normalizedCode)) {
      setCloudError('此賽事代碼已被其他場次或賽事使用。');
      return false;
    }

    const nextSeries = {
      ...series,
      events: [...series.events, {
        id: `event-${normalizedCode.toLowerCase()}`,
        name: normalizedName,
        eventCode: normalizedCode,
        judgeCount: DEFAULT_JUDGE_COUNT,
        doubleElimination: DEFAULT_DOUBLE_ELIMINATION
      }]
    };
    setSeriesMutationStatus('adding');
    try {
      const nextRevision = await saveCloudSeries(nextSeries, series.revision || 0);
      replaceSeriesDefinition({ ...nextSeries, revision: nextRevision });
      return true;
    } catch (error) {
      setCloudError(error.message);
      return false;
    } finally {
      setSeriesMutationStatus('');
    }
  };

  const handleClearSeriesEvent = async (series, eventDefinition, tournament) => {
    setCloudError('');
    setSeriesMutationStatus(`clear:${eventDefinition.eventCode}`);
    try {
      const emptyTournament = createEmptyTournament({
        judgeCount: eventDefinition.judgeCount,
        doubleElimination: eventDefinition.doubleElimination
      });
      emptyTournament.runNumber = (Number(tournament.runNumber) || 1) + 1;
      await saveCloudTournament(eventDefinition.eventCode, emptyTournament, {
        action: 'TOURNAMENT_CLEARED',
        details: {
          seriesId: series.id,
          name: eventDefinition.name,
          previousPhase: tournament.phase,
          removedPlayers: tournament.players?.length || 0,
          removedRounds: tournament.rounds?.length || 0
        }
      }, tournament.revision || 0);
      setConfirmAction(null);
    } catch (error) {
      setCloudError(error.message);
      setConfirmAction(null);
    } finally {
      setSeriesMutationStatus('');
    }
  };

  const handleDeleteSeriesEvent = async (series, eventDefinition, tournament) => {
    setCloudError('');
    setSeriesMutationStatus(`delete:${eventDefinition.eventCode}`);
    try {
      const currentTournament = cloudTournaments.find(item => item.id === eventDefinition.eventCode);
      if (currentTournament) {
        await syncPublicSeriesProjection(series, cloudTournaments.map(item =>
          item.id === eventDefinition.eventCode ? { ...item, isPublic: false, deletionStatus: 'deleting' } : item
        ));
        if (currentTournament.deletionStatus !== 'deleting') {
          await saveCloudTournament(eventDefinition.eventCode, {
            isPublic: false,
            deletionStatus: 'deleting'
          }, {
            action: 'TOURNAMENT_DELETION_STARTED',
            details: { seriesId: series.id, name: eventDefinition.name }
          }, currentTournament.revision || 0);
        }
        await deleteCloudTournament(eventDefinition.eventCode);
      }
      const nextSeries = {
        ...series,
        events: series.events.filter(event => event.id !== eventDefinition.id)
      };
      const nextRevision = await saveCloudSeries(nextSeries, series.revision || 0, {
        action: 'TOURNAMENT_DELETED',
        details: {
          eventCode: eventDefinition.eventCode,
          eventName: eventDefinition.name,
          deletedTournament: Boolean(currentTournament)
        }
      });
      replaceSeriesDefinition({ ...nextSeries, revision: nextRevision });
      setConfirmAction(null);
    } catch (error) {
      setCloudError(`刪除未完成：${error.message}。請在場次卡重新執行刪除，系統會從中斷處續跑。`);
      setConfirmAction(null);
    } finally {
      setSeriesMutationStatus('');
    }
  };

  const handleArchiveStandaloneTournament = async (tournament) => {
    setCloudError('');
    setSeriesMutationStatus(`archive:${tournament.id}`);
    try {
      await saveCloudTournament(tournament.id, { isArchived: !tournament.isArchived }, {
        action: tournament.isArchived ? 'TOURNAMENT_UNARCHIVED' : 'TOURNAMENT_ARCHIVED',
        details: { before: Boolean(tournament.isArchived), after: !tournament.isArchived }
      }, tournament.revision || 0);
    } catch (error) {
      setCloudError(error.message);
    } finally {
      setSeriesMutationStatus('');
    }
  };

  const handleDeleteStandaloneTournament = async (tournament) => {
    setCloudError('');
    setSeriesMutationStatus(`delete:${tournament.id}`);
    try {
      const currentTournament = cloudTournaments.find(item => item.id === tournament.id);
      if (currentTournament && currentTournament.deletionStatus !== 'deleting') {
        await saveCloudTournament(tournament.id, { isPublic: false, deletionStatus: 'deleting' }, {
          action: 'TOURNAMENT_DELETION_STARTED',
          details: { standalone: true, name: tournament.name || tournament.id }
        }, currentTournament.revision || 0);
      }
      await deleteCloudTournament(tournament.id);
      setConfirmAction(null);
    } catch (error) {
      setCloudError(`刪除未完成：${error.message}。請重新執行永久刪除以續跑。`);
      setConfirmAction(null);
    } finally {
      setSeriesMutationStatus('');
    }
  };

  const handleToggleSeriesVisibility = async (series) => {
    setCloudError('');
    setSeriesMutationStatus('visibility');
    try {
      const nextSeries = { ...series, isPublic: !series.isPublic };
      const nextRevision = await saveCloudSeries(nextSeries, series.revision || 0);
      replaceSeriesDefinition({ ...nextSeries, revision: nextRevision });
    } catch (error) {
      setCloudError(error.message);
    } finally {
      setSeriesMutationStatus('');
    }
  };

  const handleToggleCloudVisibility = async () => {
    const nextValue = !cloudIsPublic;
    setCloudError('');
    try {
      const nextRevision = await saveCloudTournament(activeCloudCode, { isPublic: nextValue }, {
        action: 'PUBLIC_VISIBILITY_CHANGED',
        details: { before: cloudIsPublic, after: nextValue }
      }, cloudRevisionRef.current);
      cloudRevisionRef.current = nextRevision;
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
    if (players.length >= MAX_PLAYERS) {
      setRosterError(`每場賽事最多 ${MAX_PLAYERS} 位選手。`);
      return;
    }
    const newPlayer = { id: createId(), name: trimmedName, wins: 0, votes: 0, losses: 0, isWithdrawn: false, isEliminated: false };
    markCloudAudit('PLAYER_ADDED', { playerId: newPlayer.id, name: newPlayer.name, player: newPlayer });
    setPlayers(prev => [...prev, newPlayer]);
    setNewName('');
    setRosterError('');
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
            newPlayers.push({ id: createId(), name, wins: 0, votes: 0, losses: 0, isWithdrawn: false, isEliminated: false });
          }
        }
      });
      
      const availableSlots = Math.max(0, MAX_PLAYERS - players.length);
      const acceptedPlayers = newPlayers.slice(0, availableSlots);
      if (acceptedPlayers.length > 0) {
        markCloudAudit('PLAYERS_IMPORTED', { count: acceptedPlayers.length, names: acceptedPlayers.map(player => player.name), players: acceptedPlayers });
        setPlayers(prev => [...prev, ...acceptedPlayers]);
      }
      setRosterError(newPlayers.length > acceptedPlayers.length ? `名單已達 ${MAX_PLAYERS} 人上限，超出的選手未匯入。` : '');
      e.target.value = null; // 重置 input 讓下次可以選同一個檔案
    };
    reader.readAsText(file);
  };

  const loadMockData = () => {
    if (mockConfirmUntil <= Date.now()) {
      setMockConfirmUntil(Date.now() + 10000);
      return;
    }
    const mockPlayers = [
      ...Array.from({ length: 8 }, (_, index) => ({
        id: createId(), name: `player-${String(index + 1).padStart(3, '0')}`, wins: 0, votes: 0, losses: 0, isWithdrawn: false, isEliminated: false
      }))
    ];
    markCloudAudit('TEST_PLAYERS_LOADED', { count: mockPlayers.length, players: mockPlayers });
    setPlayers(mockPlayers);
    setMockConfirmUntil(0);
  };

  const removePlayer = (id) => {
    const target = players.find(player => player.id === id);
    markCloudAudit('PLAYER_REMOVED', { playerId: id, name: target?.name });
    setPlayers(players.filter(p => p.id !== id));
    setRosterError('');
  };

  const openRenamePlayer = (player) => {
    if (phase === 'finished') {
      setIsCorrectionMode(true);
      return;
    }
    setRenamePlayerId(player.id);
    setRenamePlayerName(player.name);
    setRosterError('');
  };

  const confirmRenamePlayer = (event) => {
    event.preventDefault();
    const target = players.find(player => player.id === renamePlayerId);
    const nextName = renamePlayerName.trim();
    if (!target || !nextName) return setRosterError('選手姓名不可空白。');
    if (players.some(player => player.id !== target.id && player.name === nextName)) return setRosterError('同一場賽事不可有重複姓名。');
    if (target.name === nextName) {
      setRenamePlayerId('');
      return;
    }
    markCloudAudit('PLAYER_RENAMED', { playerId: target.id, before: target.name, after: nextName });
    setPlayers(current => current.map(player => player.id === target.id ? { ...player, name: nextName } : player));
    setRounds(current => current.map(round => round.map(match => ({
      ...match,
      p1: match.p1.id === target.id ? { ...match.p1, name: nextName } : match.p1,
      p2: match.p2.id === target.id ? { ...match.p2, name: nextName } : match.p2
    }))));
    setRenamePlayerId('');
    setRenamePlayerName('');
    setRosterError('');
  };

  // --- 賽事核心邏輯 ---
  const startTournament = () => {
    if (transitionGuardRef.current) return;
    transitionGuardRef.current = true;
    setIsTransitioning(true);
    markCloudAudit('TOURNAMENT_STARTED', { playerCount: players.filter(player => !player.isWithdrawn).length, judgeCount, doubleElimination });
    setPhase('playing');
    generateRound(1, players.filter(p => !p.isWithdrawn)); // 第一輪只配對未棄賽選手
    setIsTransitioning(false);
    transitionGuardRef.current = false;
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
    const updatedPlayers = applyDoubleElimination(recalculatePlayerRecords(players, newRounds), newRounds, doubleElimination);

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
    const updatedPlayers = applyDoubleElimination(recalculatePlayerRecords(players, updatedRounds), updatedRounds, doubleElimination);
    setRounds(updatedRounds); setPlayers(updatedPlayers);
  };

  const advanceToNextRound = async () => {
    if (transitionGuardRef.current) return;
    transitionGuardRef.current = true;
    if (currentRoundNum < MAX_ROUNDS) {
      setIsTransitioning(true);
      const nextRoundNum = currentRoundNum + 1;
      const updatedPlayers = applyDoubleElimination(players, rounds, doubleElimination);
      const newlyEliminated = updatedPlayers.filter(player =>
        player.isEliminated && !players.find(previous => previous.id === player.id)?.isEliminated
      );
      markCloudAudit('ROUND_ADVANCED', { from: currentRoundNum, to: nextRoundNum, eliminated: newlyEliminated.map(player => player.name) });
      setCurrentRoundNum(nextRoundNum);
      generateRound(nextRoundNum, updatedPlayers);
      setIsTransitioning(false);
      transitionGuardRef.current = false;
    } else {
      if (!activeCloudCode) {
        setPhase('finished');
        setResultLocked(true);
        transitionGuardRef.current = false;
        return;
      }
      setIsTransitioning(true);
      try {
        if (!await persistCurrentCloudState()) return;
        const finalState = { phase: 'finished', players, rounds, currentRoundNum, judgeCount, doubleElimination, runId, runNumber, resultLocked: true, currentVersion };
        const result = await saveTournamentVersion(activeCloudCode, finalState, {
          expectedRevision: cloudRevisionRef.current,
          type: 'completed',
          reason: '賽事完賽鎖定',
          changes: []
        });
        const lockedState = { ...finalState, currentVersion: result.version };
        cloudRevisionRef.current = result.revision;
        lastCloudStateRef.current = JSON.stringify(lockedState);
        pendingCloudStateRef.current = null;
        pendingAuditRef.current = [];
        setPendingOperationCount(0);
        setPhase('finished');
        setResultLocked(true);
        setCurrentVersion(result.version);
        setLastCloudSuccessAt(new Date());
        setCloudSyncStatus('synced');
      } catch (error) {
        setCloudError(error.message);
        setCloudSyncStatus('error');
      } finally {
        transitionGuardRef.current = false;
        setIsTransitioning(false);
      }
    }
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
      updatedPlayers = applyDoubleElimination(recalculatePlayerRecords(updatedPlayers, updatedRounds), updatedRounds, doubleElimination);
    }
    setPlayers(updatedPlayers);
    setRounds(updatedRounds);
    setConfirmAction(null);
  };

  const applyLockedVersionState = (state, revision, version) => {
    const normalized = normalizeTournamentData({ ...state, phase: 'finished', resultLocked: true, currentVersion: version });
    const serialized = JSON.stringify(normalized);
    cloudRevisionRef.current = revision;
    lastCloudStateRef.current = serialized;
    pendingCloudStateRef.current = null;
    pendingAuditRef.current = [];
    setPendingOperationCount(0);
    setPhase(normalized.phase);
    setPlayers(normalized.players);
    setRounds(normalized.rounds);
    setCurrentRoundNum(normalized.currentRoundNum);
    setJudgeCount(normalized.judgeCount);
    setDoubleElimination(normalized.doubleElimination);
    setRunId(normalized.runId);
    setRunNumber(normalized.runNumber);
    setResultLocked(true);
    setCurrentVersion(version);
    setLastCloudSuccessAt(new Date());
    setCloudSyncStatus('synced');
  };

  const commitResultCorrection = async ({ players: correctedPlayers, rounds: correctedRounds, reason, changes }) => {
    setIsTransitioning(true);
    setCloudError('');
    try {
      const recalculatedPlayers = applyDoubleElimination(
        recalculatePlayerRecords(correctedPlayers, correctedRounds),
        correctedRounds,
        doubleElimination
      );
      const correctedState = { phase: 'finished', players: recalculatedPlayers, rounds: correctedRounds, currentRoundNum, judgeCount, doubleElimination, runId, runNumber, resultLocked: true, currentVersion };
      const result = await saveTournamentVersion(activeCloudCode, correctedState, {
        expectedRevision: cloudRevisionRef.current,
        type: 'correction',
        reason,
        changes
      });
      applyLockedVersionState(correctedState, result.revision, result.version);
      setIsCorrectionMode(false);
    } catch (error) {
      setCloudError(error.message);
      setCloudSyncStatus('error');
    } finally {
      setIsTransitioning(false);
    }
  };

  const restoreResultVersion = async (version, reason) => {
    if (!version || version.runId !== runId) return;
    setIsTransitioning(true);
    setCloudError('');
    try {
      const restoredState = normalizeTournamentData({ ...version.snapshot, runId, runNumber, resultLocked: true, currentVersion });
      const result = await saveTournamentVersion(activeCloudCode, restoredState, {
        expectedRevision: cloudRevisionRef.current,
        type: 'restore',
        reason,
        changes: [{ type: 'restore', fromVersion: currentVersion, toVersion: version.version }],
        sourceVersion: version.version
      });
      applyLockedVersionState(restoredState, result.revision, result.version);
      setIsCorrectionMode(false);
    } catch (error) {
      setCloudError(error.message);
      setCloudSyncStatus('error');
    } finally {
      setIsTransitioning(false);
    }
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
           <button onClick={advanceToNextRound} disabled={isTransitioning}
              className="flex items-center gap-3 px-10 py-4 rounded-xl font-black text-xl uppercase tracking-widest shadow-2xl transition-all hover:scale-105 active:scale-95 brush-border"
              style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg, boxShadow: `0 0 25px ${COLORS.inkBlue}60` }}>
              {isTransitioning ? '處理中…' : currentRoundNum === MAX_ROUNDS ? '結算最終排名' : '進入下一輪'} <ChevronRight size={24} />
            </button>
        </div>
      )}
    </div>
  );

  const isEditorReadOnly = Boolean(activeCloudCode && (
    !isOnline || cloudSyncStatus === 'offline' || cloudSyncStatus === 'loading' || cloudSyncStatus === 'error'
  ));

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
        <button onClick={activeCloudCode ? handleLeaveCloudTournament : () => setIsCloudModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-bold brush-border border"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder, color: COLORS.textMain }}>
          <Home size={18} style={{color: COLORS.inkOrange}} /> {activeCloudCode ? `返回${activeSeries ? `${activeSeries.name}系列賽` : '雲端賽事列表'}` : '選擇雲端賽事'}
        </button>
      </div>

      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex flex-wrap justify-end gap-2 z-30 max-w-[75%]">
        <a href={window.location.pathname} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg transition-all text-sm font-black tracking-widest brush-border border"
          style={{ backgroundColor: COLORS.card, color: COLORS.inkOrange, borderColor: COLORS.inkOrange }}>
          <Network size={18} /> 公開前台
        </a>
        {isFirebaseConfigured && <button onClick={() => { setSelectedSeriesId(''); setIsCloudModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg transition-all text-sm font-black tracking-widest brush-border border"
          style={{ backgroundColor: activeCloudCode ? COLORS.inkOrange : COLORS.card, color: activeCloudCode ? COLORS.bg : COLORS.inkBlue, borderColor: COLORS.inkBlue }}>
          <Archive size={18} /> {activeCloudCode || '雲端後台'}
        </button>}
        {adminUser && <button onClick={handleCloudSignOut} className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg transition-all text-sm font-black tracking-widest brush-border border border-red-500/40 text-red-300">
          登出
        </button>}
      </div>

      {/* Cloud admin modal */}
      {isCloudModalOpen && isFirebaseConfigured && (
        <FullScreenCloudManager>
            <div className="flex justify-between items-center p-5 border-b" style={{ borderColor: COLORS.cardBorder, backgroundColor: COLORS.card }}>
              <div>
                <h2 className="text-xl font-black text-white">{selectedSeries ? `${selectedSeries.name}系列賽` : '雲端賽事管理'}</h2>
                <p className="text-xs font-bold mt-1" style={{ color: COLORS.textMuted }}>{selectedSeries ? '分場管理與系列積分排名' : '建立或選擇賽事後，所有進度都會自動保存至雲端'}</p>
              </div>
              {activeCloudCode && <button onClick={() => setIsCloudModalOpen(false)} aria-label="關閉雲端後台"><X size={28} /></button>}
            </div>

            <div className="flex-1 min-h-0 p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-6">
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
                    <button onClick={handleCloudSignOut} className="px-4 py-2 rounded-lg text-sm font-black text-red-300 border border-red-500/40">登出</button>
                  </div>

                  {selectedSeries ? (
                    <SeriesAdminDashboard
                      series={selectedSeries}
                      tournaments={selectedSeriesTournaments}
                      standings={selectedSeriesStandings}
                      creatingEventCode={creatingSeriesEventCode}
                      mutationStatus={isOnline ? seriesMutationStatus : 'offline'}
                      onBack={() => setSelectedSeriesId('')}
                      onOpenEvent={(series, eventDefinition, tournament) => handleSelectCloudTournament(tournament.id, series.id)}
                      onCreateEvent={handleCreateSeriesTournament}
                      onAddEvent={handleAddSeriesEvent}
                      onClearEvent={(series, eventDefinition, tournament) => setConfirmAction({ type: 'CLEAR_SERIES_EVENT', series, eventDefinition, tournament })}
                      onDeleteEvent={(series, eventDefinition, tournament) => setConfirmAction({ type: 'DELETE_SERIES_EVENT', series, eventDefinition, tournament })}
                      onToggleVisibility={handleToggleSeriesVisibility}
                    />
                  ) : (
                    <>
                  {activeCloudCode && (
                    <>
                      <section className="p-5 rounded-xl border-2" style={{ backgroundColor: '#131e24', borderColor: COLORS.inkBlue }}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <div className="text-xs font-black tracking-widest" style={{ color: COLORS.textMuted }}>目前雲端賽事</div>
                            <h3 className="text-xl font-black mt-1">{activeCloudName || activeCloudCode} <span style={{ color: COLORS.inkOrange }}>#{activeCloudCode}</span></h3>
                            <div className="text-xs font-bold mt-2" style={{ color: cloudSyncStatus === 'error' ? '#f87171' : COLORS.inkBlue }}>
                              {{ loading: '讀取中', pending: '同步中', offline: '離線快取・等待網路', synced: '已與雲端同步', error: '同步失敗', local: '尚未選擇賽事' }[cloudSyncStatus]}
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
                        <div className="grid sm:grid-cols-[1fr_auto] gap-5 items-center">
                          <div className="min-w-0">
                            <h3 className="font-black mb-2">觀眾即時賽況網址</h3>
                            <a href={publicTournamentUrl} target="_blank" rel="noreferrer" className="block text-sm font-bold break-all hover:underline" style={{ color: COLORS.inkBlue }}>{publicTournamentUrl}</a>
                            <p className="text-xs mt-3 leading-relaxed" style={{ color: COLORS.textMuted }}>QR Code 已包含賽事代碼；將賽事設為公開後，現場觀眾掃描即可直接進入。</p>
                          </div>
                          {publicQrCode && (
                            <a href={publicQrCode} download={`${activeCloudCode}-qrcode.png`} className="justify-self-center text-center">
                              <img src={publicQrCode} alt={`賽事 ${activeCloudCode} 公開網址 QR Code`} className="w-36 h-36 rounded-lg bg-white p-1" />
                              <span className="block text-xs font-black mt-2" style={{ color: COLORS.inkOrange }}>下載 QR Code</span>
                            </a>
                          )}
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

                  {!activeCloudCode && <section className="p-5 rounded-xl border-2" style={{ backgroundColor: '#131e24', borderColor: COLORS.inkOrange }}>
                    <h3 className="font-black text-lg mb-2">系列賽</h3>
                    <p className="text-xs mb-4" style={{ color: COLORS.textMuted }}>進入系列賽後可分別管理各場報名與賽程，並查看跨場積分。</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {seriesDefinitions.map(series => (
                        <button key={series.id} type="button" onClick={() => { setCloudError(''); setSelectedSeriesId(series.id); }}
                          className="p-5 rounded-xl border text-left hover:bg-white/5 flex items-center justify-between gap-4"
                          style={{ borderColor: COLORS.inkOrange }}>
                          <div>
                            <div className="text-xl font-black text-white">{series.name}</div>
                            <div className="text-xs font-bold mt-2" style={{ color: COLORS.textMuted }}>{series.events.length} 場・3 位評審・兩敗淘汰</div>
                          </div>
                          <span className="text-sm font-black whitespace-nowrap" style={{ color: COLORS.inkOrange }}>進入管理 →</span>
                        </button>
                      ))}
                    </div>
                  </section>}

                  <section className="p-5 rounded-xl border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                    <h3 className="font-black mb-2">建立新的雲端賽事</h3>
                    <p className="text-xs mb-4 leading-relaxed" style={{ color: COLORS.textMuted }}>建立完成時就會立即保存至 Firestore，之後每次操作都會自動同步，不需要另外存檔。</p>
                    <div className="grid sm:grid-cols-[1fr_10rem_auto] gap-3">
                      <input value={newCloudName} onChange={event => setNewCloudName(event.target.value)} placeholder="賽事名稱" className="px-4 py-3 rounded-lg border" />
                      <input value={newCloudCode} onChange={event => setNewCloudCode(normalizeEventCode(event.target.value))} aria-label="新賽事代碼" className="px-4 py-3 rounded-lg border font-black uppercase" />
                      <button onClick={handleCreateCloudTournament} className="px-5 py-3 rounded-lg font-black" style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg }}>建立並進入</button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4 mt-4">
                      <fieldset>
                        <legend className="text-xs font-black mb-2" style={{ color: COLORS.textMuted }}>單場評審人數</legend>
                        <div className="grid grid-cols-2 gap-2">
                          {SUPPORTED_JUDGE_COUNTS.map(count => (
                            <button key={count} type="button" onClick={() => setNewCloudJudgeCount(count)}
                              aria-label={`新賽事 ${count} 位評審`} aria-pressed={newCloudJudgeCount === count}
                              className="py-2.5 rounded-lg border font-black text-sm"
                              style={{ backgroundColor: newCloudJudgeCount === count ? COLORS.inkBlue : 'transparent', borderColor: newCloudJudgeCount === count ? COLORS.inkBlue : COLORS.cardBorder, color: newCloudJudgeCount === count ? COLORS.bg : COLORS.textMuted }}>
                              {count} 位評審
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend className="text-xs font-black mb-2" style={{ color: COLORS.textMuted }}>淘汰規則</legend>
                        <div className="grid grid-cols-2 gap-2">
                          {[false, true].map(enabled => (
                            <button key={String(enabled)} type="button" onClick={() => setNewCloudDoubleElimination(enabled)}
                              aria-label={`新賽事${enabled ? '兩敗淘汰' : '不淘汰'}`} aria-pressed={newCloudDoubleElimination === enabled}
                              className="py-2.5 rounded-lg border font-black text-sm"
                              style={{ backgroundColor: newCloudDoubleElimination === enabled ? COLORS.inkOrange : 'transparent', borderColor: newCloudDoubleElimination === enabled ? COLORS.inkOrange : COLORS.cardBorder, color: newCloudDoubleElimination === enabled ? COLORS.bg : COLORS.textMuted }}>
                              {enabled ? '兩敗淘汰' : '不淘汰'}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                    <p className="text-xs mt-3" style={{ color: COLORS.textMuted }}>建立需要連線以確認代碼唯一；新賽事建立後預設公開，觀眾可立即使用賽事代碼查看。</p>
                  </section>

                  <section>
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-black">既有單場賽事 ({visibleStandaloneTournaments.length}/{standaloneTournaments.length})</h3>
                        <label className="mt-2 flex items-center gap-2 text-xs font-bold" style={{ color: COLORS.textMuted }}>
                          <input type="checkbox" checked={showArchivedTournaments} onChange={event => setShowArchivedTournaments(event.target.checked)} />
                          顯示已封存賽事
                        </label>
                      </div>
                      <input type="search" aria-label="搜尋獨立賽事" value={standaloneSearch} onChange={event => setStandaloneSearch(event.target.value)}
                        placeholder="搜尋名稱或代碼" className="px-4 py-2.5 rounded-lg border min-w-64" />
                    </div>
                    <div className="space-y-3">
                      {visibleStandaloneTournaments.map(tournament => (
                        <article key={tournament.id} className={`w-full p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${tournament.isArchived ? 'opacity-65' : ''}`} style={{ borderColor: tournament.deletionStatus === 'deleting' ? '#ef4444' : COLORS.cardBorder }}>
                          <button type="button" onClick={() => handleSelectCloudTournament(tournament.id)} className="text-left flex-1 hover:text-[#b6d2d4]">
                            <div className="font-black text-white">{tournament.name || tournament.id}</div>
                            <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>#{tournament.id}・{tournament.phase === 'finished' ? '已完賽' : `第 ${tournament.currentRoundNum || 1} 輪`}・{tournament.isArchived ? '已封存' : tournament.isPublic ? '公開' : '未公開'}</div>
                            {tournament.deletionStatus === 'deleting' && <div className="text-xs font-black text-red-300 mt-2">刪除未完成，請按永久刪除續跑</div>}
                          </button>
                          <div className="flex gap-2">
                            <button type="button" disabled={Boolean(seriesMutationStatus)} onClick={() => handleArchiveStandaloneTournament(tournament)}
                              className="px-3 py-2 rounded-lg border text-xs font-black disabled:opacity-40" style={{ borderColor: COLORS.cardBorder, color: COLORS.inkBlue }}>
                              {seriesMutationStatus === `archive:${tournament.id}` ? '處理中…' : tournament.isArchived ? '取消封存' : '封存'}
                            </button>
                            <button type="button" disabled={Boolean(seriesMutationStatus)} onClick={() => setConfirmAction({ type: 'DELETE_STANDALONE', tournament })}
                              className="px-3 py-2 rounded-lg border border-red-500/50 text-red-300 text-xs font-black disabled:opacity-40">永久刪除</button>
                          </div>
                        </article>
                      ))}
                      {visibleStandaloneTournaments.length === 0 && <div className="p-8 text-center border border-dashed rounded-xl" style={{ borderColor: COLORS.cardBorder, color: COLORS.textMuted }}>{standaloneTournaments.length ? '沒有符合條件的賽事' : '尚無獨立單場賽事'}</div>}
                    </div>
                  </section>
                    </>
                  )}
                </>
              )}
            </div>
        </FullScreenCloudManager>
      )}

      {renamePlayerId && (
        <div ref={renameDialogRef} className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="rename-player-title">
          <form onSubmit={confirmRenamePlayer} className="w-full max-w-md rounded-2xl p-7 border-2" style={{ backgroundColor: COLORS.card, borderColor: COLORS.inkBlue }}>
            <h2 id="rename-player-title" className="text-2xl font-black text-white">更改選手姓名</h2>
            <p className="mt-2 text-sm font-bold" style={{ color: COLORS.textMuted }}>已產生的對戰名稱會同步更新；選手 ID 與成績不變。</p>
            <input autoFocus value={renamePlayerName} onChange={event => setRenamePlayerName(event.target.value)} className="w-full mt-5 px-4 py-3 rounded-lg border font-black" aria-label="新的選手姓名" />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setRenamePlayerId(''); setRenamePlayerName(''); }} className="px-5 py-2.5 rounded-lg border" style={{ borderColor: COLORS.cardBorder }}>取消</button>
              <button type="submit" className="px-5 py-2.5 rounded-lg font-black" style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>儲存改名</button>
            </div>
          </form>
        </div>
      )}

      {/* 全局確認視窗 Modal (Highest Z-index) */}
      {confirmAction && (
        <div ref={confirmDialogRef} className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
          role="dialog" aria-modal="true" aria-labelledby="global-confirm-title"
          onKeyDown={event => { if (event.key === 'Escape' && !seriesMutationStatus) setConfirmAction(null); }}>
          <div className="rounded-2xl p-8 max-w-md w-full shadow-2xl transform transition-all border-2 brush-border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
            <div className="flex items-center gap-4 mb-6">
              <AlertTriangle size={32} style={{ color: COLORS.inkOrange }} />
              <h3 id="global-confirm-title" className="text-2xl font-black tracking-widest text-white">
                {confirmAction.type === 'EDIT_HISTORY' ? '修改歷史賽果' : confirmAction.type === 'CLEAR_PLAYERS' ? '清空選手名單' : confirmAction.type === 'WITHDRAW' ? `確定要讓 ${confirmAction.playerName} 棄賽嗎？` : confirmAction.type === 'CLEAR_SERIES_EVENT' ? `清除 ${confirmAction.eventDefinition.name}？` : confirmAction.type === 'DELETE_SERIES_EVENT' ? `刪除 ${confirmAction.eventDefinition.name}？` : confirmAction.type === 'DELETE_STANDALONE' ? `永久刪除 ${confirmAction.tournament.name || confirmAction.tournament.id}？` : ''}
              </h3>
            </div>
            <p className="mb-8 font-bold leading-relaxed text-base" style={{ color: COLORS.textMuted }}>
              {confirmAction.type === 'EDIT_HISTORY' ? '修改之前的賽果將會作廢並重新計算後續的所有賽程，您確定要覆寫此筆成績嗎？' : confirmAction.type === 'CLEAR_PLAYERS' ? '確定要清除所有已加入的選手嗎？此動作無法復原。' : confirmAction.type === 'WITHDRAW' ? `棄賽前已完成的成績會保留；本輪未完成的對戰將直接判為 0:${judgeCount} 敗，且退出後續輪次。` : confirmAction.type === 'CLEAR_SERIES_EVENT' ? '場次名稱、賽事代碼、賽制標籤與操作紀錄會保留；選手、輪次、比分與結果將全部重置並回到報名狀態。' : confirmAction.type === 'DELETE_SERIES_EVENT' ? `場次卡、雲端賽事、所有版本與操作紀錄都會永久刪除。賽事代碼 #${confirmAction.eventDefinition.eventCode} 之後可重新使用；中斷時可從場次卡續跑。` : confirmAction.type === 'DELETE_STANDALONE' ? `賽事 #${confirmAction.tournament.id}、所有版本與操作紀錄都會永久刪除。刪除中斷時可從列表續跑。` : ''}
            </p>

            <div className="flex justify-end gap-4">
              <button autoFocus onClick={() => setConfirmAction(null)} className="px-6 py-2.5 rounded-lg font-bold" style={{ backgroundColor: '#1e293b', color: COLORS.textMain }}>取消</button>
              <button
                disabled={Boolean(seriesMutationStatus)}
                onClick={async () => {
                  if (confirmAction.type === 'EDIT_HISTORY') applyHistoricalEdit(confirmAction.roundIndex, confirmAction.matchId, confirmAction.p1Score, confirmAction.p2Score);
                  else if (confirmAction.type === 'CLEAR_PLAYERS') { setPlayers([]); setRosterError(''); setConfirmAction(null); }
                  else if (confirmAction.type === 'WITHDRAW') confirmWithdraw(confirmAction.playerId);
                  else if (confirmAction.type === 'CLEAR_SERIES_EVENT') await handleClearSeriesEvent(confirmAction.series, confirmAction.eventDefinition, confirmAction.tournament);
                  else if (confirmAction.type === 'DELETE_SERIES_EVENT') await handleDeleteSeriesEvent(confirmAction.series, confirmAction.eventDefinition, confirmAction.tournament);
                  else if (confirmAction.type === 'DELETE_STANDALONE') await handleDeleteStandaloneTournament(confirmAction.tournament);
                }}
                className="px-6 py-2.5 rounded-lg font-black tracking-widest brush-border disabled:opacity-40"
                style={{ backgroundColor: (confirmAction.type === 'CLEAR_PLAYERS' || confirmAction.type === 'WITHDRAW' || confirmAction.type === 'DELETE_SERIES_EVENT' || confirmAction.type === 'DELETE_STANDALONE') ? '#ef4444' : COLORS.inkOrange, color: COLORS.bg }}>
                {seriesMutationStatus ? '處理中…' : '確定執行'}
              </button>
            </div>
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
            積分賽瑞士制配對系統
          </p>
          {activeCloudCode && <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border text-xs font-black tracking-widest" style={{ backgroundColor: COLORS.card, borderColor: COLORS.inkBlue, color: COLORS.inkBlue }}>
            雲端賽事 #{activeCloudCode}
            <span style={{ color: cloudSyncStatus === 'error' ? '#f87171' : cloudSyncStatus === 'offline' ? COLORS.inkOrange : '#4ade80' }}>
              {{ loading: '讀取中', pending: '同步中', offline: '離線', synced: '已同步', error: '同步失敗', local: '未選擇' }[cloudSyncStatus]}
            </span>
          </div>}
        </header>

        {activeCloudCode && shouldShowCloudSyncAlert({ isOnline, status: cloudSyncStatus, retryMessage: cloudRetryMessage }) && (
          <div role="status" className="max-w-4xl mx-auto mb-6 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{ backgroundColor: !isOnline || cloudSyncStatus === 'offline' ? '#3a2612' : '#29161a', borderColor: !isOnline || cloudSyncStatus === 'offline' ? COLORS.inkOrange : '#ef4444' }}>
            <div>
              <div className="font-black text-white">{!isOnline || cloudSyncStatus === 'offline' ? '目前離線，管理功能已切換為唯讀' : cloudSyncStatus === 'error' ? '雲端同步尚未完成' : '雲端連線暫時不穩定，正在自動重試'}</div>
              <div className="text-xs font-bold mt-1" style={{ color: COLORS.textMuted }}>
                {cloudRetryMessage || (lastCloudSuccessAt ? `最後成功同步：${lastCloudSuccessAt.toLocaleTimeString('zh-TW')}` : '等待第一次成功同步')}
              </div>
            </div>
            {isOnline && cloudSyncStatus === 'error' && <button type="button" onClick={() => flushCloudSyncRef.current?.()} className="px-4 py-2 rounded-lg font-black bg-white text-black">重新同步</button>}
          </div>
        )}

        <div aria-disabled={isEditorReadOnly} className={isEditorReadOnly ? 'pointer-events-none opacity-70' : ''}>

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
                    <input type="text" value={newName} onChange={(e) => { setNewName(e.target.value); setRosterError(''); }} disabled={players.length >= MAX_PLAYERS}
                      className="w-full px-4 py-3 rounded-lg border font-bold text-lg disabled:opacity-40" placeholder={players.length >= MAX_PLAYERS ? '名單已達 32 人上限' : '輸入名字...'} />
                  </div>
                  <button type="submit" disabled={players.length >= MAX_PLAYERS} className="w-full font-black py-4 rounded-xl transition-all text-lg tracking-widest mt-4 brush-border disabled:opacity-40"
                    style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg }}>
                    加入名單 ADD
                  </button>
                </form>
                {rosterError && <div role="alert" className="mt-4 p-3 rounded-lg border border-amber-500/40 bg-amber-950/30 text-amber-200 text-sm font-bold">{rosterError}</div>}

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

                <fieldset className="mt-8 pt-8 border-t border-dashed" style={{ borderColor: COLORS.cardBorder }}>
                  <legend className="block text-sm font-bold px-2 tracking-widest" style={{ color: COLORS.textMuted }}>淘汰規則</legend>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {[false, true].map(enabled => (
                      <button key={String(enabled)} type="button" onClick={() => {
                        markCloudAudit('DOUBLE_ELIMINATION_CHANGED', { before: doubleElimination, after: enabled });
                        setDoubleElimination(enabled);
                        setPlayers(current => applyDoubleElimination(current, rounds, enabled));
                      }}
                        aria-pressed={doubleElimination === enabled}
                        className="py-3 rounded-xl border font-black tracking-widest transition-all"
                        style={{
                          backgroundColor: doubleElimination === enabled ? COLORS.inkOrange : 'transparent',
                          borderColor: doubleElimination === enabled ? COLORS.inkOrange : COLORS.cardBorder,
                          color: doubleElimination === enabled ? COLORS.bg : COLORS.textMuted
                        }}>
                        {enabled ? '兩敗淘汰' : '不淘汰'}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-bold leading-relaxed" style={{ color: COLORS.textMuted }}>
                    {doubleElimination ? '選手累積第 2 敗後會自動淘汰，不參與後續輪次。' : '所有未棄賽選手都會參與三輪賽事。'}
                  </p>
                </fieldset>

                <div className="mt-8 pt-8 border-t border-dashed flex flex-col gap-3" style={{ borderColor: COLORS.cardBorder }}>
                  <label className={`w-full font-bold py-3 rounded-xl transition-colors text-sm tracking-widest border border-dashed flex items-center justify-center gap-2 ${players.length >= MAX_PLAYERS ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-white/5'}`}
                    style={{ backgroundColor: 'transparent', color: COLORS.inkOrange, borderColor: COLORS.inkOrange }}>
                    <Upload size={18} />
                    匯入 CSV 選手名單
                    <input type="file" accept=".csv" onChange={handleFileUpload} disabled={players.length >= MAX_PLAYERS} className="hidden" />
                  </label>
                  
                  <button onClick={loadMockData} className="w-full font-bold py-3 rounded-xl transition-colors text-sm tracking-widest border border-dashed hover:bg-white/5"
                    style={{ backgroundColor: mockConfirmUntil > Date.now() ? '#7f1d1d' : 'transparent', color: mockConfirmUntil > Date.now() ? '#fecaca' : COLORS.inkBlue, borderColor: mockConfirmUntil > Date.now() ? '#ef4444' : COLORS.inkBlue }}>
                    {mockConfirmUntil > Date.now() ? `再次點擊確認覆蓋目前 ${players.length} 人名單` : '載入測試名單 (8人)'}
                  </button>
                  {mockConfirmUntil > Date.now() && <p className="text-xs font-black text-red-300 text-center">此操作會刪除目前名單；10 秒後自動取消。</p>}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="p-8 rounded-2xl border h-full brush-border shadow-xl" style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <h2 className="text-xl font-black flex items-center gap-3 tracking-widest" style={{ color: COLORS.inkOrange }}>
                    <Users size={24} /> 參賽陣容 ({players.length}/{MAX_PLAYERS})
                  </h2>
                  <div className="flex gap-3 w-full sm:w-auto">
                    {players.length > 0 && (
                      <button onClick={() => setConfirmAction({ type: 'CLEAR_PLAYERS' })}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all hover:bg-red-500/10 border border-dashed text-sm tracking-widest flex-1 sm:flex-none"
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}>
                        <Trash2 size={18} /> 清空名單
                      </button>
                    )}
                    <button onClick={startTournament} disabled={players.length < 2 || isTransitioning}
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
                              <button onClick={() => openRenamePlayer(p)} className="mr-4 font-bold text-sm tracking-widest" style={{ color: COLORS.inkBlue }}>改名</button>
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
                <span className="flex items-center px-5 text-sm font-black tracking-widest" style={{ color: COLORS.inkOrange }}>{judgeCount} 位評審制・{doubleElimination ? '兩敗淘汰' : '不淘汰'}</span>
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
                          <button onClick={advanceToNextRound} disabled={isTransitioning || !roundMatches.every(m => m.p1Votes !== null && m.p2Votes !== null)}
                            className="flex items-center gap-2 px-8 py-3 rounded-xl font-black uppercase tracking-widest transition-all disabled:opacity-30 brush-border"
                            style={{ backgroundColor: COLORS.inkBlue, color: COLORS.bg }}>
                            {isTransitioning ? '處理中…' : currentRoundNum === MAX_ROUNDS ? '結算賽事' : '下一輪'} <ChevronRight size={20} />
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
                                {p.isEliminated && <span className="text-sm text-amber-300 ml-2 border border-amber-500/30 px-1 rounded whitespace-nowrap">兩敗淘汰</span>}
                              </div>
                              {!p.isWithdrawn && !p.isEliminated && p.needsTiebreaker && <span className="text-[10px] px-1.5 py-0.5 rounded font-black tracking-wider whitespace-nowrap" style={{backgroundColor: COLORS.inkOrange, color: COLORS.bg}}>需加賽</span>}
                            </div>
                            {!p.isWithdrawn && <div className="text-[10px] font-bold mt-1 whitespace-nowrap" style={{ color: COLORS.textMuted }}>
                              {doubleElimination && `${p.losses || 0} 敗 · `}對手勝率 {(p.opponentWinRate * 100).toFixed(1)}% · 次級 {(p.opponentsOpponentWinRate * 100).toFixed(1)}%
                            </div>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-base whitespace-nowrap" style={{ color: p.displayRank <= 2 && !p.isWithdrawn ? COLORS.inkOrange : COLORS.inkBlue }}>{p.wins} W</div>
                          <div className="text-xs font-bold whitespace-nowrap" style={{ color: COLORS.textMuted }}>{p.votes} 票</div>
                        </div>
                        {!p.isWithdrawn && !p.isEliminated && <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => openRenamePlayer(p)} className="px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors" style={{ color: COLORS.inkBlue, borderColor: COLORS.inkBlue }}>改名</button>
                          <button onClick={() => setConfirmAction({ type: 'WITHDRAW', playerId: p.id, playerName: p.name })} className="px-1.5 py-0.5 text-[10px] font-bold text-red-400 hover:bg-red-500/20 rounded border border-red-500/30 transition-colors">棄賽</button>
                        </div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3: Finished / Standings */}
        {phase === 'finished' && (isCorrectionMode ? (
          <ResultCorrectionPanel
            players={players}
            rounds={rounds}
            judgeCount={judgeCount}
            doubleElimination={doubleElimination}
            versions={cloudVersions}
            runId={runId}
            currentVersion={currentVersion}
            otherSeriesPlayerNames={otherSeriesPlayerNames}
            busy={isTransitioning}
            onCancel={() => setIsCorrectionMode(false)}
            onCommit={commitResultCorrection}
            onRestore={restoreResultVersion}
          />
        ) : (
          <div className="space-y-12 max-w-7xl mx-auto flex flex-col items-center">
            
            {/* 最終排名區塊 */}
            <div className="w-full max-w-6xl p-10 md:p-14 rounded-3xl shadow-2xl text-center relative overflow-hidden border-2 brush-border"
                 style={{ backgroundColor: COLORS.card, borderColor: COLORS.inkOrange }}>
              <div className="absolute top-0 left-0 w-full h-3" style={{ background: `linear-gradient(90deg, ${COLORS.inkOrange}, ${COLORS.inkBlue})` }}></div>
              
              <Medal size={64} className="mx-auto mb-6" style={{ color: COLORS.inkOrange }} />
              <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-[0.2em] text-white">賽事<span style={{color: COLORS.inkBlue}}>結果</span></h2>
              <p className="font-bold tracking-widest mb-10 text-lg" style={{ color: COLORS.textMuted }}>積分賽・{judgeCount} 位評審制・{doubleElimination ? '兩敗淘汰' : '不淘汰'}・最終結果</p>
              <p className="-mt-7 mb-8 text-sm font-bold" style={{ color: COLORS.inkBlue }}>名次積分採 32 人制固定級距；參賽不足 32 人仍按實際名次計算。</p>

              <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: COLORS.cardBorder }}>
                <table className="w-full text-left border-collapse bg-black/40">
                  <thead>
                    <tr className="uppercase tracking-widest text-sm border-b" style={{ backgroundColor: '#111318', color: COLORS.textMuted, borderColor: COLORS.cardBorder }}>
                      <th className="p-5 font-black text-center">RANK</th>
                      <th className="p-5 font-black">NAME</th>
                      <th className="p-5 font-black text-center whitespace-nowrap">WINS</th>
                      {doubleElimination && <th className="p-5 font-black text-center whitespace-nowrap">LOSSES</th>}
                      <th className="p-5 font-black text-center whitespace-nowrap">VOTES</th>
                      <th className="p-5 font-black text-center whitespace-nowrap">積分</th>
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
                            <span style={{ color: p.displayRank <= 2 && !p.isWithdrawn ? COLORS.inkOrange : 'white' }}>{p.name} {p.isWithdrawn && <span className="text-sm text-red-400 ml-2 border border-red-500/30 px-1 rounded whitespace-nowrap">已棄賽</span>} {p.isEliminated && <span className="text-sm text-amber-300 ml-2 border border-amber-500/30 px-1 rounded whitespace-nowrap">兩敗淘汰</span>}</span>
                            {!p.isWithdrawn && !p.isEliminated && p.needsTiebreaker && <span className="text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-widest whitespace-nowrap" style={{backgroundColor: COLORS.inkOrange, color: COLORS.bg}}>需加賽</span>}
                          </div>
                        </td>
                        <td className="p-5 text-center font-black text-2xl whitespace-nowrap" style={{ color: p.displayRank <= 2 && !p.isWithdrawn ? COLORS.inkOrange : COLORS.inkBlue }}>{p.wins}</td>
                        {doubleElimination && <td className="p-5 text-center font-black text-xl whitespace-nowrap" style={{ color: p.isEliminated ? COLORS.inkOrange : COLORS.textMuted }}>{p.losses || 0}</td>}
                        <td className="p-5 text-center font-black text-lg whitespace-nowrap" style={{ color: COLORS.textMuted }}>{p.votes}</td>
                        <td className="p-5 text-center font-black text-2xl whitespace-nowrap" style={{ color: p.rankingPoints > 0 ? COLORS.inkOrange : COLORS.textMuted }}>{p.rankingPoints}</td>
                        <td className="p-5 text-center font-bold whitespace-nowrap" style={{ color: COLORS.textMuted }}>{p.isWithdrawn ? '—' : `${(p.opponentWinRate * 100).toFixed(1)}%`}</td>
                        <td className="p-5 text-center font-bold whitespace-nowrap" style={{ color: COLORS.textMuted }}>{p.isWithdrawn ? '—' : `${(p.opponentsOpponentWinRate * 100).toFixed(1)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-12 flex justify-center">
                {resultLocked && <button onClick={() => setIsCorrectionMode(true)}
                  className="mr-3 px-6 py-4 rounded-xl font-black border-2"
                  style={{ borderColor: COLORS.inkBlue, color: COLORS.inkBlue }}>
                  更正結果・查看版本（v{currentVersion}）
                </button>}
                <button onClick={handleLeaveCloudTournament}
                  className="pointer-events-auto flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-black text-lg tracking-widest transition-all brush-border border-2"
                  style={{ backgroundColor: COLORS.inkOrange, color: COLORS.bg, borderColor: COLORS.inkOrange }}>
                  <Home size={22} /> {activeSeries ? `回到${activeSeries.name}系列賽首頁` : '回到賽事管理首頁'}
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
        ))}

        </div>

      </div>
    </div>
  );
}

function AdminPortal() {
  const [adminUser, setAdminUser] = useState(undefined);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = '黑馬記念｜賽事管理後台';
  }, []);

  useEffect(() => subscribeAuth(setAdminUser), []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const user = await signInAdminWithToken(token);
      setAdminUser(user);
      setToken('');
    } catch (loginError) {
      setError(getAdminLoginErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (adminUser === undefined) {
    return <main className="min-h-screen bg-[#0d0f12] text-slate-400 flex items-center justify-center font-bold">正在確認管理權限…</main>;
  }

  if (adminUser) return <TournamentAdminApp authenticatedUser={adminUser} />;

  return (
    <main className="min-h-screen bg-[#0d0f12] text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md bg-[#161920] border-2 border-[#2a303c] rounded-2xl p-8 shadow-2xl">
        <a href={window.location.pathname} className="text-sm font-bold text-slate-500 hover:text-slate-200">← 返回公開前台</a>
        <h1 className="text-3xl font-black mt-6">賽事管理後台</h1>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">輸入管理 token 後才能建立或操作賽事。</p>
        <div className="mt-5 p-4 rounded-lg border border-slate-700 bg-[#0d0f12] text-xs text-slate-400 leading-relaxed">
          管理 token 由賽事主辦單位提供。登入後可建立、管理與更正賽事；請勿將 token 分享給觀眾。設定或登入異常請參考專案的 Firebase 疑難排解文件。
        </div>
        {!isFirebaseConfigured && <div role="alert" className="mt-5 p-3 rounded-lg border border-amber-500/40 bg-amber-950/30 text-amber-200 text-sm font-bold">此環境尚未設定 Firebase。</div>}
        {error && <div role="alert" className="mt-5 p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-red-300 text-sm font-bold">{error}</div>}
        <form onSubmit={handleSubmit} className="mt-7">
          <label htmlFor="portal-admin-token" className="block font-black mb-2">管理 token</label>
          <input id="portal-admin-token" type="password" value={token} onChange={event => setToken(event.target.value)}
            autoComplete="current-password" placeholder="輸入共用管理 token"
            className="w-full px-4 py-3 rounded-lg border border-slate-700 bg-[#0d0f12]" />
          <button type="submit" disabled={isSubmitting || !token.trim()} className="w-full mt-4 py-3 rounded-lg bg-[#b6d2d4] text-[#0d0f12] font-black disabled:opacity-40">
            {isSubmitting ? '驗證中…' : '登入管理後台'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('admin')) return <AdminPortal />;
  const publicSeriesCode = params.get('series');
  if (publicSeriesCode !== null) return <PublicSeriesPage initialCode={publicSeriesCode} />;
  const publicEventCode = params.get('event');
  return <PublicTournamentPage initialCode={publicEventCode || ''} />;
}
