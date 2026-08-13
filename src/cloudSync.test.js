import {
  canLeaveWithoutTournamentWrite,
  isTransientCloudError,
  runWithCloudRetry,
  shouldApplyCloudSnapshot,
  shouldShowCloudSyncAlert
} from './cloudSync';
import { vi } from 'vitest';

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
  const operation = vi.fn()
    .mockRejectedValueOnce({ code: 'unavailable' })
    .mockRejectedValueOnce({ code: 'aborted' })
    .mockResolvedValue(7);
  const waitFor = vi.fn().mockResolvedValue(undefined);
  const onRetry = vi.fn();

  await expect(runWithCloudRetry(operation, { delays: [10, 20], waitFor, onRetry })).resolves.toBe(7);
  expect(waitFor).toHaveBeenNthCalledWith(1, 10);
  expect(waitFor).toHaveBeenNthCalledWith(2, 20);
  expect(onRetry).toHaveBeenCalledTimes(2);
});

test('permission and revision conflicts are not retried', async () => {
  expect(isTransientCloudError({ code: 'permission-denied' })).toBe(false);
  expect(isTransientCloudError({ code: 'cloud/revision-conflict' })).toBe(false);
  const operation = vi.fn().mockRejectedValue({ code: 'permission-denied' });
  await expect(runWithCloudRetry(operation, { waitFor: vi.fn() })).rejects.toEqual({ code: 'permission-denied' });
  expect(operation).toHaveBeenCalledTimes(1);
});

test('normal pending writes do not open the disruptive sync alert', () => {
  expect(shouldShowCloudSyncAlert({ isOnline: true, status: 'pending' })).toBe(false);
  expect(shouldShowCloudSyncAlert({ isOnline: true, status: 'synced' })).toBe(false);
});

test('the sync alert is reserved for offline, retrying, and failed states', () => {
  expect(shouldShowCloudSyncAlert({ isOnline: false, status: 'pending' })).toBe(true);
  expect(shouldShowCloudSyncAlert({ isOnline: true, status: 'offline' })).toBe(true);
  expect(shouldShowCloudSyncAlert({ isOnline: true, status: 'error' })).toBe(true);
  expect(shouldShowCloudSyncAlert({ isOnline: true, status: 'pending', retryMessage: 'retrying' })).toBe(true);
});

test('a committed finished result can return home without rewriting the locked tournament', () => {
  expect(canLeaveWithoutTournamentWrite({ phase: 'finished', resultLocked: true })).toBe(true);
  expect(canLeaveWithoutTournamentWrite({ phase: 'finished', resultLocked: false })).toBe(false);
  expect(canLeaveWithoutTournamentWrite({ phase: 'playing', resultLocked: true })).toBe(false);
});
