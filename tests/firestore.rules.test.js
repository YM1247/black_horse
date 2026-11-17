import { vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore as getLiteFirestore, connectFirestoreEmulator as connectLiteEmulator } from 'firebase/firestore/lite';
import { getFirebaseServices } from '../src/firebase';
import { saveIdentity } from '../src/services/playerDirectory';
import { reviewKey } from '../src/playerIdentity';
import { BLACK_HORSE, SIMULATION_SERIES } from '../src/series';
import { ensureCloudSeries, ensureCloudTournament, createCloudTournament, saveCloudTournament, saveTournamentVersion, decodeTournamentFromFirestore, subscribeTournament } from '../src/services/tournamentRepository';
import { AKASHIKI, AKASHIKI_EVENT, clearTournamentContents, createEmptyTournament } from '../src/tournamentState';
import { gamesFor, playoffSelection, scorePlayoff, seedPlayoff } from '../src/finalTournament';
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

test('合作賽保存十六強與 BO3；鎖定後須建立更正版本，1:1 可重開補局再鎖定', async () => {
  await seedAdmin();
  const admin = testEnvironment.authenticatedContext('admin-user').firestore();
  getFirebaseServices.mockReturnValue({ db: admin, auth: { currentUser: { uid: 'admin-user' } } });
  let state = { ...createEmptyTournament({ rulesVersion: AKASHIKI }), players: Array.from({ length: 32 }, (_, i) => publicPlayer({ id: String(i), name: '合作選手' + i })) };
  const code = await createCloudTournament({ eventCode: 'AKASHIKI', name: '赤式x黑馬記念合作賽', tournament: state });
  let revision = 0;
  for (let round = 0; round < 3; round++) {
    state = nextSwissRound(state);
    for (const match of state.rounds[round]) state = scoreSwiss(state, round, match.id, 3);
    revision = await saveCloudTournament(code, state, { action: '合作賽瑞士輪' }, revision);
  }
  const decisions = Object.fromEntries(playoffSelection(state).ties.map(({ key, group }) => [key, group.map(p => p.id)]));
  state = seedPlayoff(state, decisions);
  for (const [key] of gamesFor(state)) if (key !== 'gold') state = scorePlayoff(state, key, 3);
  state = scorePlayoff(scorePlayoff(state, 'gold', 3, 0), 'gold', 3, 1);
  let result = await saveTournamentVersion(code, state, { expectedRevision: revision, type: 'completed', reason: '合作賽完賽' });
  const ref = doc(admin, 'tournaments', code);
  await assertFails(updateDoc(ref, { revision: result.revision + 1, 'bracket.gold.games': [] }));
  state = { ...scorePlayoff(state, 'gold', 0, 0), phase: 'playing', resultLocked: false };
  result = await saveTournamentVersion(code, state, { expectedRevision: result.revision, type: 'reseed', reason: '首局更正需補第三局' });
  expect((await getDoc(ref)).data()).toMatchObject({ phase: 'playing', resultLocked: false, bracket: { gold: { isDone: false, p1Votes: 1, p2Votes: 1 } } });
  state = scorePlayoff(state, 'gold', 0, 2);
  result = await saveTournamentVersion(code, state, { expectedRevision: result.revision, type: 'completed', reason: '補局完賽' });
  const publicDb = testEnvironment.unauthenticatedContext().firestore();
  const data = decodeTournamentFromFirestore((await getDoc(doc(publicDb, 'tournaments', code))).data());
  expect(data).toMatchObject({ rulesVersion: AKASHIKI, phase: 'finished', resultLocked: true, currentVersion: 3 });
  expect(data.bracket.gold.games).toHaveLength(3);
  expect(data.playoffSeeds).toHaveLength(16);
  expect(data.rounds.map(r => r.length)).toEqual([16, 16, 16]);
  expect(JSON.stringify(data)).not.toMatch(/realName|phone|seriesId/);
});

