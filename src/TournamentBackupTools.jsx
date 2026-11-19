import React, { useRef, useState } from 'react';
import { createTournamentBackup, readTournamentBackup } from './tournamentBackup';
import { saveTournamentVersion } from './services/tournamentRepository';

const phases = { registration: '報名中', playing: '進行中', finished: '已完賽' };

function describeState(state) {
  const matches = [...state.rounds.flat(), ...Object.values(state.bracket || {})];
  const completed = matches.filter(match => match.isDone).length;
  return `${phases[state.phase]}，${state.players.length} 位選手，${state.rounds.length} 輪，已完成 ${completed} 場`;
}

export default function TournamentBackupTools({ event, disabled, offline, onBusy }) {
  const [preview, setPreview] = useState(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const selection = useRef(0);
  const writing = useRef(false);

  async function download() {
    try {
      const backup = await createTournamentBackup(event);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = event.id + '-' + backup.exportedAt.replace(/[:.]/g, '-') + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('已送出 JSON 下載。');
    } catch (err) { setMessage(err.message); }
  }

  function reset() {
    selection.current++;
    setPreview(null);
    setCode('');
  }
  async function select(file) {
    reset();
    setMessage('');
    if (!file) return;
    const request = selection.current;
    try {
      const backup = await readTournamentBackup(await file.text(), event);
      if (request === selection.current) setPreview({ backup, revision: event.revision || 0 });
    } catch (err) { if (request === selection.current) setMessage(err.message); }
  }
  const stale = preview && preview.revision !== (event.revision || 0);
  async function restore() {
    if (disabled || offline || writing.current || stale || !preview || code.trim() !== event.id) return;
    writing.current = true;
    setSaving(true);
    onBusy(true);
    try {
      await saveTournamentVersion(event.id, preview.backup.state, {
        expectedRevision: preview.revision, type: 'json-restore',
        reason: '還原 JSON 備份', changes: [{ exportedAt: preview.backup.exportedAt, revision: preview.backup.revision }]
      });
      reset();
      setMessage('已還原賽事資料。');
    } catch (err) { setMessage(err.message); }
    finally { writing.current = false; setSaving(false); onBusy(false); }
  }
  return <details className="mx-auto my-4 max-w-4xl text-sm" onToggle={e => {
    if (e.target === e.currentTarget && !e.currentTarget.open) reset();
  }}>
    <summary className="cursor-pointer">賽事資料工具</summary>
    <div className="space-y-3 py-3">
      <button type="button" onClick={download} disabled={saving}>下載目前賽事 JSON</button>
      {offline && <p>離線中，下載內容為本機已載入的賽況。</p>}
      <details onToggle={e => { if (!e.currentTarget.open) reset(); }}>
        <summary className="cursor-pointer">從備份還原</summary>
        <fieldset disabled={disabled || offline || saving} className="space-y-2 py-2">
          <label>選擇本場賽事的 JSON 備份 <input type="file" accept=".json,application/json"
            onChange={e => { select(e.target.files[0]); e.target.value = ''; }} /></label>
          {preview && <div className="space-y-2">
            <p>{event.id} · {new Date(preview.backup.exportedAt).toLocaleString('zh-TW')} 匯出</p>
            <p>目前賽況：{describeState(event)}</p>
            <p>還原後：{describeState(preview.backup.state)}</p>
            {stale && <p role="alert">目前賽事已有更新，請重新選取備份核對。</p>}
            <label>輸入 {event.id} 確認還原 <input className="border border-slate-500 rounded bg-transparent px-2 py-1" value={code} onChange={e => setCode(e.target.value)} /></label>
            <button type="button" className="mr-3 underline disabled:opacity-50" disabled={stale || code.trim() !== event.id} onClick={restore}>確認還原本場賽事</button>
            <button type="button" onClick={reset}>取消</button>
          </div>}
        </fieldset>
      </details>
      {message && <p role="status">{message}</p>}
    </div>
  </details>;
}
