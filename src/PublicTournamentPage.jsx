import React, { useEffect, useState } from 'react';
import { isFirebaseConfigured } from './firebase';
import { normalizeEventCode, subscribeTournament, validateEventCode } from './services/tournamentRepository';
import { eventRanking, FINAL } from './seasonTournament';
import PlayoffBracket from './PlayoffBracket';
import PublicTournamentBracket from './PublicTournamentBracket';
import { BLACK_HORSE, SERIES } from './series';

const PHASE_LABELS = {
  registration: '報名中',
  playing: '進行中',
  finished: '已完賽'
};

export function PublicTournamentRanking({ tournament, rankedPlayers, prominent = false }) {
  const isFinished = tournament.phase === 'finished';
  const isFinal = tournament.rulesVersion === FINAL;
  const title = isFinal ? '瑞士制排名' : isFinished ? '最終排名' : '即時排名';
  return <section id="event-ranking" aria-label={title} className={'event-board ' + (prominent ? 'mb-8' : '')}>
    <h2>{title}</h2>
    {rankedPlayers.length === 0 && <p className="text-slate-300">尚無選手排名。</p>}
    <ol>{rankedPlayers.map(player => <li key={player.id}>
      <span className="place">{player.displayRank}</span>
      <strong className="stage-name">{player.name}</strong>
      {isFinished && !isFinal && <b className="event-points">本場積分 {player.rankingPoints}</b>}
      <div className="record"><span>{player.wins} 勝 {player.losses || 0} 敗 · {player.votes} 票</span>
        {!player.isWithdrawn && <><span>對手勝率 {(player.opponentWinRate * 100).toFixed(1)}%</span>
          <span>次級勝率 {(player.opponentsOpponentWinRate * 100).toFixed(1)}%</span></>}
        {player.seedCredit && <span>種子 · 首輪 1 勝 5 票</span>}
        {player.isOrganizer && <span>主辦方補位</span>}
        {player.revivedRound && <span>第 {player.revivedRound} 輪復活</span>}
        {player.isWithdrawn ? <span>已棄賽</span> : player.isEliminated && <span>兩敗淘汰</span>}
        {player.needsTiebreaker && <span>並列</span>}
      </div>
    </li>)}</ol>
  </section>;
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
    if (code === eventCode) {
      setRetryKey(value => value + 1);
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
  const rankedPlayers = tournament ? eventRanking(tournament) : [];
  const parentSeries = tournament?.seriesId
    ? SERIES.find(series => series.id === tournament.seriesId)
    : null;

  return (
    <main className="spectator-page min-h-screen bg-[#0d0f12] text-slate-100 p-3 sm:p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 md:gap-6 mb-4 md:mb-8 border-b border-slate-800 pb-4 md:pb-8">
          <div>
            <div className="spectator-header-links">
            {eventCode && <a href={window.location.pathname} className="text-sm font-bold text-slate-500 hover:text-slate-200">← 查詢其他賽事</a>}
            {parentSeries?.publicCode && <a href={`${window.location.pathname}?series=${parentSeries.publicCode}`} className="ml-4 text-sm font-bold text-[#b6d2d4] hover:text-white">查看整個系列賽</a>}
            </div>
            <h1 className="text-3xl md:text-4xl font-black mt-2 break-words">{tournament?.name || '觀眾即時賽況'}</h1>
            {tournament && <p className="mt-2 text-slate-400 font-bold">代碼 {eventCode}・{PHASE_LABELS[tournament.phase] || tournament.phase}・{tournament.judgeCount} 位評審・{tournament.doubleElimination ? '兩敗淘汰' : '不淘汰'}</p>}
          </div>
          <form onSubmit={handleLookup} className="flex gap-2">
            <label className="sr-only" htmlFor="public-event-code">賽事代碼</label>
            <input id="public-event-code" value={input} onChange={event => setInput(event.target.value.toUpperCase())}
              placeholder="輸入賽事代碼" className="min-w-0 flex-1 px-4 py-3 rounded-lg border border-slate-700 bg-[#161920] font-black uppercase" />
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
        {status === 'loading' && <div role="status" className="py-20 text-center text-slate-500 font-bold">正在載入賽事…</div>}
        {status === 'not-found' && <div className="py-20 text-center text-slate-500 font-bold">找不到此賽事。</div>}
        {status === 'idle' && <div className="py-20 text-center text-slate-500 font-bold">請輸入賽事代碼。<a className="block mt-4 underline text-[#b6d2d4]" href={'?series='+BLACK_HORSE.publicCode}>查看{BLACK_HORSE.name}系列賽</a></div>}

        {tournament && (
          <>
            <div className="flex justify-end mb-4 text-xs font-bold text-slate-500">
              {tournament.sync?.hasPendingWrites ? '資料同步中' : tournament.sync?.fromCache ? '離線快取' : '即時更新中'}・最後更新 {tournament.clientUpdatedAt ? new Date(tournament.clientUpdatedAt).toLocaleString('zh-TW') : '尚未取得'}
            </div>

            {rounds.length > 0 && <nav aria-label="單場賽況導覽" className="spectator-jumps">
              {rounds.map((_, i) => <a key={i} href={`#swiss-round-${i+1}`}>第 {i+1} 輪</a>)}
              <a href="#event-ranking">排名</a>
              {tournament.playoffSeeds?.length > 0 && <a href="#playoff">八強</a>}
            </nav>}
            {tournament.playoffSeeds?.length > 0 && <PlayoffBracket event={tournament} />}
            {tournament.phase === 'finished' && (
              <PublicTournamentRanking tournament={tournament} rankedPlayers={rankedPlayers} prominent />
            )}

            {rounds.length > 0 && (
              <section className="mb-10 bg-[#11151b] border border-slate-700 rounded-2xl p-4 md:p-7">
                <div className="mb-6">
                  <h2 className="text-2xl md:text-3xl font-black text-[#b6d2d4]">完整瑞士制樹狀圖</h2>
                  <p className="mt-2 text-sm font-bold text-slate-500">依輪次與勝場分組呈現，比分及戰績會隨後台操作即時更新。</p>
                </div>
                {tournament.players?.some(p=>p.seedCredit) && <p className="mb-4 text-slate-300">首輪種子（一勝五票） · {tournament.players.filter(p=>p.seedCredit).map(p=>p.name).join('、')}</p>}
                <PublicTournamentBracket rounds={rounds} />
              </section>
            )}

            {!rounds.length && <p className="p-5 text-slate-400">尚未產生賽程</p>}
            {tournament.phase !== 'finished' && <PublicTournamentRanking tournament={tournament} rankedPlayers={rankedPlayers}/>}
          </>
        )}
      </div>
    </main>
  );
}
