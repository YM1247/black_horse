import React, { useEffect, useState } from 'react';
import { isFirebaseConfigured } from './firebase';
import { normalizeEventCode, subscribeTournament, validateEventCode } from './services/tournamentRepository';
import { rankPlayers } from './tournament';

const PHASE_LABELS = {
  registration: '報名中',
  playing: '進行中',
  finished: '已完賽'
};

export default function PublicTournamentPage({ initialCode = '' }) {
  const [input, setInput] = useState(initialCode);
  const [eventCode, setEventCode] = useState(validateEventCode(initialCode) ? normalizeEventCode(initialCode) : '');
  const [tournament, setTournament] = useState(null);
  const [status, setStatus] = useState(eventCode ? 'loading' : 'idle');
  const [error, setError] = useState('');

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
  }, [eventCode]);

  const handleLookup = (event) => {
    event.preventDefault();
    const code = normalizeEventCode(input);
    if (!validateEventCode(code)) {
      setError('賽事代碼需為 4–10 位英文字母或數字。');
      return;
    }
    window.history.replaceState({}, '', `${window.location.pathname}?event=${code}`);
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

  return (
    <main className="min-h-screen bg-[#0d0f12] text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 border-b border-slate-800 pb-8">
          <div>
            {eventCode && <a href={window.location.pathname} className="text-sm font-bold text-slate-500 hover:text-slate-200">← 查詢其他賽事</a>}
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
        {status === 'loading' && <div className="py-20 text-center text-slate-500 font-bold">正在載入賽事…</div>}
        {status === 'not-found' && <div className="py-20 text-center text-slate-500 font-bold">找不到此賽事。</div>}
        {status === 'idle' && <div className="py-20 text-center text-slate-500 font-bold">請輸入賽事代碼。</div>}

        {tournament && (
          <>
            <div className="flex justify-end mb-4 text-xs font-bold text-slate-500">
              {tournament.sync?.hasPendingWrites ? '資料同步中' : tournament.sync?.fromCache ? '離線快取' : '即時更新中'}
            </div>
            <div className="grid xl:grid-cols-[1fr_22rem] gap-8">
              <section className="space-y-8">
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

              <aside className="bg-[#161920] border border-slate-700 rounded-2xl p-6 h-fit xl:sticky xl:top-6">
                <h2 className="text-xl font-black text-[#f1c6a6] mb-5">即時排名</h2>
                <div className="space-y-3">
                  {rankedPlayers.map(player => (
                    <div key={player.id} className={`border border-slate-800 rounded-lg p-4 ${player.isWithdrawn || player.isEliminated ? 'opacity-60' : ''}`}>
                      <div className="flex justify-between gap-3">
                        <span className="font-black">{player.displayRank}. {player.name}</span>
                        <span className="font-black text-[#b6d2d4]">{player.wins}W{tournament.doubleElimination ? ` / ${player.losses || 0}L` : ''} / {player.votes}pt</span>
                      </div>
                      {!player.isWithdrawn && <div className="text-[11px] mt-2 text-slate-500">對手勝率 {(player.opponentWinRate * 100).toFixed(1)}%・次級 {(player.opponentsOpponentWinRate * 100).toFixed(1)}%</div>}
                      {player.isEliminated && <div className="text-xs text-amber-300 font-black mt-2">兩敗淘汰</div>}
                      {player.isWithdrawn && <div className="text-xs text-red-300 font-black mt-2">已棄賽</div>}
                      {!player.isEliminated && player.needsTiebreaker && <div className="text-xs text-[#f1c6a6] font-black mt-2">需加賽</div>}
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
