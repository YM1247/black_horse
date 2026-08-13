import React, { useEffect, useMemo, useState } from 'react';
import { applyDoubleElimination, rankPlayers, recalculatePlayerRecords, updateMatchScore } from './tournament';

const buildChanges = (originalPlayers, originalRounds, players, rounds) => {
  const changes = [];
  const originalPlayerById = new Map(originalPlayers.map(player => [player.id, player]));
  players.forEach(player => {
    const before = originalPlayerById.get(player.id)?.name;
    if (before !== player.name) changes.push({ type: 'player-name', playerId: player.id, before, after: player.name });
  });
  const originalMatchById = new Map(originalRounds.flat().map(match => [match.id, match]));
  rounds.flat().forEach(match => {
    const before = originalMatchById.get(match.id);
    if (before && (before.p1Votes !== match.p1Votes || before.p2Votes !== match.p2Votes)) {
      changes.push({
        type: 'score',
        matchId: match.id,
        players: [match.p1.name, match.p2.name],
        before: { p1Votes: before.p1Votes, p2Votes: before.p2Votes },
        after: { p1Votes: match.p1Votes, p2Votes: match.p2Votes }
      });
    }
  });
  return changes;
};

export default function ResultCorrectionPanel({
  players,
  rounds,
  judgeCount,
  doubleElimination,
  versions = [],
  runId,
  currentVersion,
  otherSeriesPlayerNames = [],
  busy = false,
  onCancel,
  onCommit,
  onRestore
}) {
  const [draftPlayers, setDraftPlayers] = useState(() => players.map(player => ({ ...player })));
  const [draftRounds, setDraftRounds] = useState(() => rounds.map(round => round.map(match => ({ ...match, p1: { ...match.p1 }, p2: { ...match.p2 } }))));
  const [reason, setReason] = useState('');
  const [armedUntil, setArmedUntil] = useState(0);
  const [restoreVersion, setRestoreVersion] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!armedUntil) return undefined;
    const timer = window.setTimeout(() => setArmedUntil(0), Math.max(0, armedUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [armedUntil]);

  const changes = useMemo(
    () => buildChanges(players, rounds, draftPlayers, draftRounds),
    [players, rounds, draftPlayers, draftRounds]
  );
  const ranked = useMemo(() => rankPlayers(draftPlayers, draftRounds), [draftPlayers, draftRounds]);
  const duplicateNames = useMemo(() => {
    const seen = new Set();
    return draftPlayers.map(player => player.name.trim()).filter(name => !name || seen.has(name) || !seen.add(name));
  }, [draftPlayers]);
  const mergedNames = useMemo(() => {
    const names = new Set(otherSeriesPlayerNames);
    return changes.filter(change => change.type === 'player-name' && names.has(change.after)).map(change => change.after);
  }, [changes, otherSeriesPlayerNames]);

  const renamePlayer = (playerId, name) => {
    setDraftPlayers(current => current.map(player => player.id === playerId ? { ...player, name } : player));
    setDraftRounds(current => current.map(round => round.map(match => ({
      ...match,
      p1: match.p1.id === playerId ? { ...match.p1, name } : match.p1,
      p2: match.p2.id === playerId ? { ...match.p2, name } : match.p2
    }))));
    setArmedUntil(0);
  };

  const updateScore = (roundIndex, matchId, p1Votes, p2Votes) => {
    const updatedRounds = updateMatchScore(draftRounds, roundIndex, matchId, p1Votes, p2Votes);
    setDraftRounds(updatedRounds);
    setDraftPlayers(current => applyDoubleElimination(recalculatePlayerRecords(current, updatedRounds), updatedRounds, doubleElimination));
    setArmedUntil(0);
  };

  const confirmCorrection = async () => {
    if (!reason.trim()) return setError('請填寫更正原因。');
    if (changes.length === 0) return setError('尚未修改任何比分或選手姓名。');
    if (duplicateNames.length > 0) return setError('選手姓名不可空白或重複。');
    if (armedUntil <= Date.now()) {
      setArmedUntil(Date.now() + 10000);
      setError('請在 10 秒內再次點擊紅色按鈕，確認送出更正。');
      return;
    }
    await onCommit({ players: draftPlayers, rounds: draftRounds, reason: reason.trim(), changes });
  };

  const confirmRestore = async () => {
    if (!restoreVersion) return;
    if (!reason.trim()) return setError('請填寫回復原因。');
    if (armedUntil <= Date.now()) {
      setArmedUntil(Date.now() + 10000);
      setError('請在 10 秒內再次點擊紅色按鈕，確認回復版本。');
      return;
    }
    await onRestore(restoreVersion, reason.trim());
  };

  return (
    <section className="w-full max-w-7xl mx-auto space-y-7" aria-label="完賽結果更正工作區">
      <header className="p-6 rounded-2xl border-2 border-amber-400/60 bg-amber-950/20">
        <h2 className="text-3xl font-black text-white">完賽結果更正</h2>
        <p className="mt-2 text-sm font-bold text-amber-200">原始配對會完整保留；送出後將重新計算勝敗、名次、單場積分與系列排名，並永久建立新版本。</p>
      </header>

      {error && <div role="alert" className="p-4 rounded-xl border border-red-500/50 bg-red-950/30 text-red-200 font-bold">{error}</div>}
      {mergedNames.length > 0 && <div className="p-4 rounded-xl border border-cyan-500/40 bg-cyan-950/30 text-cyan-100 font-bold">改名後將與其他場次的「{[...new Set(mergedNames)].join('、')}」合併系列積分。</div>}

      <section className="p-5 rounded-2xl border border-slate-700 bg-[#161920]">
        <h3 className="text-xl font-black text-[#f1c6a6] mb-4">選手姓名</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {draftPlayers.filter(player => !player.isMC).map(player => (
            <label key={player.id} className="text-xs font-bold text-slate-500">
              原名：{players.find(item => item.id === player.id)?.name}
              <input aria-label={`更正 ${players.find(item => item.id === player.id)?.name} 姓名`} value={player.name}
                onChange={event => renamePlayer(player.id, event.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-700 bg-[#0d0f12] text-white font-black" />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        {draftRounds.map((round, roundIndex) => (
          <article key={roundIndex} className="p-5 rounded-2xl border border-slate-700 bg-[#161920]">
            <h3 className="text-xl font-black text-[#b6d2d4] mb-4">ROUND {roundIndex + 1}</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {round.map(match => (
                <div key={match.id} className="p-4 rounded-xl border border-slate-800 bg-[#0d0f12]">
                  <div className="font-black text-center text-white">{match.p1.name} vs {match.p2.name}</div>
                  <div className={`grid ${judgeCount === 3 ? 'grid-cols-4' : 'grid-cols-6'} gap-1 mt-3`}>
                    {Array.from({ length: judgeCount + 1 }, (_, p2Votes) => ({ p1Votes: judgeCount - p2Votes, p2Votes })).map(score => {
                      const selected = match.p1Votes === score.p1Votes && match.p2Votes === score.p2Votes;
                      return <button key={`${score.p1Votes}-${score.p2Votes}`} type="button"
                        onClick={() => updateScore(roundIndex, match.id, score.p1Votes, score.p2Votes)}
                        className={`py-2 rounded text-xs font-black border ${selected ? 'bg-[#b6d2d4] text-black border-transparent' : 'border-slate-700 text-slate-400'}`}>
                        {score.p1Votes}:{score.p2Votes}
                      </button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="p-5 rounded-2xl border border-slate-700 bg-[#161920]">
        <h3 className="text-xl font-black text-[#f1c6a6] mb-3">更正後排名預覽</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ranked.map(player => <div key={player.id} className="p-3 rounded-lg border border-slate-800"><span className="font-black">{player.displayRank}. {player.name}</span><span className="float-right text-[#b6d2d4] font-black">{player.rankingPoints} 分</span></div>)}
        </div>
      </section>

      <section className="p-5 rounded-2xl border border-slate-700 bg-[#161920]">
        <h3 className="text-xl font-black text-[#f1c6a6]">版本紀錄</h3>
        <div className="mt-3 space-y-2">
          {versions.map(version => {
            const restorable = version.runId === runId && version.version !== currentVersion;
            return <div key={version.id} className="p-3 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div><span className="font-black text-white">v{version.version}</span><span className="ml-2 text-xs text-slate-500">{version.type}・{version.reason || '無說明'}</span></div>
              {restorable && <button type="button" onClick={() => { setRestoreVersion(version); setReason(''); setArmedUntil(0); setError(''); }} className="px-3 py-2 rounded-lg border border-[#b6d2d4] text-[#b6d2d4] font-black">回復此版本</button>}
              {version.runId !== runId && <span className="text-xs font-bold text-slate-600">舊場次紀錄・僅供查看</span>}
            </div>;
          })}
        </div>
      </section>

      <section className="p-5 rounded-2xl border-2 border-[#f1c6a6] bg-[#161920]">
        <label htmlFor="result-correction-reason" className="font-black text-white">{restoreVersion ? `回復至 v${restoreVersion.version} 的原因` : '更正原因'}</label>
        <textarea id="result-correction-reason" value={reason} onChange={event => { setReason(event.target.value); setArmedUntil(0); }} rows="3" className="mt-2 w-full p-3 rounded-lg border border-slate-700 bg-[#0d0f12]" />
        {!restoreVersion && <div className="mt-3 text-sm font-bold text-slate-400">共 {changes.length} 項變更。第一次點擊會進入 10 秒確認狀態，第二次才會正式發布。</div>}
        <div className="mt-5 flex flex-col-reverse sm:flex-row justify-end gap-3">
          <button type="button" disabled={busy} onClick={restoreVersion ? () => { setRestoreVersion(null); setReason(''); setArmedUntil(0); } : onCancel} className="px-5 py-3 rounded-lg border border-slate-600 font-black">{restoreVersion ? '取消回復' : '取消更正'}</button>
          <button type="button" disabled={busy} onClick={restoreVersion ? confirmRestore : confirmCorrection}
            className={`px-5 py-3 rounded-lg font-black disabled:opacity-40 ${armedUntil > Date.now() ? 'bg-red-500 text-white' : 'bg-[#f1c6a6] text-black'}`}>
            {busy ? '處理中…' : armedUntil > Date.now() ? '再次點擊確認執行' : restoreVersion ? '準備回復版本' : '預覽並準備送出更正'}
          </button>
        </div>
      </section>
    </section>
  );
}
