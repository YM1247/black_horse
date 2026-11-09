import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { getFirebaseServices } from '../firebase';
import { createId } from '../tournamentState';
import { resolveIdentity } from '../playerIdentity';

// The season's maximum 192 entries fit in one private directory. Reading it
// inside the transaction also serializes concurrent registrations and renames.
const directoryRef = () => doc(getFirebaseServices().db, 'privatePlayers', 'directory');
export const subscribePlayers = (onPlayers, onError) => onSnapshot(directoryRef(), snap => onPlayers(Object.values(snap.data()?.profiles || {})), onError);

export function saveIdentity(row, decision) {
  const ref = directoryRef();
  const newId = createId();
  return runTransaction(getFirebaseServices().db, async tx => {
    const snapshot = await tx.get(ref);
    const profiles = snapshot.data()?.profiles || {};
    const profile = resolveIdentity(Object.values(profiles), row, newId, decision);
    tx.set(ref, { profiles: { ...profiles, [profile.id]: profile } });
    return { id: profile.id, name: profile.name };
  });
}
