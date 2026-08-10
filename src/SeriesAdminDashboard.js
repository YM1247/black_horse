import React, { useState } from 'react';
import { generateEventCode, normalizeEventCode } from './services/tournamentRepository';

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
  mutationStatus = '',
  onBack,
  onOpenEvent,
  onCreateEvent,
  onAddEvent,
  onClearEvent,
  onDeleteEvent
}) {
  const [newEventName, setNewEventName] = useState('');
  const [newEventCode, setNewEventCode] = useState(() => generateEventCode());
  const tournamentByCode = new Map(tournaments.map(tournament => [tournament.id, tournament]));
  const finishedCount = series.events.filter(event => tournamentByCode.get(event.eventCode)?.phase === 'finished').length;
  const isBusy = Boolean(creatingEventCode || mutationStatus);

  const handleAddEvent = async (event) => {
    event.preventDefault();
    const added = await onAddEvent(series, { name: newEventName, eventCode: newEventCode });
    if (!added) return;
    setNewEventName('');
    setNewEventCode(generateEventCode());
  };

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

      <section className="p-5 rounded-xl border bg-[#161920] border-slate-700">
        <h4 className="font-black text-lg text-[#f1c6a6]">新增系列場次</h4>
        <p className="mt-1 text-xs font-bold text-slate-500">先新增保留名稱與賽制標籤的場次卡，再從卡片建立實際賽事。</p>
        <form onSubmit={handleAddEvent} className="mt-4 grid sm:grid-cols-[1fr_11rem_auto] gap-3">
          <input aria-label="新場次名稱" value={newEventName} onChange={event => setNewEventName(event.target.value)}
            placeholder="場次名稱，例如 8/28" className="px-4 py-3 rounded-lg border border-slate-700 bg-[#0d0f12]" />
          <input aria-label="新場次代碼" value={newEventCode} onChange={event => setNewEventCode(normalizeEventCode(event.target.value))}
            className="px-4 py-3 rounded-lg border border-slate-700 bg-[#0d0f12] font-black uppercase" />
          <button type="submit" disabled={isBusy || !newEventName.trim() || !newEventCode.trim()}
            className="px-5 py-3 rounded-lg font-black bg-[#f1c6a6] text-[#0d0f12] disabled:opacity-40">
            {mutationStatus === 'adding' ? '新增中…' : '新增場次'}
          </button>
        </form>
      </section>

      <section>
        <h4 className="font-black text-lg mb-3 text-[#f1c6a6]">系列場次 ({series.events.length})</h4>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {series.events.map(event => {
            const tournament = tournamentByCode.get(event.eventCode);
            const isCreating = creatingEventCode === event.eventCode;
            const isClearing = mutationStatus === `clear:${event.eventCode}`;
            const isDeleting = mutationStatus === `delete:${event.eventCode}`;
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
                <div className="mt-auto pt-4 grid grid-cols-2 gap-2">
                  <button type="button" disabled={isBusy}
                    onClick={() => tournament ? onOpenEvent(series, event, tournament) : onCreateEvent(series, event)}
                    className="col-span-2 py-3 rounded-lg font-black disabled:opacity-40 bg-[#b6d2d4] text-[#0d0f12]">
                    {isCreating ? '建立中…' : tournament ? `管理 ${event.name}` : `建立 ${event.name}`}
                  </button>
                  {tournament && <button type="button" disabled={isBusy} onClick={() => onClearEvent(series, event, tournament)}
                    className="py-2.5 rounded-lg font-black border border-[#f1c6a6] text-[#f1c6a6] disabled:opacity-40">
                    {isClearing ? '清除中…' : '清除內容'}
                  </button>}
                  <button type="button" disabled={isBusy} onClick={() => onDeleteEvent(series, event, tournament)}
                    className={`${tournament ? '' : 'col-span-2'} py-2.5 rounded-lg font-black border border-red-500/50 text-red-300 disabled:opacity-40`}>
                    {isDeleting ? '刪除中…' : '刪除場次'}
                  </button>
                </div>
              </article>
            );
          })}
          {series.events.length === 0 && <div className="md:col-span-2 xl:col-span-3 p-10 text-center rounded-xl border border-dashed border-slate-700 text-slate-500 font-bold">尚無系列場次，請從上方新增。</div>}
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
