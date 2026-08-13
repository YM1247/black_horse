const AUDIT_ACTION_LABELS = {
  TOURNAMENT_CREATED: '建立賽事',
  TOURNAMENT_STARTED: '開始賽事',
  TOURNAMENT_FINISHED: '結算賽事',
  TOURNAMENT_RESET: '重設賽事',
  TOURNAMENT_CLEARED: '清除賽事內容',
  TOURNAMENT_CLOSED: '離開賽事管理',
  TOURNAMENT_STATE_UPDATED: '更新賽事狀態',
  ADMIN_SIGNED_OUT: '管理員登出',
  PLAYER_ADDED: '新增選手',
  PLAYER_REMOVED: '移除選手',
  PLAYER_RENAMED: '選手改名',
  PLAYERS_IMPORTED: '匯入選手',
  TEST_PLAYERS_LOADED: '載入測試名單',
  PLAYER_WITHDRAWN: '選手棄賽',
  JUDGE_COUNT_CHANGED: '變更評審人數',
  DOUBLE_ELIMINATION_CHANGED: '變更淘汰規則',
  SCORE_UPDATED: '更新比分',
  HISTORICAL_SCORE_UPDATED: '更正歷史比分',
  ROUND_ADVANCED: '進入下一輪',
  PUBLIC_VISIBILITY_CHANGED: '變更公開狀態',
  RESULT_CORRECTED: '更正完賽結果',
  RESULT_VERSION_RESTORED: '回復結果版本'
};

export const getAuditActionLabel = (action = '') =>
  AUDIT_ACTION_LABELS[action] || action || '未知操作';

export const describeAuditLog = (audit = {}) => {
  const details = audit.details || {};

  switch (audit.action) {
    case 'TOURNAMENT_CREATED':
      return `${details.name || details.eventCode || '未命名賽事'}（#${details.eventCode || '—'}）`;
    case 'PLAYER_ADDED':
    case 'PLAYER_REMOVED':
    case 'PLAYER_WITHDRAWN':
      return details.name || '未記錄選手名稱';
    case 'PLAYER_RENAMED':
      return `${details.before || '—'} → ${details.after || '—'}`;
    case 'PLAYERS_IMPORTED':
    case 'TEST_PLAYERS_LOADED':
      return `${Number(details.count) || 0} 位選手`;
    case 'JUDGE_COUNT_CHANGED':
      return `${details.before ?? '—'} 位 → ${details.after ?? '—'} 位`;
    case 'DOUBLE_ELIMINATION_CHANGED':
      return details.after ? '啟用兩敗淘汰' : '關閉兩敗淘汰';
    case 'SCORE_UPDATED':
    case 'HISTORICAL_SCORE_UPDATED':
      return `第 ${details.round || '—'} 輪・${details.after?.p1Votes ?? '—'}:${details.after?.p2Votes ?? '—'}`;
    case 'ROUND_ADVANCED':
      return `第 ${details.from || '—'} 輪 → 第 ${details.to || '—'} 輪${details.eliminated?.length ? `・淘汰 ${details.eliminated.join('、')}` : ''}`;
    case 'TOURNAMENT_FINISHED':
      return `完成第 ${details.round || '—'} 輪`;
    case 'TOURNAMENT_STARTED':
      return `${Number(details.playerCount) || 0} 位選手・${details.judgeCount || '—'} 位評審・${details.doubleElimination ? '兩敗淘汰' : '不淘汰'}`;
    case 'TOURNAMENT_CLEARED':
      return `${details.name || '未命名場次'}・清除 ${Number(details.removedPlayers) || 0} 位選手與 ${Number(details.removedRounds) || 0} 輪賽程`;
    case 'PUBLIC_VISIBILITY_CHANGED':
      return details.after ? '設為公開' : '設為不公開';
    case 'RESULT_CORRECTED':
      return `建立 v${details.version || '—'}・${details.reason || '未填原因'}・${details.changes?.length || 0} 項變更`;
    case 'RESULT_VERSION_RESTORED':
      return `由 v${details.sourceVersion || '—'} 回復為 v${details.version || '—'}・${details.reason || '未填原因'}`;
    case 'TOURNAMENT_CLOSED':
    case 'ADMIN_SIGNED_OUT':
    case 'TOURNAMENT_STATE_UPDATED':
      return `第 ${details.currentRoundNum || '—'} 輪`;
    default:
      return '';
  }
};

export const formatAuditTime = (audit = {}, locale = 'zh-TW') => {
  const date = audit.createdAt?.toDate?.() || (audit.clientTimestamp ? new Date(audit.clientTimestamp) : null);
  if (!date || Number.isNaN(date.getTime())) return '時間同步中';
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};
