import { vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore as getLiteFirestore, connectFirestoreEmulator as connectLiteEmulator } from 'firebase/firestore/lite';
import { getFirebaseServices } from '../src/firebase';
import { saveIdentity } from '../src/services/playerDirectory';
import { reviewKey } from '../src/playerIdentity';
import { BLACK_HORSE, SIMULATION_SERIES } from '../src/series';
import { ensureCloudSeries, createCloudTournament, saveCloudTournament, saveTournamentVersion, decodeTournamentFromFirestore } from '../src/services/tournamentRepository';
import { createEmptyTournament } from '../src/tournamentState';
import { QUALIFIER, nextSwissRound, publicPlayer, scoreSwiss } from '../src/seasonTournament';
vi.mock('../src/firebase', () => ({ getFirebaseServices: vi.fn(), isFirebaseConfigured: true }));
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  doc,
  collection, getDocs,
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

test('public spectators can read a match but cannot retrieve or enumerate player identities', async () => {
  await seedAdmin();
  await seedTournament();
  const admin = testEnvironment.authenticatedContext('admin-user').firestore();
  const visitor = testEnvironment.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(admin,'privatePlayers','a'), {id:'a',realName:'私名',phone:'0900123456',name:'甲'}));
  await assertSucceeds(getDoc(doc(visitor,'tournaments','RULES1')));
  await assertFails(getDoc(doc(visitor,'privatePlayers','a')));
  await assertFails(getDocs(collection(visitor,'privatePlayers')));
  await assertSucceeds(setDoc(doc(admin,'privatePlayerIndex','phone-0900123456'),{ids:['a']}));
  await assertFails(getDoc(doc(visitor,'privatePlayerIndex','phone-0900123456')));
  await assertFails(setDoc(doc(visitor,'privatePlayers','a'), {}));
});

test('locked finals protect the bracket; a new version can reopen affected games for scoring', async () => {
  await seedAdmin();
  await seedTournament(baseTournament({phase:'finished',resultLocked:true,currentVersion:1,currentVersionId:'run-1-v1',
    rulesVersion:'final-26-27',bracket:{gold:{isDone:true}},playoffSeeds:['a','b']}));
  const db=testEnvironment.authenticatedContext('admin-user').firestore();
  const ref=doc(db,'tournaments','RULES1');
  await assertFails(updateDoc(ref,{revision:2,bracket:{}}));
  const batch=writeBatch(db);
  batch.set(doc(ref,'versions','run-1-v2'),{version:2,runId:'run-1',createdBy:'admin-user',type:'reseed'});
  batch.update(ref,{revision:2,phase:'playing',resultLocked:false,currentVersion:2,currentVersionId:'run-1-v2',bracket:{}});
  await assertSucceeds(batch.commit());
  expect((await getDoc(ref)).data().bracket).toEqual({});
});

test('private directory transactions serialize concurrent registrations and maintain lookup indexes after a phone change', async () => {
  await seedAdmin();
  const app=initializeApp({projectId:PROJECT_ID},'identity-integration');
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const db=getLiteFirestore(app);
  connectLiteEmulator(db,host,Number(port),{mockUserToken:{sub:'admin-user'}});
  getFirebaseServices.mockReturnValue({app});
  try {
    const row={realName:'私人本名',name:'打師名',phone:'0912345678'};
    const [a,b]=await Promise.all([saveIdentity(row),saveIdentity(row)]);
    expect(a).toEqual(b);
    const updated={...row,phone:'0999999999',name:'新打師名'};
    await expect(saveIdentity(updated)).rejects.toThrow('核對');
    await saveIdentity(updated,{id:a.id,key:reviewKey([{...row,id:a.id}])});
    const admin=testEnvironment.authenticatedContext('admin-user').firestore();
    expect((await getDocs(collection(admin,'privatePlayers'))).size).toBe(1);
    expect((await getDoc(doc(admin,'privatePlayerIndex','phone-0912345678'))).exists()).toBe(false);
    expect((await getDoc(doc(admin,'privatePlayerIndex','phone-0999999999'))).data().ids).toEqual([a.id]);
  } finally { await deleteApp(app); }
});