test('合作賽主文件被刪除但摘要仍在時可原子重建，重複或並行進入不覆寫內容', async () => {
  await seedAdmin();
  const db = testEnvironment.authenticatedContext('admin-user').firestore();
  getFirebaseServices.mockReturnValue({ db, auth: { currentUser: { uid: 'admin-user' } } });
  const summaryRef = doc(db, 'tournamentSummaries', 'AKASHIKI');
  await setDoc(summaryRef, { name: '原有合作賽名稱', isPublic: false, isArchived: true,
    phase: 'finished', playerCount: 32, revision: 183 });
  const definition = { ...AKASHIKI_EVENT, tournament: createEmptyTournament(AKASHIKI_EVENT) };
  await Promise.all([ensureCloudTournament(definition), ensureCloudTournament(definition)]);
  const ref = doc(db, 'tournaments', 'AKASHIKI');
  const recreated = (await getDoc(ref)).data();
  expect(recreated).toMatchObject({ name: '原有合作賽名稱', eventCode: 'AKASHIKI', rulesVersion: AKASHIKI,
    judgeCount: 3, doubleElimination: false, isPublic: false, isArchived: true,
    phase: 'registration', players: [], rounds: {}, revision: 0 });
  expect((await getDoc(summaryRef)).data()).toMatchObject({ phase: 'registration', playerCount: 0, revision: 0 });
  expect((await getDocs(collection(ref, 'auditLogs'))).docs.map(log => log.data().action)).toEqual(['TOURNAMENT_RECREATED']);
  await saveCloudTournament('AKASHIKI', { players: [publicPlayer({ id: 'saved', name: '新報名選手' })] }, { action: '報名' }, 0);
  const before = (await getDoc(ref)).data();
  await ensureCloudTournament(definition);
  expect((await getDoc(ref)).data()).toEqual(before);
  await expect(createCloudTournament(definition)).rejects.toThrow('已存在');
});

