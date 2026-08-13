import { isTransientCloudError, runWithCloudRetry, shouldApplyCloudSnapshot, summarizePendingOperation } from './cloudSync';

test('initial and idle cloud snapshots can update the editor', () => {
  expect(shouldApplyCloudSnapshot({
    cloudReady: false,
    pendingLocalState: '{"phase":"playing"}',
    snapshotState: '{"phase":"registration"}'
  })).toBe(true);
  expect(shouldApplyCloudSnapshot({
    cloudReady: true,
    pendingLocalState: null,
    snapshotState: '{"phase":"playing"}'
  })).toBe(true);
});

test('a stale cloud snapshot cannot roll back pending local button changes', () => {
  expect(shouldApplyCloudSnapshot({
    cloudReady: true,
    pendingLocalState: '{"phase":"playing","score":"3:0"}',
    snapshotState: '{"phase":"playing","score":null}'
  })).toBe(false);
});

test('the snapshot matching pending local state is accepted as an acknowledgement', () => {
  const state = '{"phase":"finished"}';
  expect(shouldApplyCloudSnapshot({
    cloudReady: true,
    pendingLocalState: state,
    snapshotState: state
  })).toBe(true);
});

test('transient cloud errors retry with the configured delays', async () => {
  const operation = jest.fn()
    .mockRejectedValueOnce({ code: 'unavailable' })
    .mockRejectedValueOnce({ code: 'aborted' })
    .mockResolvedValue(7);
  const waitFor = jest.fn().mockResolvedValue(undefined);
  const onRetry = jest.fn();

  await expect(runWithCloudRetry(operation, { delays: [10, 20], waitFor, onRetry })).resolves.toBe(7);
  expect(waitFor).toHaveBeenNthCalledWith(1, 10);
  expect(waitFor).toHaveBeenNthCalledWith(2, 20);
  expect(onRetry).toHaveBeenCalledTimes(2);
});

test('permission and revision conflicts are not retried', async () => {
  expect(isTransientCloudError({ code: 'permission-denied' })).toBe(false);
  expect(isTransientCloudError({ code: 'cloud/revision-conflict' })).toBe(false);
  const operation = jest.fn().mockRejectedValue({ code: 'permission-denied' });
  await expect(runWithCloudRetry(operation, { waitFor: jest.fn() })).rejects.toEqual({ code: 'permission-denied' });
  expect(operation).toHaveBeenCalledTimes(1);
});

test('pending operations have readable conflict summaries', () => {
  expect(summarizePendingOperation({
    action: 'SCORE_UPDATED',
    details: { round: 2, players: ['甲', '乙'], after: { p1Votes: 2, p2Votes: 1 } }
  })).toBe('第 2 輪 甲 vs 乙：2:1');
});
