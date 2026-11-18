import React, { useState } from 'react';
import { identityMatches, normalizeIdentity, normalizeEntryName, readIdentityCsv, reviewKey } from './playerIdentity';
import { createId } from './tournamentState';
import { saveIdentity } from './services/playerDirectory';

const blank = { realName: '', phone: '', name: '' };
export default function IdentityRegistration({ profiles, onPlayer, onPlayers, remaining = 48, onBusyChange, singleEntry = false, nameOnly = false }) {
  const [form, setForm] = useState(blank);
  const [queue, setQueue] = useState([]);
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [skipped, setSkipped] = useState([]);
  const [progress, setProgress] = useState(null);
  const [name, setName] = useState('');
  async function process(rows, decision) {
    if (busy || !rows.length) return;
    setError('');
    setBusy(true);
    onBusyChange?.(true);
    let pending = rows.map(row => ({ ...row }));
    let batch = [];
    const known = [...profiles];
    let processingRow = null;
    const flush = async () => {
      if (!batch.length) return;
      processingRow = null;
      if (onPlayers) {
        const duplicates = await onPlayers(batch) || [];
        const added = batch.length - duplicates.length;
        setAddedCount(previous => previous + added);
        const items = duplicates.map(index => ({ name: batch[index].name, line: pending[index].csvLine }));
        if (items.length) setSkipped(previous => [...previous, ...items]);
      } else await onPlayer(batch[0]);
      pending = pending.slice(batch.length);
      batch = [];
      setQueue(pending);
      setProgress({ done: rows.length - pending.length, total: rows.length });
    };
    setProgress({ done: 0, total: rows.length });
    try {
      if (!onPlayers && rows.length > remaining) throw new Error('名單超過本場人數上限。');
      while (pending.length > batch.length) {
        processingRow = pending[batch.length];
        if (nameOnly) {
          const name = normalizeEntryName(processingRow.name);
          processingRow.id ||= createId();
          batch.push({ id: processingRow.id, name });
          if (batch.length >= (onPlayers ? 8 : 1)) await flush();
          continue;
        }
        const row = normalizeIdentity(processingRow);
        const matches = identityMatches(known, row);
        const exact = matches.find(
          (p) => p.realName === row.realName && p.phone === row.phone && p.name === row.name
        );
        if (matches.length && !exact && !decision) {
          await flush();
          setReview(matches);
          setName(row.name);
          return;
        }
        const player = await saveIdentity(row, decision);
        batch.push(player);
        const previous = known.findIndex((p) => p.id === player.id);
        if (previous >= 0) known.splice(previous, 1);
        known.push({ ...row, ...player });
        decision = null;
        setReview(null);
        if (batch.length >= (onPlayers ? 8 : 1)) await flush();
      }
      await flush();
      setForm(blank);
    } catch (err) {
      // Keep rows in the retry queue until the tournament write succeeds.
      const firstLine = pending[0]?.csvLine;
      const lastLine = pending[batch.length - 1]?.csvLine;
      const location = processingRow?.csvLine ? `第 ${processingRow.csvLine} 列（${processingRow.name}）`
        : firstLine && lastLine ? `第 ${firstLine} 至 ${lastLine} 列尚未加入` : '';
      setError(location ? location + '：' + err.message : err.message);
      setReview(null);
    } finally {
      setQueue(pending);
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section aria-label={singleEntry ? '新增資格席位選手' : nameOnly ? '打師名報名' : '選手身分核對'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAddedCount(0);
          setSkipped([]);
          process([form]);
        }}
      >
        <div className="season-fields">
          {(nameOnly ? [['name', '打師名']] : [
            ['realName', '本名'],
            ['phone', '電話號碼'],
            ['name', '打師名']
          ]).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                value={form[key]}
                type={key === 'phone' ? 'tel' : 'text'}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <button disabled={busy || !remaining || Boolean(queue.length)}>{singleEntry ? '儲存並填入席位' : '登錄選手'}</button>
      </form>
      {!singleEntry && <label>
        {nameOnly ? '匯入 CSV（打師名）' : '匯入 CSV（本名、電話號碼、打師名）'}
        <input
          type="file"
          accept=".csv"
          disabled={busy || Boolean(queue.length)}
          onChange={async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
              setAddedCount(0);
              setSkipped([]);
              await process(readIdentityCsv(await file.text(), { includeLine: true, nameOnly }));
            } catch (err) {
              setError(err.message);
            }
          }}
        />
      </label>}
      {progress && <p role="status">已完成 {progress.done}／{progress.total} 筆{busy ? '，處理中…' : ''}</p>}
      {progress && onPlayers && <p>已加入本場 {addedCount} 位</p>}
      {skipped.length > 0 && <p>已跳過 {skipped.length} 筆重複報名：{skipped.map(({ line, name }) => line ? `第 ${line} 列 ${name}` : name).join('、')}</p>}
      {review && (
        <section role="alert" className="season-review">
          <h3>請核對選手身分</h3>
          <p>
            本次報名：{queue[0].realName} · {queue[0].phone} · {queue[0].name}
          </p>
          <label>
            確認後的打師名
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {review.map((p) => (
            <button
              disabled={busy || !name.trim()}
              key={p.id}
              onClick={() => process(queue, { id: p.id, key: reviewKey(review), name })}
            >
              沿用 {p.name}（{p.realName} · {p.phone}）
            </button>
          ))}
          {!review.some((p) => p.realName === queue[0].realName && p.phone === queue[0].phone) && (
            <button disabled={busy} onClick={() => process(queue, { key: reviewKey(review), name })}>
              確認為不同選手
            </button>
          )}
        </section>
      )}
      {queue.length > 0 && (
        <div>
          待處理 {queue.length} 筆　
          {!review && (
            <button disabled={busy} onClick={() => process(queue)}>
              重試
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => {
              setQueue([]);
              setProgress(null);
              setError('');
              setReview(null);
            }}
          >
            取消剩餘報名
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
