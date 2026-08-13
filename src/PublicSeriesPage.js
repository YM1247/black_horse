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
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handlePopState = () => {
      const code = normalizeEventCode(new URLSearchParams(window.location.search).get('series') || '');
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
  }, []);

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
      setError(firebaseError.code === 'permission-denied'
        ? `場次 ${event.name} 已取消公開。`
        : `場次 ${event.name} 暫時無法更新。`);
    }));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [series?.events, retryKey]);

  const tournaments = useMemo(() => Object.values(tournamentsByCode).filter(Boolean), [tournamentsByCode]);
  const standings = useMemo(() => buildSeriesStandings(series, tournaments), [series, tournaments]);
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
    setSeries(null);
    setTournamentsByCode({});
    setStatus('loading');
    window.history.pushState({}, '', `${window.location.pathname}?series=${code}`);
    setPublicCode(code);
  };

  if (!isFirebaseConfigured) {
    return (
      <main className="min-h-screen bg-[#0d0f12] text-slate-100 flex items-center justify-center p-6">
        <section className="max-w-lg w-full bg-[#161920] border border-slate-700 rounded-2xl p-8 text-center">
          <h1 className="text-3xl font-black mb-4">公開系列賽查詢</h1>
          <p className="text-slate-400">此部署尚未設定 Firebase，暫時無法查詢雲端系列賽。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d0f12] text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 border-b border-slate-800 pb-8">
          <div>
            <a href={window.location.pathname} className="text-sm font-bold text-slate-500 hover:text-slate-200">← 返回公開賽事查詢</a>
            <h1 className="text-4xl font-black mt-3">{series?.name || '公開系列賽'}</h1>
            {series && <p className="mt-2 text-slate-400 font-bold">{series.description}・系列代碼 {publicCode}</p>}
          </div>
          <form onSubmit={handleLookup} className="flex gap-2">
            <label className="sr-only" htmlFor="public-series-code">系列代碼</label>
            <input id="public-series-code" value={input} onChange={event => setInput(event.target.value.toUpperCase())}
              placeholder="輸入系列代碼" className="min-w-0 px-4 py-3 rounded-lg border border-slate-700 bg-[#161920] font-black uppercase" />
            <button className="px-5 py-3 rounded-lg bg-[#f1c6a6] text-[#0d0f12] font-black">查詢</button>
          </form>
        </header>

        {(!isOnline || isUsingCache) && (
          <div role="alert" className="mb-6 p-4 rounded-xl border border-amber-500/50 bg-amber-950/30 text-amber-200 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>目前離線，畫面可能是快取資料。最後更新：{formatUpdateTime(lastUpdatedAt)}</span>
            <button type="button" onClick={() => setRetryKey(value => value + 1)} className="px-4 py-2 rounded-lg border border-amber-400">重試</button>
          </div>
        )}
        {error && <div role="alert" className="mb-6 p-4 rounded-lg border border-red-500/40 bg-red-950/30 text-red-300 font-bold">{error}</div>}
        {status === 'loading' && <div className="py-20 text-center text-slate-500 font-bold">正在載入系列賽…</div>}
        {status === 'not-found' && <div className="py-20 text-center text-slate-500 font-bold">找不到此公開系列賽。</div>}
        {status === 'idle' && <div className="py-20 text-center text-slate-500 font-bold">請輸入系列代碼。</div>}

        {series && (
          <>
            <div className="mb-6 text-right text-xs font-bold text-slate-500">
              {isUsingCache ? '離線快取' : '即時更新中'}・最後更新 {formatUpdateTime(lastUpdatedAt)}
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-black text-[#b6d2d4] mb-4">系列場次</h2>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {series.events.map(event => {
                  const tournament = tournamentsByCode[event.eventCode];
                  return (
                    <article key={event.id} className="p-5 rounded-2xl border border-slate-700 bg-[#161920]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-2xl font-black">{event.name}</h3>
                          <p className="text-xs font-bold text-slate-500 mt-1">#{event.eventCode}</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-cyan-950/60 text-[#b6d2d4]">
                          {tournament ? PHASE_LABELS[tournament.phase] || tournament.phase : '載入中'}
                        </span>
                      </div>
                      <p className="mt-5 text-sm font-bold text-slate-400">
                        {event.judgeCount} 位評審・{event.doubleElimination ? '兩敗淘汰' : '不淘汰'}
                      </p>
                      <a href={`${window.location.pathname}?event=${event.eventCode}`}
                        className="block mt-5 py-3 rounded-lg text-center font-black bg-[#b6d2d4] text-[#0d0f12]">
                        查看單場賽況
                      </a>
                    </article>
                  );
                })}
                {series.events.length === 0 && <div className="p-10 text-center border border-dashed border-slate-700 rounded-xl text-slate-500 font-bold">目前沒有公開場次。</div>}
              </div>
            </section>

            <section className="p-4 md:p-6 rounded-2xl border border-slate-700 bg-[#161920]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                <h2 className="text-2xl font-black text-[#f1c6a6]">系列積分排名</h2>
                <span className="text-xs font-bold text-slate-500">只有公開且已完賽場次計分</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[42rem] text-left border-collapse">
                  <thead className="bg-[#0d0f12] text-xs text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="p-3 text-center sticky left-0 z-20 bg-[#0d0f12]">排名</th>
                      <th className="p-3 sticky left-14 z-20 bg-[#0d0f12]">選手</th>
                      {series.events.map(event => <th key={event.id} className="p-3 text-center">{event.name}</th>)}
                      <th className="p-3 text-center text-[#f1c6a6]">總積分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map(standing => (
                      <tr key={standing.name} className="border-t border-slate-800">
                        <td className="p-3 text-center font-black text-[#b6d2d4] sticky left-0 z-10 bg-[#161920]">{standing.displayRank}</td>
                        <td className="p-3 font-black text-white sticky left-14 z-10 bg-[#161920]">{standing.name}</td>
                        {series.events.map(event => <td key={event.id} className="p-3 text-center font-bold text-slate-300">{standing.eventPoints[event.eventCode] || 0}</td>)}
                        <td className="p-3 text-center text-xl font-black text-[#f1c6a6]">{standing.totalPoints}</td>
                      </tr>
                    ))}
                    {standings.length === 0 && <tr><td colSpan={series.events.length + 3} className="p-10 text-center text-slate-500 font-bold">尚無可計分的完賽結果。</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
