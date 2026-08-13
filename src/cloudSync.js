export const shouldApplyCloudSnapshot = ({ cloudReady, pendingLocalState, snapshotState }) =>
  !cloudReady || !pendingLocalState || pendingLocalState === snapshotState;

export const shouldShowCloudSyncAlert = ({ isOnline, status, retryMessage = '' }) =>
  !isOnline || status === 'offline' || status === 'error' || Boolean(retryMessage);

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
