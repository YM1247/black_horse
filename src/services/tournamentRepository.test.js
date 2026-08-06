import { generateEventCode, normalizeEventCode, validateEventCode } from './tournamentRepository';

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

