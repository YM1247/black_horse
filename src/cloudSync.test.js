import { shouldApplyCloudSnapshot } from './cloudSync';

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
