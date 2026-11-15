import SeriesEventPoints from './SeriesEventPoints';
import { PublicBrand, PublicBottomNav, PublicPlayerSearch, publicSeriesName } from './PublicLayout';
import { FINAL } from './seasonTournament';
import React, { useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured } from './firebase';
import { buildSeriesStandings } from './series';
import {
  normalizeEventCode,
  subscribePublicSeries,
  subscribeTournament,
  validateEventCode
} from './services/tournamentRepository';

const PHASE_LABELS = {
  registration: '報名中',
  playing: '進行中',
  finished: '已完賽'
};

const formatUpdateTime = (value) => {
  if (!value) return '尚未取得';
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未取得';
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(date);
};

export default function PublicSeriesPage({ initialCode = '' }) {
  const normalizedInitialCode = normalizeEventCode(initialCode);
  const [input, setInput] = useState(normalizedInitialCode);
  const [publicCode, setPublicCode] = useState(validateEventCode(normalizedInitialCode) ? normalizedInitialCode : '');
  const [series, setSeries] = useState(null);
  const [tournamentsByCode, setTournamentsByCode] = useState({});
  const [status, setStatus] = useState(publicCode ? 'loading' : 'idle');
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [playerQuery, setPlayerQuery] = useState('');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => { setPlayerQuery(''); }, [publicCode]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handlePopState = () => {
      const code = normalizeEventCode(new URLSearchParams(window.location.search).get('series') || '');
      if (code === publicCode) return;
      setSeries(null);
      setTournamentsByCode({});
      setInput(code);
      setPublicCode(validateEventCode(code) ? code : '');
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
  }, [publicCode]);

  useEffect(() => {
    document.title = series?.name ? `${series.name}｜系列賽排名` : '黑馬記念｜公開系列賽';
  }, [series?.name]);

  useEffect(() => {
    setSeries(null);
    setTournamentsByCode({});
    if (!isFirebaseConfigured || !publicCode) return undefined;
    setStatus('loading');
    setError('');
    return subscribePublicSeries(publicCode, data => {
      setSeries(data);
      setStatus(data ? 'ready' : 'not-found');
    }, firebaseError => {
      setSeries(null);
      setStatus('error');
      setError(firebaseError.code === 'permission-denied'
        ? '此系列賽不存在或尚未公開。'
        : '讀取系列賽失敗，請稍後再試。');
    });
  }, [publicCode, retryKey]);

  useEffect(() => {
    const events = Array.isArray(series?.events) ? series.events : [];
    setTournamentsByCode({});
    if (!events.length) return undefined;
    const unsubscribers = events.map(event => subscribeTournament(event.eventCode, tournament => {
      setTournamentsByCode(current => ({ ...current, [event.eventCode]: tournament }));
    }, firebaseError => {
      if (firebaseError.code === 'permission-denied') {
        setTournamentsByCode(current => {
          const remaining = {...current};
          delete remaining[event.eventCode];
          return remaining;
        });
      }
      setError(firebaseError.code === 'permission-denied'
        ? `場次 ${event.name} 已取消公開。`
        : `場次 ${event.name} 暫時無法更新。`);
    }));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [series?.events, retryKey]);

  const tournaments = useMemo(() => Object.values(tournamentsByCode).filter(Boolean), [tournamentsByCode]);
  const standings = useMemo(() => buildSeriesStandings(series, tournaments), [series, tournaments]);
  const visibleStandings = standings.filter(player => player.name.toLocaleLowerCase().includes(playerQuery.trim().toLocaleLowerCase()));
  const isUsingCache = Boolean(series?.sync?.fromCache || tournaments.some(tournament => tournament.sync?.fromCache));
  const lastUpdatedAt = tournaments.reduce((latest, tournament) => {
    const value = tournament.clientUpdatedAt || '';
    return value > latest ? value : latest;
  }, series?.clientUpdatedAt || '');

  const handleLookup = (event) => {
    event.preventDefault();
    const code = normalizeEventCode(input);
    if (!validateEventCode(code)) {
      setError('系列代碼需為 4–10 位英文字母或數字。');
      return;
    }
    if (code === publicCode) {
      setRetryKey(value => value + 1);
      return;
    }
    setSeries(null);
    setTournamentsByCode({});
    setStatus('loading');
    window.history.pushState({}, '', `${window.location.pathname}?series=${code}`);
    setPublicCode(code);
  };

  return (
    <main className="spectator-page public-ink">
      <div className="public-container">
        <PublicBrand title={publicSeriesName(series) || '公開系列賽查詢'}>
          {series && <p className="public-event-meta">{series.description}・系列代碼 {publicCode}</p>}
        </PublicBrand>
        <div className="public-content">
        <div className="public-section-links"><a href={window.location.pathname}>返回公開賽事查詢</a></div>
        <details id="public-lookup" className="public-code-lookup" open={!series}>
          <summary>查詢其他系列<span>{publicCode}</span></summary>
          <form onSubmit={handleLookup} className="public-code-form">
            <label htmlFor="public-series-code">系列代碼</label>
            <div><input id="public-series-code" value={input} onChange={event => setInput(event.target.value.toUpperCase())}
              placeholder="輸入系列代碼" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            <button disabled={!isFirebaseConfigured}>查詢</button></div>
          </form>
        </details>
        {!isFirebaseConfigured && <p className="public-empty" role="status">此部署尚未設定 Firebase，暫時無法查詢雲端系列賽。</p>}

        {(!isOnline || isUsingCache) && (
          <div role="alert" className="mb-6 p-4 rounded-xl border border-amber-500/50 bg-amber-950/30 text-amber-200 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>目前離線，畫面可能是快取資料。最後更新：{formatUpdateTime(lastUpdatedAt)}</span>
            <button type="button" onClick={() => setRetryKey(value => value + 1)} className="px-4 py-2 rounded-lg border border-amber-400">重試</button>
          </div>
        )}
        {error && <div role="alert" className="mb-6 p-4 rounded-lg border border-red-500/40 bg-red-950/30 text-red-300 font-bold">{error}</div>}
        {status === 'loading' && isFirebaseConfigured && <div role="status" className="public-empty">正在載入系列賽…</div>}
        {status === 'not-found' && <div className="py-20 text-center text-slate-500 font-bold">找不到此公開系列賽。</div>}
        {status === 'idle' && <div className="py-20 text-center text-slate-500 font-bold">請輸入系列代碼。</div>}

        {series && (
          <>
            <div className="public-sync" role="status">
              {isUsingCache ? '離線快取' : '即時更新中'}・最後更新 {formatUpdateTime(lastUpdatedAt)}
            </div>

            <nav aria-label="系列賽導覽" className="public-section-links">
              <a href="#series-events">系列場次</a><a href="#series-ranking">積分排名</a>
            </nav>
            <section id="series-events" className="mb-8">
              <h2 className="text-2xl font-black text-[#b6d2d4] mb-4">系列場次</h2>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {series.events.map(event => {
                  const tournament = tournamentsByCode[event.eventCode];
                  return (
                    <article key={event.id} className="spectator-event p-3 md:p-5 rounded-2xl border border-slate-700 bg-[#161920]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-2xl font-black">{event.name}</h3>
                          <p className="text-xs font-bold text-slate-500 mt-1">#{event.eventCode}</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-cyan-950/60 text-[#b6d2d4]">
                          {tournament ? PHASE_LABELS[tournament.phase] || tournament.phase : '載入中'}
                        </span>
                      </div>
                      <p className="mt-2 md:mt-5 text-sm font-bold text-slate-400">
                        {event.judgeCount} 位評審・{event.doubleElimination ? '兩敗淘汰' : '不淘汰'}
                      </p>
                      <a href={`${window.location.pathname}?event=${event.eventCode}`}
                        className="block mt-2 md:mt-5 py-3 rounded-lg text-center font-black bg-[#b6d2d4] text-[#0d0f12]">
                        查看單場賽況
                      </a>
                    </article>
                  );
                })}
                {series.events.length === 0 && <div className="p-10 text-center border border-dashed border-slate-700 rounded-xl text-slate-500 font-bold">目前沒有公開場次。</div>}
              </div>
            </section>

            <section id="series-ranking" className="p-3 sm:p-4 md:p-6 rounded-2xl border border-slate-700 bg-[#161920]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                <h2 className="text-2xl font-black text-[#f1c6a6]">系列積分排名</h2>
                <span className="text-xs font-bold text-slate-500">只有公開且已完賽場次計分</span>
              </div>
              <PublicPlayerSearch id="series-player-search" value={playerQuery} onChange={setPlayerQuery} />
              <div className="space-y-3 md:hidden" aria-label="手機版系列積分排名">
                {visibleStandings.map(standing => (
                  <article key={standing.id || standing.name} className="rounded-xl border border-slate-800 bg-[#11151b] overflow-hidden">
                    <div className="flex items-start gap-3 p-4 border-b border-slate-800">
                      <span className="w-9 h-9 shrink-0 rounded-full bg-cyan-950/60 text-[#b6d2d4] flex items-center justify-center font-black">
                        {standing.displayRank}
                      </span>
                      <h3 className="min-w-0 flex-1 font-black text-white text-lg break-words leading-tight">{standing.name}</h3>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-black tracking-widest text-slate-500">總積分</div>
                        <div className="text-2xl font-black text-[#f1c6a6]">{standing.totalPoints}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-slate-800">
                      {series.events.filter(e => e.rulesVersion !== FINAL).map((event, eventIndex) => (
                        <div key={event.id} className={`bg-[#161920] px-3 py-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 ${series.events.length % 2 === 1 && eventIndex === series.events.length - 1 ? 'col-span-2' : ''}`}>
                          <span className="text-xs font-bold text-slate-400 break-words">{event.name}</span>
                          <span className="font-black text-slate-200"><SeriesEventPoints standing={standing} eventCode={event.eventCode} /></span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
                {visibleStandings.length === 0 && <div className="p-10 text-center border border-dashed border-slate-700 rounded-xl text-slate-500 font-bold">{playerQuery.trim() ? '找不到這位選手，請確認打師名。' : '尚無可計分的完賽結果。'}</div>}
              </div>

              <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-800" aria-label="桌面版系列積分排名">
                <table className="w-max min-w-full text-left border-collapse">
                  <thead className="bg-[#0d0f12] text-xs text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="p-3 text-center sticky left-0 z-20 bg-[#0d0f12] w-12 min-w-12 max-w-12">排名</th>
                      <th className="p-3 sticky left-12 z-20 bg-[#0d0f12] w-40 min-w-40 max-w-40 border-r border-slate-700 shadow-[8px_0_12px_rgba(0,0,0,0.35)]">選手</th>
                      {series.events.filter(e => e.rulesVersion !== FINAL).map(event => <th key={event.id} className="p-3 text-center min-w-[5.5rem]">{event.name}</th>)}
                      <th className="p-3 text-center text-[#f1c6a6] min-w-24">總積分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStandings.map(standing => (
                      <tr key={standing.id || standing.name} className="border-t border-slate-800">
                        <td className="p-3 text-center font-black text-[#b6d2d4] sticky left-0 z-10 bg-[#161920] w-12 min-w-12 max-w-12">{standing.displayRank}</td>
                        <td title={standing.name} className="p-3 font-black text-white sticky left-12 z-10 bg-[#161920] w-40 min-w-40 max-w-40 overflow-hidden break-words leading-tight border-r border-slate-700 shadow-[8px_0_12px_rgba(0,0,0,0.35)]">{standing.name}</td>
                        {series.events.filter(e => e.rulesVersion !== FINAL).map(event => <td key={event.id} className="p-3 text-center font-bold text-slate-300 min-w-[5.5rem]"><SeriesEventPoints standing={standing} eventCode={event.eventCode} /></td>)}
                        <td className="p-3 text-center text-xl font-black text-[#f1c6a6] min-w-24">{standing.totalPoints}</td>
                      </tr>
                    ))}
                    {visibleStandings.length === 0 && <tr><td colSpan={series.events.length + 3} className="p-10 text-center text-slate-500 font-bold">{playerQuery.trim() ? '找不到這位選手，請確認打師名。' : '尚無可計分的完賽結果。'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        </div>
      </div>
      <PublicBottomNav series seriesCode={publicCode || undefined} />
    </main>
  );
}
