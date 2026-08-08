import { describeAuditLog, formatAuditTime, getAuditActionLabel } from './audit';

test('audit actions are rendered as readable Traditional Chinese', () => {
  expect(getAuditActionLabel('SCORE_UPDATED')).toBe('更新比分');
  expect(describeAuditLog({
    action: 'SCORE_UPDATED',
    details: { round: 2, after: { p1Votes: 3, p2Votes: 2 } }
  })).toBe('第 2 輪・3:2');
});

test('audit descriptions retain useful management context', () => {
  expect(describeAuditLog({
    action: 'PUBLIC_VISIBILITY_CHANGED',
    details: { before: false, after: true }
  })).toBe('設為公開');
  expect(describeAuditLog({
    action: 'PLAYERS_IMPORTED',
    details: { count: 8 }
  })).toBe('8 位選手');
  expect(getAuditActionLabel('DOUBLE_ELIMINATION_CHANGED')).toBe('變更淘汰規則');
  expect(describeAuditLog({
    action: 'DOUBLE_ELIMINATION_CHANGED',
    details: { before: false, after: true }
  })).toBe('啟用兩敗淘汰');
});

test('audit timestamps use the client fallback while the server timestamp is pending', () => {
  expect(formatAuditTime({ clientTimestamp: '2026-08-07T01:02:00.000Z' }, 'en-CA'))
    .not.toBe('時間同步中');
  expect(formatAuditTime({ clientTimestamp: 'invalid' })).toBe('時間同步中');
});
