import React, { useState } from 'react';
import { identityMatches, normalizeIdentity, readIdentityCsv, reviewKey } from './playerIdentity';
import { saveIdentity } from './services/playerDirectory';

const blank = { realName: '', phone: '', name: '' };
export default function IdentityRegistration({ profiles, onPlayer, onPlayers, remaining = 48, onBusyChange, singleEntry = false }) {
  const [form, setForm] = useState(blank);
  const [queue, setQueue] = useState([]);
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [name, setName] = useState('');
  async function process(rows, decision) {
    if (busy || !rows.length) return;
    setError('');
    setBusy(true);
    onBusyChange?.(true);
    let pending = rows;
    let batch = [];
    const known = [...profiles];
    const flush = async () => {
      if (!batch.length) return;
      if (onPlayers) await onPlayers(batch);
      else await onPlayer(batch[0]);
      pending = pending.slice(batch.length);
      batch = [];
      setQueue(pending);
      setProgress({ done: rows.length - pending.length, total: rows.length });
    };
    setProgress({ done: 0, total: rows.length });
    try {
      if (rows.length > remaining) throw new Error('名單超過本場人數上限。');
      while (pending.length > batch.length) {
        const row = normalizeIdentity(pending[batch.length]);
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
      setError(err.message);
      setReview(null);
    } finally {
      setQueue(pending);
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section aria-label={singleEntry ? '新增資格席位選手' : '選手身分核對'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          process([form]);
        }}
      >
        <div className="season-fields">
          {[
            ['realName', '本名'],
            ['phone', '電話號碼'],
            ['name', '打師名']
          ].map(([key, label]) => (
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
        匯入 CSV（本名、電話號碼、打師名）
        <input
          type="file"
          accept=".csv"
          disabled={busy || Boolean(queue.length)}
          onChange={async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
              await process(readIdentityCsv(await file.text()));
            } catch (err) {
              setError(err.message);
            }
          }}
        />
      </label>}
      {progress && <p role="status">已完成 {progress.done}／{progress.total} 筆{busy ? '，處理中…' : ''}</p>}
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
