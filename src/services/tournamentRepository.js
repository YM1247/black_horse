import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut
} from 'firebase/auth';
import {
  getFirebaseServices,
  isFirebaseConfigured
} from '../firebase';

const EVENT_CODE_PATTERN = /^[A-Z0-9]{4,10}$/;
const EVENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEFAULT_CLOUD_TOURNAMENT_VISIBILITY = true;
export const ADMIN_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export class CloudRevisionConflictError extends Error {
  constructor({ expectedRevision, actualRevision, tournament }) {
    super('資料已由其他裝置更新，請重新確認尚未同步的操作。');
    this.name = 'CloudRevisionConflictError';
    this.code = 'cloud/revision-conflict';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
    this.tournament = tournament;
  }
}

const cleanData = (value) => JSON.parse(JSON.stringify(value));

// Firestore 不允許 rounds: Match[][] 這種直接巢狀陣列，因此以輪次編號 map 保存。
export const encodeTournamentForFirestore = (tournament = {}) => {
  const encoded = cleanData(tournament);
  if (Array.isArray(encoded.rounds)) {
    encoded.rounds = Object.fromEntries(
      encoded.rounds.map((matches, index) => [String(index + 1), Array.isArray(matches) ? matches : []])
    );
  }
  return encoded;
};

export const decodeTournamentFromFirestore = (tournament = {}) => {
  if (!Object.prototype.hasOwnProperty.call(tournament, 'rounds')) return tournament;

  let rounds = [];
  if (Array.isArray(tournament.rounds)) {
    // 相容早期空陣列，以及曾經使用 { matches } 包裝的開發資料。
    rounds = tournament.rounds.map(round => Array.isArray(round) ? round : (Array.isArray(round?.matches) ? round.matches : []));
  } else if (tournament.rounds && typeof tournament.rounds === 'object') {
    rounds = Object.entries(tournament.rounds)
      .sort(([first], [second]) => Number(first) - Number(second))
      .map(([, matches]) => Array.isArray(matches) ? matches : []);
  }

  return { ...tournament, rounds };
};

export const encodeSeriesForFirestore = (series = {}) => cleanData({
  name: String(series.name || '').trim(),
  description: String(series.description || '').trim(),
  events: (Array.isArray(series.events) ? series.events : []).map(event => ({
    id: String(event.id || '').trim(),
    name: String(event.name || '').trim(),
    eventCode: normalizeEventCode(event.eventCode),
    judgeCount: Number(event.judgeCount) === 5 ? 5 : 3,
    doubleElimination: event.doubleElimination !== false
  })),
  ...(series.publicCode ? { publicCode: normalizeEventCode(series.publicCode) } : {}),
  ...(typeof series.isPublic === 'boolean' ? { isPublic: series.isPublic } : {})
});

export const normalizeEventCode = (value = '') => value.trim().toUpperCase();

export const validateEventCode = (value) => EVENT_CODE_PATTERN.test(normalizeEventCode(value));

export const generateEventCode = (length = 6, random = Math.random) =>
  Array.from({ length }, () => EVENT_CODE_ALPHABET[Math.floor(random() * EVENT_CODE_ALPHABET.length)]).join('');

