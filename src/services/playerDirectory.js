import { collection, connectFirestoreEmulator, doc, getDocs, getFirestore, runTransaction } from 'firebase/firestore/lite';
import { getFirebaseServices } from '../firebase';
import { createId } from '../tournamentState';
import { normalizeIdentity, resolveIdentity } from '../playerIdentity';

// Lite performs server reads. Private records never enter the public pages' persistent cache.
const connectedPreviews = new WeakSet();
const privateDb = () => {
  const { app, localPreview } = getFirebaseServices();
  const db = getFirestore(app);
  if (localPreview && !connectedPreviews.has(db)) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectedPreviews.add(db);
  }
  return db;
};
const listeners = new Set();
export function subscribePlayers(onPlayers, onError) {
  let active = true,
    request = 0;
  const refresh = async () => {
    const sequence = ++request;
    try {
      const snapshot = await getDocs(collection(privateDb(), 'privatePlayers'));
      if (active && sequence === request) onPlayers(snapshot.docs.map((item) => item.data()));
    } catch (error) {
      if (active) onError(error);
    }
  };
  listeners.add(refresh);
  window.addEventListener('focus', refresh);
  refresh();
  return () => {
    active = false;
    listeners.delete(refresh);
    window.removeEventListener('focus', refresh);
  };
}

const keysFor = (profile) => ['name-' + encodeURIComponent(profile.realName), 'phone-' + profile.phone];
export async function saveIdentity(input, decision) {
  const row = normalizeIdentity(input);
  const db = privateDb();
  const newId = createId();
  const player = await runTransaction(db, async (tx) => {
    const indices = new Map();
    const readIndex = async (key) => {
      if (!indices.has(key)) {
        const snapshot = await tx.get(doc(db, 'privatePlayerIndex', key));
        indices.set(key, snapshot.data()?.ids || []);
      }
    };
    const keys = keysFor(row);
    await Promise.all(keys.map(readIndex));
    const candidates = await Promise.all(
      [...new Set(keys.flatMap((key) => indices.get(key)))].map(async (id) =>
        (await tx.get(doc(db, 'privatePlayers', id))).data()
      )
    );
    const profile = resolveIdentity(candidates, row, newId, decision);
    const previous = candidates.find((p) => p.id === profile.id);
    const oldKeys = previous ? keysFor(previous) : [];
    await Promise.all(oldKeys.map(readIndex));
    for (const [key, ids] of indices) {
      const linked = keys.includes(key);
      if (linked === ids.includes(profile.id)) continue;
      const ref = doc(db, 'privatePlayerIndex', key);
      const updated = linked ? [...ids, profile.id] : ids.filter((id) => id !== profile.id);
      if (updated.length) tx.set(ref, { ids: updated });
      else tx.delete(ref);
    }
    tx.set(doc(db, 'privatePlayers', profile.id), profile);
    return { id: profile.id, name: profile.name };
  });
  listeners.forEach((refresh) => refresh());
  return player;
}
