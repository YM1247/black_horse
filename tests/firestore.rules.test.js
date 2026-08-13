import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch
} from 'firebase/firestore';

const PROJECT_ID = 'black-horse-rules-test';
const TOKEN_HASH = 'a'.repeat(64);
const ROTATED_TOKEN_HASH = 'b'.repeat(64);
let testEnvironment;

const baseTournament = (overrides = {}) => ({
  eventCode: 'RULES1',
  name: '規則測試',
  isPublic: true,
  revision: 1,
  phase: 'playing',
  players: [{ id: 'a', name: '甲', wins: 0, votes: 0, losses: 0, isWithdrawn: false, isEliminated: false }],
  rounds: {},
  currentRoundNum: 1,
  judgeCount: 3,
  doubleElimination: true,
  runId: 'run-1',
  runNumber: 1,
  resultLocked: false,
  currentVersion: 0,
  currentVersionId: '',
  updatedBy: 'admin-user',
  ...overrides
});

const seedAdmin = async ({ tokenHash = TOKEN_HASH, expiresAt = Date.now() + 60 * 60 * 1000 } = {}) => {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'settings', 'admin'), { tokenHash });
    await setDoc(doc(db, 'adminSessions', 'admin-user'), {
      tokenHash: TOKEN_HASH,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(expiresAt)
    });
  });
};

const seedTournament = async (data = baseTournament()) => {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'tournaments', data.eventCode), data);
  });
};

beforeAll(async () => {
  const hostAndPort = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: hostAndPort[0],
      port: Number(hostAndPort[1]),
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
    }
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

test('outdated revision is rejected while a transaction increments the current revision', async () => {
  await seedAdmin();
  await seedTournament(baseTournament({ revision: 3 }));
  const db = testEnvironment.authenticatedContext('admin-user').firestore();
  const tournamentRef = doc(db, 'tournaments', 'RULES1');

  await assertFails(updateDoc(tournamentRef, { name: '舊覆蓋', revision: 3 }));
  await assertSucceeds(runTransaction(db, async transaction => {
    const snapshot = await transaction.get(tournamentRef);
    transaction.update(tournamentRef, { name: '安全更新', revision: snapshot.data().revision + 1 });
  }));
  expect((await getDoc(tournamentRef)).data().revision).toBe(4);
});

test('locked result changes require an immutable version in the same atomic batch', async () => {
  await seedAdmin();
  await seedTournament(baseTournament({
    phase: 'finished', resultLocked: true, revision: 1, currentVersion: 1, currentVersionId: 'run-1-v1'
  }));
  const db = testEnvironment.authenticatedContext('admin-user').firestore();
  const tournamentRef = doc(db, 'tournaments', 'RULES1');
  const correctedPlayers = [{ id: 'a', name: '更正甲', wins: 0, votes: 0, losses: 0, isWithdrawn: false, isEliminated: false }];

  await assertFails(updateDoc(tournamentRef, { players: correctedPlayers, revision: 2 }));

  const batch = writeBatch(db);
  batch.set(doc(db, 'tournaments', 'RULES1', 'versions', 'run-1-v2'), {
    version: 2,
    runId: 'run-1',
    runNumber: 1,
    type: 'correction',
    reason: '測試更正',
    snapshot: {},
    createdBy: 'admin-user',
    createdAt: Timestamp.now()
  });
  batch.update(tournamentRef, {
    players: correctedPlayers,
    revision: 2,
    currentVersion: 2,
    currentVersionId: 'run-1-v2'
  });
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(doc(db, 'tournaments', 'RULES1', 'versions', 'run-1-v2'), { reason: '竄改' }));
});

test('public reads never reveal private tournaments or private series settings', async () => {
  await seedTournament(baseTournament({ eventCode: 'PUBLIC1', isPublic: true }));
  await seedTournament(baseTournament({ eventCode: 'PRIVATE1', isPublic: false }));
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'series', 'private-series'), { name: '私人設定', revision: 1 });
    await setDoc(doc(db, 'publicSeries', 'VISIBLE1'), { name: '公開系列', isPublic: true });
    await setDoc(doc(db, 'publicSeries', 'HIDDEN1'), { name: '隱藏系列', isPublic: false });
  });
  const db = testEnvironment.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(db, 'tournaments', 'PUBLIC1')));
  await assertFails(getDoc(doc(db, 'tournaments', 'PRIVATE1')));
  await assertFails(getDoc(doc(db, 'series', 'private-series')));
  await assertSucceeds(getDoc(doc(db, 'publicSeries', 'VISIBLE1')));
  await assertFails(getDoc(doc(db, 'publicSeries', 'HIDDEN1')));
});

test('admin session expires and token rotation invalidates the old session', async () => {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'settings', 'admin'), { tokenHash: TOKEN_HASH });
  });
  const db = testEnvironment.authenticatedContext('admin-user').firestore();
  const sessionRef = doc(db, 'adminSessions', 'admin-user');

  await assertFails(setDoc(sessionRef, {
    tokenHash: TOKEN_HASH,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() - 1000)
  }));
  await assertSucceeds(setDoc(sessionRef, {
    tokenHash: TOKEN_HASH,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000)
  }));
  await assertSucceeds(getDoc(sessionRef));

  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'settings', 'admin'), { tokenHash: ROTATED_TOKEN_HASH });
  });
  await assertFails(getDoc(sessionRef));
});
