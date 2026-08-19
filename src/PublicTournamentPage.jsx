import React, { useEffect, useState } from 'react';
import { isFirebaseConfigured } from './firebase';
import { normalizeEventCode, subscribeTournament, validateEventCode } from './services/tournamentRepository';
import { rankPlayers } from './tournament';
import PublicTournamentBracket from './PublicTournamentBracket';
import { SERIES } from './series';

const PHASE_LABELS = {
  registration: '報名中',
  playing: '進行中',
  finished: '已完賽'
};

export function PublicTournamentRanking({ tournament, rankedPlayers, prominent = false }) {
  const isFinished = tournament.phase === 'finished';
  return (
    <section
      aria-label={isFinished ? '最終排名' : '即時排名'}
      className={`bg-[#161920] border border-slate-700 rounded-2xl p-6 h-fit ${prominent ? 'mb-10' : 'xl:sticky xl:top-6'}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
        <h2 className={`${prominent ? 'text-2xl md:text-3xl' : 'text-xl'} font-black text-[#f1c6a6]`}>
          {isFinished ? '最終排名' : '即時排名'}
        </h2>
        {isFinished && <span className="text-xs font-bold text-slate-500">完賽結果與本場積分</span>}
      </div>
      <div className={prominent ? 'grid md:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-3'}>
        {rankedPlayers.map(player => (
          <div key={player.id} className={`border border-slate-800 rounded-lg p-4 ${player.isWithdrawn || player.isEliminated ? 'opacity-60' : ''}`}>
            <div className="flex justify-between gap-3">
              <span className="font-black min-w-0 break-words">{player.displayRank}. {player.name}</span>
              <span className="font-black text-[#b6d2d4] shrink-0">{player.wins}W{tournament.doubleElimination ? ` / ${player.losses || 0}L` : ''} / {player.votes}票</span>
            </div>
            {isFinished && <div className="text-sm text-[#f1c6a6] font-black mt-2">本場積分 {player.rankingPoints}</div>}
            {!player.isWithdrawn && <div className="text-[11px] mt-2 text-slate-500">對手勝率 {(player.opponentWinRate * 100).toFixed(1)}%・次級 {(player.opponentsOpponentWinRate * 100).toFixed(1)}%</div>}
            {player.isEliminated && <div className="text-xs text-amber-300 font-black mt-2">兩敗淘汰</div>}
            {player.isWithdrawn && <div className="text-xs text-red-300 font-black mt-2">已棄賽</div>}
            {!player.isEliminated && player.needsTiebreaker && <div className="text-xs text-[#f1c6a6] font-black mt-2">需加賽</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PublicTournamentPage({ initialCode = '' }) {
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
      const code = normalizeEventCode(new URLSearchParams(window.location.search).get('event') || '');
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
  }, []);

  useEffect(() => {
    document.title = tournament?.name
      ? `${tournament.name}｜即時賽況`
      : '黑馬記念｜公開賽事';
  }, [tournament?.name]);

  useEffect(() => {
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
  }, [eventCode, retryKey]);

  const handleLookup = (event) => {
    event.preventDefault();
    const code = normalizeEventCode(input);
    if (!validateEventCode(code)) {
      setError('賽事代碼需為 4–10 位英文字母或數字。');
      return;
    }
    setTournament(null);
    setStatus('loading');
    window.history.pushState({}, '', `${window.location.pathname}?event=${code}`);
    setEventCode(code);
  };

  if (!isFirebaseConfigured) {
    return (
      <main className="min-h-screen bg-[#0d0f12] text-slate-100 flex items-center justify-center p-6">
        <section className="max-w-lg w-full bg-[#161920] border border-slate-700 rounded-2xl p-8 text-center">
          <h1 className="text-3xl font-black mb-4">公開賽事查詢</h1>
          <p className="text-slate-400 leading-relaxed">此部署尚未設定 Firebase，暫時無法查詢雲端賽事。</p>
          <a href={window.location.pathname} className="inline-block mt-6 px-6 py-3 bg-slate-200 text-slate-950 rounded-lg font-black">返回賽事系統</a>
        </section>
      </main>
    );
  }

  const rounds = Array.isArray(tournament?.rounds) ? tournament.rounds : [];
  const players = Array.isArray(tournament?.players) ? tournament.players : [];
  const rankedPlayers = tournament ? rankPlayers(players, rounds) : [];
  const parentSeries = tournament?.seriesId
    ? SERIES.find(series => series.id === tournament.seriesId)
    : null;

  return (
    <main className="min-h-screen bg-[#0d0f12] text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 border-b border-slate-800 pb-8">
          <div>
            {eventCode && <a href={window.location.pathname} className="text-sm font-bold text-slate-500 hover:text-slate-200">← 查詢其他賽事</a>}
            {parentSeries?.publicCode && <a href={`${window.location.pathname}?series=${parentSeries.publicCode}`} className="ml-4 text-sm font-bold text-[#b6d2d4] hover:text-white">查看整個系列賽</a>}
            <h1 className="text-4xl font-black mt-3">{tournament?.name || '觀眾即時賽況'}</h1>
            {tournament && <p className="mt-2 text-slate-400 font-bold">代碼 {eventCode}・{PHASE_LABELS[tournament.phase] || tournament.phase}・{tournament.judgeCount} 位評審・{tournament.doubleElimination ? '兩敗淘汰' : '不淘汰'}</p>}
          </div>
          <form onSubmit={handleLookup} className="flex gap-2">
            <label className="sr-only" htmlFor="public-event-code">賽事代碼</label>
            <input id="public-event-code" value={input} onChange={event => setInput(event.target.value.toUpperCase())}
              placeholder="輸入賽事代碼" className="px-4 py-3 rounded-lg border border-slate-700 bg-[#161920] font-black uppercase" />
            <button className="px-5 py-3 rounded-lg bg-[#b6d2d4] text-[#0d0f12] font-black">查詢</button>
          </form>
        </header>

        {error && <div role="alert" className="mb-6 p-4 rounded-lg border border-red-500/40 bg-red-950/30 text-red-300 font-bold">{error}</div>}
        {tournament && (!isOnline || tournament.sync?.fromCache) && (
          <div role="alert" className="mb-6 p-4 rounded-xl border border-amber-500/50 bg-amber-950/30 text-amber-200 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>目前離線，顯示的是快取資料。最後更新：{tournament.clientUpdatedAt ? new Date(tournament.clientUpdatedAt).toLocaleString('zh-TW') : '尚未取得'}</span>
            <button type="button" onClick={() => setRetryKey(value => value + 1)} className="px-4 py-2 rounded-lg border border-amber-400">重試</button>
          </div>
        )}
        {status === 'loading' && <div className="py-20 text-center text-slate-500 font-bold">正在載入賽事…</div>}
        {status === 'not-found' && <div className="py-20 text-center text-slate-500 font-bold">找不到此賽事。</div>}
        {status === 'idle' && <div className="py-20 text-center text-slate-500 font-bold">請輸入賽事代碼。</div>}

        {tournament && (
          <>
            <div className="flex justify-end mb-4 text-xs font-bold text-slate-500">
              {tournament.sync?.hasPendingWrites ? '資料同步中' : tournament.sync?.fromCache ? '離線快取' : '即時更新中'}・最後更新 {tournament.clientUpdatedAt ? new Date(tournament.clientUpdatedAt).toLocaleString('zh-TW') : '尚未取得'}
            </div>

            {tournament.phase === 'finished' && (
              <PublicTournamentRanking tournament={tournament} rankedPlayers={rankedPlayers} prominent />
            )}

            {rounds.length > 0 && (
              <section className="mb-10 bg-[#11151b] border border-slate-700 rounded-2xl p-4 md:p-7">
                <div className="mb-6">
                  <h2 className="text-2xl md:text-3xl font-black text-[#b6d2d4]">完整瑞士制樹狀圖</h2>
                  <p className="mt-2 text-sm font-bold text-slate-500">依輪次與勝場分組呈現，比分及戰績會隨後台操作即時更新。</p>
                </div>
                <PublicTournamentBracket rounds={rounds} />
              </section>
            )}

            <div className={`grid gap-8 ${tournament.phase === 'finished' ? '' : 'xl:grid-cols-[1fr_22rem]'}`}>
              <section className="space-y-8">
                {rounds.length > 0 && <h2 className="text-2xl font-black text-[#f1c6a6]">逐輪對戰</h2>}
                {rounds.length === 0 && <div className="p-10 border border-dashed border-slate-700 rounded-xl text-center text-slate-500">尚未產生賽程</div>}
                {rounds.map((matches, roundIndex) => (
                  <article key={roundIndex} className="bg-[#161920] border border-slate-700 rounded-2xl p-6">
                    <h2 className="text-2xl font-black mb-5 text-[#b6d2d4]">ROUND {roundIndex + 1}</h2>
                    <div className="grid md:grid-cols-2 gap-4">
                      {matches.map(match => (
                        <div key={match.id} className="bg-[#0d0f12] border border-slate-800 rounded-xl p-5">
                          <div className="flex items-center justify-between gap-3 font-black">
                            <span className="flex-1">{match.p1.name}</span>
                            <span className="text-xl text-[#f1c6a6]">{match.p1Votes ?? '—'} : {match.p2Votes ?? '—'}</span>
                            <span className="flex-1 text-right">{match.p2.name}</span>
                          </div>
                          {match.isMCMatch && <div className="text-center text-xs font-bold text-purple-300 mt-3">MC 對戰</div>}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </section>

              {tournament.phase !== 'finished' && (
                <PublicTournamentRanking tournament={tournament} rankedPlayers={rankedPlayers} />
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
