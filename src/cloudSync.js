export const shouldApplyCloudSnapshot = ({ cloudReady, pendingLocalState, snapshotState }) =>
  !cloudReady || !pendingLocalState || pendingLocalState === snapshotState;

export const CLOUD_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

export const isTransientCloudError = (error = {}) => [
  'aborted',
  'cancelled',
  'deadline-exceeded',
  'internal',
  'resource-exhausted',
  'unavailable',
  'unknown'
].includes(error.code);

const wait = (delay) => new Promise(resolve => window.setTimeout(resolve, delay));

export const runWithCloudRetry = async (operation, {
  delays = CLOUD_RETRY_DELAYS,
  onRetry = () => {},
  waitFor = wait
} = {}) => {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientCloudError(error) || attempt >= delays.length) throw error;
      const delay = delays[attempt];
      attempt += 1;
      onRetry({ attempt, delay, error });
      await waitFor(delay);
    }
  }
};

export const summarizePendingOperation = (operation = {}) => {
  const details = operation.details || {};
  switch (operation.action) {
    case 'SCORE_UPDATED':
    case 'HISTORICAL_SCORE_UPDATED':
      return `第 ${details.round || '—'} 輪 ${details.players?.join(' vs ') || '對戰'}：${details.after?.p1Votes ?? '—'}:${details.after?.p2Votes ?? '—'}`;
    case 'PLAYER_ADDED':
      return `新增選手 ${details.name || '—'}`;
    case 'PLAYER_REMOVED':
      return `移除選手 ${details.name || '—'}`;
    case 'PLAYER_RENAMED':
      return `選手改名：${details.before || '—'} → ${details.after || '—'}`;
    case 'ROUND_ADVANCED':
      return `進入第 ${details.to || '—'} 輪`;
    case 'TOURNAMENT_STARTED':
      return '開始抽籤';
    case 'TOURNAMENT_FINISHED':
      return '結算賽事';
    default:
      return operation.label || operation.action || '賽事資料變更';
  }
};
