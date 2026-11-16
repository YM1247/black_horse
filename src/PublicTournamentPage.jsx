import React, { useEffect, useState } from 'react';
import { isFirebaseConfigured } from './firebase';
import { normalizeEventCode, subscribeTournament, validateEventCode } from './services/tournamentRepository';
import { eventRanking, hasPlayoff } from './seasonTournament';
import { AKASHIKI } from './tournamentState';
import { BLACK_HORSE, SERIES } from './series';
import { PublicBrand, PublicBottomNav, PublicNotice } from './PublicLayout';
import PublicEventLive from './PublicEventLive';

const PHASE_LABELS = {
  registration: '報名中',
  playing: '進行中',
  finished: '已完賽'
};

export function PublicTournamentRanking({ tournament, rankedPlayers, prominent = false }) {
  const isFinished = tournament.phase === 'finished';
  const isFinal = hasPlayoff(tournament);
  const title = isFinal ? '瑞士制排名' : isFinished ? '最終排名' : '即時排名';
  return <section id="event-ranking" aria-label={title} className={'event-board ' + (prominent ? 'mb-8' : '')}>
    <h2>{title}</h2>
    {tournament.rulesVersion === AKASHIKI && <p>總票數 → 勝場 → 對手勝率 → 對手的對手勝率</p>}
    {rankedPlayers.length === 0 && <p className="text-slate-300">尚無選手排名。</p>}
    <ol>{rankedPlayers.map(player => <li key={player.id}>
      <span className="place">{player.displayRank}</span>
      <strong className="stage-name">{player.name}</strong>
      {isFinished && !isFinal && <b className="event-points">本場積分 {player.rankingPoints}</b>}
      <div className="record">{tournament.rulesVersion === AKASHIKI && <span>{player.votes} 票</span>}<strong className="ranking-record">{player.wins} 勝 {player.losses || 0} 敗</strong>{tournament.rulesVersion !== AKASHIKI && <span>{player.votes} 票</span>}
        {!player.isWithdrawn && <><span>對手勝率 {(player.opponentWinRate * 100).toFixed(1)}%</span>
          <span>次級勝率 {(player.opponentsOpponentWinRate * 100).toFixed(1)}%</span></>}
        {player.seedCredit && <span>種子 · 首輪 1 勝 5 票</span>}
        {player.isOrganizer && <span>主辦方補位</span>}
        {player.revivedRound && <span>第 {player.revivedRound} 輪復活</span>}
        {player.isWithdrawn && <span>已棄賽</span>}
        {player.needsTiebreaker && <span>並列</span>}
      </div>
    </li>)}</ol>
  </section>;
}

const readEventView = () => {
  const view = new URLSearchParams(window.location.search).get('view');
  return ['matches', 'ranking'].includes(view) ? view : window.location.hash === '#event-ranking' ? 'ranking' : null;
};