test('new qualifier can persist all three rounds, lock a version and expose only its public roster', async () => {
  await seedAdmin();
  const admin=testEnvironment.authenticatedContext('admin-user').firestore();
  getFirebaseServices.mockReturnValue({db:admin,auth:{currentUser:{uid:'admin-user'}}});
  let state=createEmptyTournament({rulesVersion:QUALIFIER});
  state.players=Array.from({length:47},(_,i)=>publicPlayer({id:String(i),name:'打師'+i}));
  const code=await createCloudTournament({eventCode:'SEASON1',name:'積分測試',tournament:state});
  let revision=0;
  for(let round=0;round<3;round++){
    state=nextSwissRound(state);
    for(const m of state.rounds[round])state=scoreSwiss(state,round,m.id,3);
    revision=await saveCloudTournament(code,state,{action:'輪次測試'},revision);
  }
  const result=await saveTournamentVersion(code,state,{expectedRevision:revision,type:'completed',reason:'完賽'});
  expect(result.version).toBe(1);
  const visitor=testEnvironment.unauthenticatedContext().firestore();
  const data=decodeTournamentFromFirestore((await getDoc(doc(visitor,'tournaments',code))).data());
  expect(data.rounds).toHaveLength(3);
  expect(data.phase).toBe('finished');
  expect(data.rulesVersion).toBe(QUALIFIER);
  expect(data.players).toHaveLength(48);
  expect(JSON.stringify(data)).not.toMatch(/realName|phone/);
});

test('既有系列與已完賽場次改用中文場名；重新開啟不重複寫入', async () => {
  await seedAdmin();
  const db = testEnvironment.authenticatedContext('admin-user').firestore();
  getFirebaseServices.mockReturnValue({ db, auth: { currentUser: { uid: 'admin-user' } } });
  const seriesRef = doc(db, 'series', BLACK_HORSE.id);
  const events = BLACK_HORSE.events.map((event, i) =>
    i < 4 ? { ...event, name: '第' + (i + 1) + '站積分賽' } : event);
  await setDoc(seriesRef, { events, revision: 1 });
  const original = baseTournament({ eventCode: events[0].eventCode, seriesId: BLACK_HORSE.id,
    name: events[0].name, phase: 'finished', resultLocked: true });
  await seedTournament(original);
  await ensureCloudSeries(BLACK_HORSE);
  await ensureCloudSeries(BLACK_HORSE);
  const series = (await getDoc(seriesRef)).data();
  expect(series.revision).toBe(2);
  expect(series.events.map(e => e.name)).toEqual(['積分賽第一場','積分賽第二場','積分賽第三場','積分賽第四場','最終戰']);
  expect((await getDoc(doc(db, 'tournaments', original.eventCode))).data()).toMatchObject({
    ...original, name: '積分賽第一場', revision: 2
  });
  expect((await getDoc(doc(db, 'tournamentSummaries', original.eventCode))).data().name).toBe('積分賽第一場');
});

test('既有模擬賽封存時保留公開狀態、場次及自訂資料，重開後台不重複寫入', async () => {
  await seedAdmin();
  const db = testEnvironment.authenticatedContext('admin-user').firestore();
  getFirebaseServices.mockReturnValue({ db, auth: { currentUser: { uid: 'admin-user' } } });
  const ref = doc(db, 'series', SIMULATION_SERIES.id);
  const existing = { revision: 1, isPublic: true, events: [{ id: 'old', name: '歷史場次', eventCode: 'OLD1' }] };
  await setDoc(ref, existing);
  await ensureCloudSeries(SIMULATION_SERIES);
  await ensureCloudSeries(SIMULATION_SERIES);
  expect((await getDoc(ref)).data()).toMatchObject({ ...existing, isArchived: true, revision: 2 });
});
