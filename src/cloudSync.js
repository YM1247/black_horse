export const shouldApplyCloudSnapshot = ({ cloudReady, pendingLocalState, snapshotState }) =>
  !cloudReady || !pendingLocalState || pendingLocalState === snapshotState;
