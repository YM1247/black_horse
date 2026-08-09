import {
  decodeTournamentFromFirestore,
  DEFAULT_CLOUD_TOURNAMENT_VISIBILITY,
  encodeTournamentForFirestore,
  generateEventCode,
  getAdminLoginErrorMessage,
  normalizeEventCode,
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