test.each(['registration', 'playing', 'finished'])('%s 合作賽清除保留身分、賽制、私人選手檔與歷史版本，公開資料同步歸零', async (phase) => {
  await seedAdmin();
  const db = testEnvironment.authenticatedContext('admin-user').firestore();
  getFirebaseServices.mockReturnValue({ db, auth: { currentUser: { uid: 'admin-user' } } });
  const initial = { ...createEmptyTournament(AKASHIKI_EVENT), phase, runNumber: 4,
    players: [publicPlayer({ id: 'a', name: '合作選手' })], rounds: phase === 'registration' ? [] : [[]],
    qualificationConfig: { online: ['a'] }, qualificationSources: { OTHER1: 2 }, qualifiedIds: ['a'],
    playoffSeeds: [{ id: 'a', name: '合作選手' }], playoffDecisions: { tie: ['a'] }, bracket: { gold: { isDone: true } } };
  await createCloudTournament({ ...AKASHIKI_EVENT, tournament: initial });
  await setDoc(doc(db, 'privatePlayers', 'a'), { name: '合作選手', realName: '私人本名' });
  const ref = doc(db, 'tournaments', 'AKASHIKI');
  if (phase === 'finished') await saveTournamentVersion('AKASHIKI', initial, { expectedRevision: 0, type: 'completed', reason: '完賽' });
  const before = decodeTournamentFromFirestore((await getDoc(ref)).data());
  const oldVersions = (await getDocs(collection(ref, 'versions'))).docs.map(d => ({ id: d.id, ...d.data() }));
  const oldAudits = (await getDocs(collection(ref, 'auditLogs'))).docs.map(d => ({ id: d.id, ...d.data() }));
  await expect(saveCloudTournament('AKASHIKI', clearTournamentContents(before), { action: 'TOURNAMENT_CLEARED' }, before.revision + 1))
    .rejects.toMatchObject({ code: 'cloud/revision-conflict' });
  await saveCloudTournament('AKASHIKI', clearTournamentContents(before), { action: 'TOURNAMENT_CLEARED' }, before.revision);
  const visitor = testEnvironment.unauthenticatedContext().firestore();
  const cleared = decodeTournamentFromFirestore((await getDoc(doc(visitor, 'tournaments', 'AKASHIKI'))).data());
  expect(cleared).toMatchObject({ name: AKASHIKI_EVENT.name, eventCode: 'AKASHIKI', rulesVersion: AKASHIKI,
    judgeCount: 3, doubleElimination: false, isPublic: true, phase: 'registration',
    players: [], rounds: [], bracket: {}, qualificationConfig: {}, qualificationSources: {},
    qualifiedIds: [], playoffSeeds: [], playoffDecisions: {}, runNumber: 5,
    currentVersion: 0, currentVersionId: '', resultLocked: false, revision: before.revision + 1 });
  expect(cleared.runId).not.toBe(before.runId);
  expect((await getDoc(doc(db, 'tournamentSummaries', 'AKASHIKI'))).data()).toMatchObject({
    phase: 'registration', playerCount: 0, revision: cleared.revision
  });
  expect((await getDocs(collection(ref, 'versions'))).docs.map(d => ({ id: d.id, ...d.data() }))).toEqual(oldVersions);
  const audits = (await getDocs(collection(ref, 'auditLogs'))).docs.map(d => ({ id: d.id, ...d.data() }));
  expect(audits).toEqual(expect.arrayContaining(oldAudits));
  expect(audits.filter(log => log.action === 'TOURNAMENT_CLEARED')).toHaveLength(1);
  expect((await getDoc(doc(db, 'privatePlayers', 'a'))).exists()).toBe(true);
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


test('後台儲存後，公開即時訂閱接收到開賽、比分、淘汰籤表及完賽資料', async () => {
  await seedAdmin();
  const admin=testEnvironment.authenticatedContext('admin-user').firestore();
  const visitor=testEnvironment.unauthenticatedContext().firestore();
  const useAdmin=()=>getFirebaseServices.mockReturnValue({db:admin,auth:{currentUser:{uid:'admin-user'}}});
  useAdmin();
  let state={...createEmptyTournament({rulesVersion:AKASHIKI}),players:Array.from({length:32},(_,i)=>publicPlayer({id:String(i),name:'連動選手'+i}))};
  const code=await createCloudTournament({eventCode:'UILIVE',name:'公開連動測試',tournament:state});
  getFirebaseServices.mockReturnValue({db:visitor,auth:{currentUser:null}});
  let latest, failure;
  const unsubscribe=subscribeTournament(code,data=>{latest=data;},error=>{failure=error;});
  const received=async revision=>{
    await vi.waitFor(()=>{expect(failure).toBeUndefined();expect(latest?.revision).toBe(revision);},{timeout:10000});
  };
  try {
    await received(0);
    expect(latest.phase).toBe('registration');
    useAdmin();
    let revision=0;
    state=nextSwissRound(state);
    revision=await saveCloudTournament(code,state,{action:'開始第一輪'},revision);
    await received(revision);
    expect(latest.phase).toBe('playing');
    expect(latest.rounds[0]).toHaveLength(16);
    const first=state.rounds[0][0];
    state=scoreSwiss(state,0,first.id,2);
    revision=await saveCloudTournament(code,state,{action:'登錄瑞士比分'},revision);
    await received(revision);
    expect(latest.rounds[0][0]).toMatchObject({p1Votes:2,p2Votes:1,isDone:true});
    for(let r=0;r<3;r++) {
      if(r) state=nextSwissRound(state);
      for(const match of state.rounds[r]) if(!match.isDone) state=scoreSwiss(state,r,match.id,3);
    }
    const decisions=Object.fromEntries(playoffSelection(state).ties.map(({key,group})=>[key,group.map(p=>p.id)]));
    state=seedPlayoff(state,decisions);
    revision=await saveCloudTournament(code,state,{action:'抽選淘汰籤表'},revision);
    await received(revision);
    expect(latest.playoffSeeds).toHaveLength(16);
    expect(latest.bracket.r1.p1.id).toBe(state.bracket.r1.p1.id);
    state=scorePlayoff(state,'r1',3);
    revision=await saveCloudTournament(code,state,{action:'登錄淘汰比分'},revision);
    await received(revision);
    expect(latest.bracket.r1).toMatchObject({p1Votes:3,p2Votes:0,isDone:true});
    for(const [key] of gamesFor(state)) if(key!=='gold' && !state.bracket[key]?.isDone) state=scorePlayoff(state,key,3);
    state=scorePlayoff(scorePlayoff(state,'gold',3,0),'gold',3,1);
    const done=await saveTournamentVersion(code,state,{expectedRevision:revision,type:'completed',reason:'連動驗證完賽'});
    await received(done.revision);
    expect(latest).toMatchObject({phase:'finished',resultLocked:true,bracket:{gold:{isDone:true,p1Votes:2,p2Votes:0},bronze:{isDone:true}}});
    expect(JSON.stringify(latest)).not.toMatch(/realName|phone/);
  } finally {unsubscribe();}
});