export default function PublicTournamentPage({ initialCode = '' }) {
  const previewStage = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('preview') : null;
  const [requestedView, setRequestedView] = useState(readEventView);
  const [input, setInput] = useState(initialCode);
  const [eventCode, setEventCode] = useState(validateEventCode(initialCode) ? normalizeEventCode(initialCode) : '');
  const [tournament, setTournament] = useState(null);
  const [status, setStatus] = useState(eventCode ? 'loading' : 'idle');
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handlePopState = () => {
      setRequestedView(readEventView());
      const code = normalizeEventCode(new URLSearchParams(window.location.search).get('event') || '');
      if (code === eventCode) return;
      setTournament(null);
      setInput(code);
      setEventCode(validateEventCode(code) ? code : '');
      setStatus(validateEventCode(code) ? 'loading' : 'idle');
      setError('');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [eventCode]);



  useEffect(() => {
    if (previewStage) {
      let active = true;
      import('./publicPreview').then(({ createPublicPreview }) => {
        if (active) { setTournament(createPublicPreview(previewStage)); setStatus('ready'); }
      });
      return () => { active = false; };
    }
    if (!isFirebaseConfigured || !eventCode) return undefined;
    setStatus('loading');
    setError('');
    return subscribeTournament(eventCode, data => {
      setTournament(data);
      setStatus(data ? 'ready' : 'not-found');
    }, firebaseError => {
      setTournament(null);
      setStatus('error');
      setError(firebaseError.code === 'permission-denied' ? '此賽事不存在或尚未公開。' : '讀取賽事失敗，請稍後再試。');
    });
  }, [eventCode, retryKey, previewStage]);

  const handleLookup = (event) => {
    event.preventDefault();
    const code = normalizeEventCode(input);
    if (!validateEventCode(code)) {
      setError('賽事代碼需為 4–10 位英文字母或數字。');
      return;
    }
    if (code === eventCode) {
      setRetryKey(value => value + 1);
      return;
    }
    setTournament(null);
    setRequestedView(null);
    setStatus('loading');
    window.history.pushState({}, '', `${window.location.pathname}?event=${code}`);
    setEventCode(code);
  };

  const rounds = Array.isArray(tournament?.rounds) ? tournament.rounds : [];
  const rankedPlayers = tournament ? eventRanking(tournament) : [];
  const parentSeries = tournament?.seriesId
    ? SERIES.find(series => series.id === tournament.seriesId)
    : null;
  const hasSchedule = rounds.length > 0 || tournament?.playoffSeeds?.length > 0;
  const hasRanking = hasSchedule && rankedPlayers.length > 0;
  const hasBottomNav = hasSchedule && hasRanking;
  const activeView = hasRanking && (requestedView || (tournament?.phase === 'finished' ? 'ranking' : 'matches')) === 'ranking' ? 'ranking' : 'matches';
  const changeView = (view, href) => {
    window.history.pushState({}, '', href);
    setRequestedView(view);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    document.title = tournament?.name ? `${tournament.name}｜${activeView === 'ranking' ? '排名' : '即時賽況'}` : '黑馬記念｜公開賽事';
  }, [tournament?.name, activeView]);

  return (
    <main className={`spectator-page public-ink${hasBottomNav ? '' : ' public-ink--no-nav'}`}>
      <div className="public-container">
        <PublicBrand backHref={parentSeries?.publicCode ? `${window.location.pathname}?series=${parentSeries.publicCode}` : undefined} title={tournament?.name || '公開賽事查詢'}>
          {tournament && <p className="public-event-meta" role="status">
            {PHASE_LABELS[tournament.phase] || tournament.phase}・{!isOnline ? '離線' : tournament.sync?.fromCache ? '快取資料' : tournament.sync?.hasPendingWrites ? '資料同步中' : '即時更新中'}
            {tournament.clientUpdatedAt && <span className="public-update-time">更新 {new Date(tournament.clientUpdatedAt).toLocaleString('zh-TW')}</span>}
          </p>}
        </PublicBrand>
        <div className="public-content">
        {previewStage && <nav aria-label="測試階段" className="public-preview-stages">
          <p>本機測試資料・不影響正式賽事</p>
          {[['registration','報名中'],['round1','第一輪'],['round2','第二輪'],['round3','第三輪'],['finished','積分賽完賽'],['playoff','八強淘汰賽'],['final','最終戰完賽']].map(([key,label]) => <a key={key} href={`?event=DEMO&preview=${key}`} aria-current={previewStage===key?'page':undefined}>{label}</a>)}
        </nav>}
        {!tournament && <details id="public-lookup" className="public-code-lookup" open={!tournament}>
          <summary>{tournament ? '切換賽事' : '查詢賽事'}</summary>
          <form onSubmit={handleLookup} className="public-code-form">
            <label htmlFor="public-event-code">賽事代碼</label>
            <div><input id="public-event-code" value={input} onChange={event => setInput(event.target.value.toUpperCase())}
              placeholder="輸入賽事代碼" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            {isFirebaseConfigured && input.trim() && <button>查詢</button>}</div>
          </form>
        </details>}
        {!isFirebaseConfigured && <p role="status" className="public-empty">此部署尚未設定 Firebase，暫時無法查詢雲端賽事。</p>}

        {error && <PublicNotice tone="error">{error}</PublicNotice>}
        {tournament && (!isOnline || tournament.sync?.fromCache) && (
          <PublicNotice tone="offline" onRetry={isOnline ? () => setRetryKey(value => value + 1) : undefined}>
            目前離線，顯示快取資料。{tournament.clientUpdatedAt && `最後更新：${new Date(tournament.clientUpdatedAt).toLocaleString('zh-TW')}`}
          </PublicNotice>
        )}
        {status === 'loading' && isFirebaseConfigured && <div role="status" className="public-empty">正在載入賽事…</div>}
        {status === 'not-found' && <div className="public-empty">找不到此賽事，請確認代碼或向主辦方取得公開連結。</div>}
        {status === 'idle' && isFirebaseConfigured && <section className="public-welcome"><h2>查詢今天的對戰與比分</h2><p>輸入賽事代碼，或開啟系列賽選擇場次。</p><a className="public-primary-link" href={'?series='+BLACK_HORSE.publicCode}>查看黑馬記念系列賽</a></section>}

        {tournament && (
          <>
            <div className="public-event-page" hidden={activeView !== 'matches'}>
              <PublicEventLive tournament={tournament} />
            </div>
            {hasRanking && <div className="public-event-page" hidden={activeView !== 'ranking'}>
              <PublicTournamentRanking tournament={tournament} rankedPlayers={rankedPlayers} />
            </div>}



          </>
        )}
        </div>
      </div>
      <PublicBottomNav eventCode={eventCode} eventView={activeView} onEventViewChange={changeView} hasSchedule={hasSchedule} hasRanking={hasRanking} />
    </main>
  );
}