export const hashAdminToken = async (token) => {
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new Error('請輸入管理 token。');
  if (!window.crypto?.subtle) throw new Error('目前瀏覽器不支援安全 token 驗證。');
  const bytes = new TextEncoder().encode(normalizedToken);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const getAdminLoginErrorMessage = (error = {}) => {
  switch (error.code) {
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Firebase Authentication 尚未啟用「匿名」登入方式，請先在 Firebase Console 啟用 Anonymous provider。';
    case 'auth/network-request-failed':
    case 'unavailable':
      return '目前無法連線 Firebase，請確認網路後再試。';
    case 'auth/too-many-requests':
      return '登入嘗試次數過多，Firebase 已暫時限制請求，請稍後再試。';
    case 'admin/token-rejected':
    case 'permission-denied':
      return '管理 token 驗證失敗。請確認 Firestore 的 settings/admin.tokenHash 是原始 token 的 64 字元 SHA-256，而不是原始 token。';
    default:
      return error.message || '登入失敗，請確認管理 token 與 Firebase 設定。';
  }
};

const requireUser = () => {
  const { auth } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('管理員尚未登入。');
  return auth.currentUser;
};

const createAuditLog = (batch, tournamentRef, user, action, details, clientOperationId = '') => {
  const auditRef = doc(collection(tournamentRef, 'auditLogs'));
  batch.set(auditRef, {
    action,
    details: cleanData(details),
    createdAt: serverTimestamp(),
    clientTimestamp: new Date().toISOString(),
    createdBy: user.uid,
    ...(clientOperationId ? { clientOperationId } : {})
  });
};

export const signInAdminWithToken = async (token) => {
  const { auth, db } = getFirebaseServices();
  const tokenHash = await hashAdminToken(token);
  try {
    let user = auth.currentUser;
    if (!user?.isAnonymous) {
      if (user) await signOut(auth);
      user = (await signInAnonymously(auth)).user;
    }
    const sessionRef = doc(db, 'adminSessions', user.uid);
    try {
      // token 輪替後舊 session 會失效；先移除自己的舊文件，避免禁止 update 的 Rules 阻擋重新登入。
      await deleteDoc(sessionRef).catch(() => {});
      await setDoc(sessionRef, {
        tokenHash,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + ADMIN_SESSION_DURATION_MS)
      });
      await getDocFromServer(sessionRef);
    } catch (error) {
      if (error.code === 'permission-denied') {
        const tokenError = new Error('管理 token 或 Firestore 管理設定不正確。');
        tokenError.code = 'admin/token-rejected';
        throw tokenError;
      }
      throw error;
    }
    return user;
  } catch (error) {
    // 保留匿名 UID，讓後續重試不會反覆建立匿名帳號消耗配額。
    throw error;
  }
};

export const signOutAdmin = async () => {
  const { auth, db } = getFirebaseServices();
  const user = auth.currentUser;
  if (user) await deleteDoc(doc(db, 'adminSessions', user.uid)).catch(() => {});
  return signOut(auth);
};

export const subscribeAuth = (callback) => {
  if (!isFirebaseConfigured) {
    callback(null);
    return () => {};
  }
  const { auth, db } = getFirebaseServices();
  let unsubscribeSession = () => {};
  const unsubscribeAuth = onAuthStateChanged(auth, user => {
    unsubscribeSession();
    if (!user) {
      callback(null);
      return;
    }
    unsubscribeSession = onSnapshot(doc(db, 'adminSessions', user.uid), snapshot => {
      const expiresAt = snapshot.data()?.expiresAt?.toMillis?.() || 0;
      callback(snapshot.exists() && expiresAt > Date.now() ? user : null);
    }, () => callback(null));
  });
  return () => {
    unsubscribeSession();
    unsubscribeAuth();
  };
};

export const createCloudTournament = async ({ eventCode, name, tournament }) => {
  const code = normalizeEventCode(eventCode);
  if (!validateEventCode(code)) throw new Error('賽事代碼需為 4–10 位英文字母或數字。');
  const user = requireUser();
  const { db } = getFirebaseServices();
  const tournamentRef = doc(db, 'tournaments', code);
  const now = new Date().toISOString();
  await runTransaction(db, async transaction => {
    const existing = await transaction.get(tournamentRef);
    if (existing.exists()) throw new Error('此賽事代碼已存在，請更換代碼。');
    transaction.set(tournamentRef, {
      ...encodeTournamentForFirestore(tournament),
      eventCode: code,
      name: name.trim() || code,
      isPublic: DEFAULT_CLOUD_TOURNAMENT_VISIBILITY,
      revision: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      clientUpdatedAt: now,
      updatedBy: user.uid
    });
    createAuditLog(transaction, tournamentRef, user, 'TOURNAMENT_CREATED', { name, eventCode: code });
  });
  return code;
};

