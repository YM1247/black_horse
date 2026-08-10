import React from 'react';

const PHASE_LABELS = {
  registration: '報名中',
  playing: '進行中',
  finished: '已完賽'
};

export default function SeriesAdminDashboard({
  series,
  tournaments = [],
  standings = [],
  creatingEventCode = '',
  onBack,
  onOpenEvent,
  onCreateEvent
}) {
  const tournamentByCode = new Map(tournaments.map(tournament => [tournament.id, tournament]));
  const finishedCount = series.events.filter(event => tournamentByCode.get(event.eventCode)?.phase === 'finished').length;

  return (
    <div className="space-y-7">
      <section>
        <button type="button" onClick={onBack} className="text-sm font-black text-slate-500 hover:text-slate-200">← 返回雲端管理首頁</button>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h3 className="text-3xl font-black text-white">{series.name}</h3>
            <p className="mt-2 text-sm font-bold text-slate-400">{series.description}・已完成 {finishedCount}/{series.events.length} 場</p>
          </div>
          <div className="text-xs font-black text-[#b6d2d4]">同名選手跨場自動合併積分</div>
        </div>
      </section>

      <section>
        <h4 className="font-black text-lg mb-3 text-[#f1c6a6]">三場賽事</h4>
        <div className="grid md:grid-cols-3 gap-4">
          {series.events.map(event => {
            const tournament = tournamentByCode.get(event.eventCode);
            const isCreating = creatingEventCode === event.eventCode;
            return (
              <article key={event.id} className="p-5 rounded-xl border-2 bg-[#161920] border-slate-700 flex flex-col min-h-52">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h5 className="text-2xl font-black text-white">{event.name}</h5>
                    <div className="text-xs font-black mt-1 text-slate-500">#{event.eventCode}</div>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full ${tournament ? 'bg-cyan-950/60 text-[#b6d2d4]' : 'bg-slate-800 text-slate-500'}`}>
                    {tournament ? PHASE_LABELS[tournament.phase] || tournament.phase : '尚未建立'}
                  </span>
                </div>
                <div className="mt-5 text-sm font-bold text-slate-400 space-y-1">
                  <div>3 位評審・兩敗淘汰</div>
                  <div>{tournament ? `${tournament.players?.length || 0} 位選手・${tournament.isPublic ? '公開' : '未公開'}` : '獨立報名名單'}</div>
                </div>
                <button type="button" disabled={Boolean(creatingEventCode)}
                  onClick={() => tournament ? onOpenEvent(series, event, tournament) : onCreateEvent(series, event)}
                  className="mt-auto pt-3 pb-3 rounded-lg font-black disabled:opacity-40 bg-[#b6d2d4] text-[#0d0f12]">
                  {isCreating ? '建立中…' : tournament ? `管理 ${event.name}` : `建立 ${event.name}`}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="p-5 rounded-xl border bg-[#161920] border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h4 className="font-black text-lg text-[#f1c6a6]">系列積分排名</h4>
          <span className="text-xs font-bold text-slate-500">只有已完賽場次計入總分</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[42rem] text-left border-collapse">
            <thead className="bg-[#0d0f12] text-xs text-slate-500 uppercase tracking-widest">
              <tr>
                <th className="p-3 text-center">排名</th>
                <th className="p-3">選手</th>
                {series.events.map(event => <th key={event.id} className="p-3 text-center">{event.name}</th>)}
                <th className="p-3 text-center">參賽</th>
                <th className="p-3 text-center text-[#f1c6a6]">總積分</th>
              </tr>
            </thead>
            <tbody>
              {standings.map(standing => (
                <tr key={standing.name} className="border-t border-slate-800">
                  <td className="p-3 text-center font-black text-[#b6d2d4]">{standing.displayRank}</td>
                  <td className="p-3 font-black text-white">{standing.name}</td>
                  {series.events.map(event => <td key={event.id} className="p-3 text-center font-bold text-slate-300">{standing.eventPoints[event.eventCode] || 0}</td>)}
                  <td className="p-3 text-center text-slate-400">{standing.participatedEvents}</td>
                  <td className="p-3 text-center text-xl font-black text-[#f1c6a6]">{standing.totalPoints}</td>
                </tr>
              ))}
              {standings.length === 0 && (
                <tr><td colSpan={series.events.length + 4} className="p-10 text-center font-bold text-slate-500">建立賽事並加入選手後，系列排名會顯示在這裡。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
