import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  firebaseAdminEmail,
  getFirebaseServices,
  isFirebaseConfigured
} from '../firebase';

const EVENT_CODE_PATTERN = /^[A-Z0-9]{4,10}$/;
const EVENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const cleanData = (value) => JSON.parse(JSON.stringify(value));

export const normalizeEventCode = (value = '') => value.trim().toUpperCase();

export const validateEventCode = (value) => EVENT_CODE_PATTERN.test(normalizeEventCode(value));

export const generateEventCode = (length = 6, random = Math.random) =>
  Array.from({ length }, () => EVENT_CODE_ALPHABET[Math.floor(random() * EVENT_CODE_ALPHABET.length)]).join('');

const requireUser = () => {
  const { auth } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('管理員尚未登入。');
  return auth.currentUser;
};

const createAuditLog = (batch, tournamentRef, user, action, details) => {
  const auditRef = doc(collection(tournamentRef, 'auditLogs'));
  batch.set(auditRef, {
    action,
    details: cleanData(details),
    createdAt: serverTimestamp(),
    clientTimestamp: new Date().toISOString(),
    createdBy: user.uid
  });
};

export const signInAdminWithToken = async (token) => {
  if (!token) throw new Error('請輸入管理 token。');
  const { auth } = getFirebaseServices();
  return signInWithEmailAndPassword(auth, firebaseAdminEmail, token);
};

export const signOutAdmin = () => {
  const { auth } = getFirebaseServices();
  return signOut(auth);
};

export const subscribeAuth = (callback) => {
  if (!isFirebaseConfigured) {
    callback(null);
    return () => {};
  }
  const { auth } = getFirebaseServices();
  return onAuthStateChanged(auth, callback);
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
      ...cleanData(tournament),
      eventCode: code,
      name: name.trim() || code,
      isPublic: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      clientUpdatedAt: now,
      updatedBy: user.uid
    });
    createAuditLog(transaction, tournamentRef, user, 'TOURNAMENT_CREATED', { name, eventCode: code });
  });
  return code;
};

export const saveCloudTournament = async (eventCode, tournament, audit) => {
  const code = normalizeEventCode(eventCode);
  if (!validateEventCode(code)) throw new Error('賽事代碼格式錯誤。');
  const user = requireUser();
  const { db } = getFirebaseServices();
  const tournamentRef = doc(db, 'tournaments', code);
  const batch = writeBatch(db);

  batch.set(tournamentRef, {
    ...cleanData(tournament),
    eventCode: code,
    updatedAt: serverTimestamp(),
    clientUpdatedAt: new Date().toISOString(),
    updatedBy: user.uid
  }, { merge: true });
  createAuditLog(batch, tournamentRef, user, audit.action, audit.details || {});
  await batch.commit();
};

export const subscribeTournament = (eventCode, onTournament, onError) => {
  const code = normalizeEventCode(eventCode);
  if (!validateEventCode(code)) throw new Error('賽事代碼格式錯誤。');
  const { db } = getFirebaseServices();
  return onSnapshot(doc(db, 'tournaments', code), { includeMetadataChanges: true }, snapshot => {
    onTournament(snapshot.exists() ? {
      id: snapshot.id,
      ...snapshot.data(),
      sync: {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites
      }
    } : null);
  }, onError);
};

export const subscribeAdminTournaments = (onTournaments, onError) => {
  const { db } = getFirebaseServices();
  const tournamentsQuery = query(collection(db, 'tournaments'), orderBy('updatedAt', 'desc'));
  return onSnapshot(tournamentsQuery, { includeMetadataChanges: true }, snapshot => {
    onTournaments(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
};