export const saveCloudTournament = async (eventCode, tournament, audits, expectedRevision = null) => {
  const code = normalizeEventCode(eventCode);
  if (!validateEventCode(code)) throw new Error('賽事代碼格式錯誤。');
  const user = requireUser();
  const { db } = getFirebaseServices();
  const tournamentRef = doc(db, 'tournaments', code);
  const auditEntries = (Array.isArray(audits) ? audits : [audits]).filter(Boolean);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(tournamentRef);
    if (!snapshot.exists()) throw new Error('找不到指定的雲端賽事。');
    const actualRevision = Number(snapshot.data().revision) || 0;
    if (expectedRevision !== null && Number(expectedRevision) !== actualRevision) {
      throw new CloudRevisionConflictError({
        expectedRevision: Number(expectedRevision),
        actualRevision,
        tournament: decodeTournamentFromFirestore({ id: snapshot.id, ...snapshot.data() })
      });
    }
    const nextRevision = actualRevision + 1;
    transaction.set(tournamentRef, {
      ...encodeTournamentForFirestore(tournament),
      eventCode: code,
      revision: nextRevision,
      updatedAt: serverTimestamp(),
      clientUpdatedAt: new Date().toISOString(),
      updatedBy: user.uid
    }, { merge: true });
    auditEntries.forEach(audit => createAuditLog(
      transaction,
      tournamentRef,
      user,
      audit.action,
      audit.details || {},
      audit.clientOperationId
    ));
    return nextRevision;
  });
};

export const subscribeTournament = (eventCode, onTournament, onError) => {
  const code = normalizeEventCode(eventCode);
  if (!validateEventCode(code)) throw new Error('賽事代碼格式錯誤。');
  const { db } = getFirebaseServices();
  return onSnapshot(doc(db, 'tournaments', code), { includeMetadataChanges: true }, snapshot => {
    onTournament(snapshot.exists() ? decodeTournamentFromFirestore({
      id: snapshot.id,
      ...snapshot.data(),
      sync: {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites
      }
    }) : null);
  }, onError);
};

export const subscribeAdminTournaments = (onTournaments, onError) => {
  const { db } = getFirebaseServices();
  const tournamentsQuery = query(collection(db, 'tournaments'), orderBy('updatedAt', 'desc'));
  return onSnapshot(tournamentsQuery, { includeMetadataChanges: true }, snapshot => {
    onTournaments(snapshot.docs.map(item => decodeTournamentFromFirestore({ id: item.id, ...item.data() })));
  }, onError);
};

export const subscribeCloudSeries = (seriesId, onSeries, onError) => {
  const { db } = getFirebaseServices();
  return onSnapshot(doc(db, 'series', seriesId), snapshot => {
    onSeries(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, onError);
};

export const saveCloudSeries = async (series, expectedRevision = null) => {
  const user = requireUser();
  const { db } = getFirebaseServices();
  const seriesRef = doc(db, 'series', series.id);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(seriesRef);
    const actualRevision = snapshot.exists() ? Number(snapshot.data().revision) || 0 : 0;
    if (expectedRevision !== null && Number(expectedRevision) !== actualRevision) {
      const error = new Error('系列場次已由其他裝置更新，請重新載入後再試。');
      error.code = 'cloud/series-revision-conflict';
      error.actualRevision = actualRevision;
      throw error;
    }
    const nextRevision = actualRevision + 1;
    transaction.set(seriesRef, {
      ...encodeSeriesForFirestore(series),
      revision: nextRevision,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid
    });
    return nextRevision;
  });
};

export const deleteCloudTournament = async (eventCode) => {
  const code = normalizeEventCode(eventCode);
  if (!validateEventCode(code)) throw new Error('賽事代碼格式錯誤。');
  requireUser();
  const { db } = getFirebaseServices();
  const tournamentRef = doc(db, 'tournaments', code);
  const auditSnapshot = await getDocs(collection(tournamentRef, 'auditLogs'));
  const auditDocs = auditSnapshot.docs;

  for (let index = 0; index < auditDocs.length; index += 400) {
    const batch = writeBatch(db);
    auditDocs.slice(index, index + 400).forEach(audit => batch.delete(audit.ref));
    await batch.commit();
  }
  await deleteDoc(tournamentRef);
};

export const subscribeTournamentAuditLogs = (eventCode, onLogs, onError, maximum = 50) => {
  const code = normalizeEventCode(eventCode);
  if (!validateEventCode(code)) throw new Error('賽事代碼格式錯誤。');
  const { db } = getFirebaseServices();
  const auditQuery = query(
    collection(db, 'tournaments', code, 'auditLogs'),
    orderBy('createdAt', 'desc'),
    limit(maximum)
  );
  return onSnapshot(auditQuery, snapshot => {
    onLogs(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
};
