import {
  buildPublicSeriesProjection,
  buildTournamentSummary,
  decodeTournamentFromFirestore,
  DEFAULT_CLOUD_TOURNAMENT_VISIBILITY,
  encodeSeriesForFirestore,
  encodeTournamentForFirestore,
  generateEventCode,
  getAdminLoginErrorMessage,
  normalizeEventCode,
  TOURNAMENT_DELETION_SUBCOLLECTIONS,
  validateEventCode
} from './tournamentRepository';

test('event codes are normalized for direct public lookup', () => {
  expect(normalizeEventCode(' ab-c ')).toBe('AB-C');
  expect(validateEventCode(' ab12 ')).toBe(true);
  expect(validateEventCode('ab-c')).toBe(false);
  expect(validateEventCode('abc')).toBe(false);
});

test('generated event codes avoid visually ambiguous characters', () => {
  expect(generateEventCode(6, () => 0)).toBe('AAAAAA');
  expect(generateEventCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
});

test('new cloud tournaments are public by default', () => {
  expect(DEFAULT_CLOUD_TOURNAMENT_VISIBILITY).toBe(true);
});

test('permanent deletion covers immutable versions and audit logs', () => {
  expect(TOURNAMENT_DELETION_SUBCOLLECTIONS).toEqual(['auditLogs', 'versions']);
});

test('admin home summary excludes players, rounds, and score details', () => {
  const summary = buildTournamentSummary({
    id: 'ABCD1',
    name: '測試賽',
    phase: 'playing',
    currentRoundNum: 2,
    judgeCount: 3,
    doubleElimination: true,
    isPublic: true,
    revision: 7,
    players: [{ name: '甲' }, { name: 'MC', isMC: true }],
    rounds: [[{ p1Votes: 3, p2Votes: 0 }]]
  });

  expect(summary).toMatchObject({ eventCode: 'ABCD1', name: '測試賽', phase: 'playing', playerCount: 1, revision: 7 });
  expect(summary).not.toHaveProperty('players');
  expect(summary).not.toHaveProperty('rounds');
});

test('series definitions keep editable event labels and fixed rules', () => {
  expect(encodeSeriesForFirestore({
    id: 'simulation-series',
    name: ' 模擬賽 ',
    description: ' 測試系列 ',
    events: [{ id: 'aug-28', name: ' 8/28 ', eventCode: ' mock828 ', judgeCount: 3, doubleElimination: true }]
  })).toEqual({
    name: '模擬賽',
    description: '測試系列',
    events: [{ id: 'aug-28', name: '8/28', eventCode: 'MOCK828', judgeCount: 3, doubleElimination: true }]
  });
});

test('series encoding keeps public settings without persisting revision twice', () => {
  expect(encodeSeriesForFirestore({
    name: '模擬賽',
    description: '系列',
    publicCode: ' sim2026 ',
    isPublic: true,
    revision: 9,
    events: []
  })).toEqual({
    name: '模擬賽',
    description: '系列',
    publicCode: 'SIM2026',
    isPublic: true,
    events: []
  });
});

test('public series projection contains only existing public events', () => {
  const projection = buildPublicSeriesProjection({
    id: 'simulation-series',
    name: '模擬賽',
    description: '公開排名',
    publicCode: 'sim2026',
    isPublic: true,
    events: [
      { id: 'one', name: '8/19', eventCode: 'MOCK819', judgeCount: 3, doubleElimination: true },
      { id: 'two', name: '8/21', eventCode: 'MOCK821', judgeCount: 3, doubleElimination: true },
      { id: 'three', name: '8/26', eventCode: 'MOCK826', judgeCount: 3, doubleElimination: true }
    ]
  }, [
    { id: 'MOCK819', name: '8/19', isPublic: true, players: [{ name: '不應洩漏' }] },
    { id: 'MOCK821', name: '8/21', isPublic: false },
    { id: 'MOCK826', name: '8/26', isPublic: true, deletionStatus: 'deleting' }
  ]);

  expect(projection).toEqual({
    publicCode: 'SIM2026',
    name: '模擬賽',
    description: '公開排名',
    isPublic: true,
    events: [{ id: 'one', name: '8/19', eventCode: 'MOCK819', judgeCount: 3, doubleElimination: true }]
  });
  expect(JSON.stringify(projection)).not.toContain('不應洩漏');
});

test('rounds use a Firestore-safe map and restore the domain array shape', () => {
  const rounds = [
    [{ id: 'round-1-match-1', p1Votes: 3, p2Votes: 0 }],
    [{ id: 'round-2-match-1', p1Votes: null, p2Votes: null }]
  ];

  const encoded = encodeTournamentForFirestore({ phase: 'playing', rounds });

  expect(Array.isArray(encoded.rounds)).toBe(false);
  expect(encoded.rounds).toEqual({
    1: rounds[0],
    2: rounds[1]
  });
  expect(decodeTournamentFromFirestore(encoded)).toEqual({ phase: 'playing', rounds });
});

test('Firestore round decoding remains compatible with an empty legacy array', () => {
  expect(decodeTournamentFromFirestore({ rounds: [] }).rounds).toEqual([]);
});

test('admin login errors explain Firebase setup failures', () => {
  expect(getAdminLoginErrorMessage({ code: 'auth/operation-not-allowed' }))
    .toMatch(/Anonymous provider/);
  expect(getAdminLoginErrorMessage({ code: 'permission-denied' }))
    .toMatch(/64 字元 SHA-256/);
  expect(getAdminLoginErrorMessage({ code: 'auth/network-request-failed' }))
    .toMatch(/無法連線 Firebase/);
});
