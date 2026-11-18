import React, { useEffect, useRef, useState } from 'react';
import {
  correctSwissScore,
  eventRanking,
  FINAL,
  hasPlayoff,
  playerLimit,
  nextRoundDecision,
  nextSwissRound,
  registeredPlayers,
  withdrawPlayer
} from './seasonTournament';
import { AKASHIKI, clearTournamentContents } from './tournamentState';
import { buildSeriesStandings } from './series';
import {
  displacedGames,
  forfeitPlayoff,
  gamesFor,
  playoffSelection,
  qualification,
  scorePlayoff,
  seedPlayoff,
  startFinal
} from './finalTournament';
import { restoreClearedTournament, subscribeTournamentVersions, saveCloudTournament, saveTournamentVersion } from './services/tournamentRepository';
import { subscribePlayers } from './services/playerDirectory';
import IdentityRegistration from './IdentityRegistration';
import PlayoffBracket from './PlayoffBracket';
import PublicTournamentBracket from './PublicTournamentBracket';
import { formatAuditTime, getAuditActionLabel, describeAuditLog } from './audit';
import { PublicTournamentRanking } from './PublicTournamentPage';

const stateKeys = [
  'phase',
  'players',
  'rounds',
  'currentRoundNum',
  'judgeCount',
  'doubleElimination',
  'runId',
  'runNumber',
  'rulesVersion',
  'currentVersion',
  'resultLocked',
  'qualificationConfig',
  'qualificationSources',
  'qualificationConfirmedAt',
  'qualifiedIds',
  'playoffDecisions',
  'playoffSeeds',
  'bracket'
];
const stateOf = (data) =>
  Object.fromEntries(stateKeys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));

function TieOrder({ ties, onResolve, playoff = false }) {
  const [orders, setOrders] = useState({});
  return ties.map(({ key, group }) => {
    const ids = orders[key] || [];
    return (
      <fieldset key={key}>
        <legend>{playoff ? '加賽結果' : '同分裁定'} · 第 {group[0].displayRank} 名</legend>
        {playoff && <p>請先完成入圍線加賽，再依結果登錄順序；此處不會抽籤。</p>}
        {group.map((_, i) => (
          <label key={i}>
            {playoff ? '加賽結果順序' : '裁定順序'} {i + 1}
            <select
              value={ids[i] || ''}
              onChange={(e) => {
                const next = [...ids];
                next[i] = e.target.value;
                setOrders({ ...orders, [key]: next });
              }}
            >
              <option value="">選擇選手</option>
              {group.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button disabled={new Set(ids.filter(Boolean)).size !== group.length} onClick={() => onResolve(key, ids)}>
          {playoff ? '確認加賽結果順序' : '確認裁定順序'}
        </button>
      </fieldset>
    );
  });
}

function ScoreButtons({ judges, match, onScore }) {
  return (
    <div className="score-options">
      {Array.from({ length: judges + 1 }, (_, i) => (
        <button key={i} aria-pressed={match.p1Votes === judges - i} onClick={() => onScore(judges - i)}>
          {judges - i} : {i}
        </button>
      ))}
    </div>
  );
}

export default function SeasonAdmin({
  tournament,
  series,
  tournaments,
  online,
  versions,
  audits = [],
  onBack,
  onSignOut
}) {
  const [profiles, setProfiles] = useState([]);
  const [newPlayerSlot, setNewPlayerSlot] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);
  const [clearRequest, setClearRequest] = useState(null);
  const [clearCode, setClearCode] = useState('');
  const [notice, setNotice] = useState('');
  const reviewPanel = useRef(null);
  const reviewing = Boolean(review || clearRequest);
  useEffect(() => {
    if (reviewing) reviewPanel.current?.focus();
  }, [reviewing]);
  const [reason, setReason] = useState('');
  const [substituteName, setSubstituteName] = useState('');
  const [confirmed, setConfirmed] = useState(tournament);
  const latest = useRef(tournament);
  const writing = useRef(false);
  if (tournament.revision >= latest.current.revision) latest.current = tournament;

  const event = confirmed.revision > tournament.revision ? confirmed : tournament;
  const isFinal = event.rulesVersion === FINAL;
  const isAkashiki = event.rulesVersion === AKASHIKI;
  const knockout = hasPlayoff(event);
  const limit = playerLimit(event);
  const registered = event.phase === 'registration';
  const finished = event.phase === 'finished';
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  useEffect(() => {
    if (registered) return subscribePlayers(setProfiles, err => setError(err.message));
    setProfiles([]);
  }, [registered]);
  useEffect(() => {
    if (finished && historyOpen) return subscribeTournamentVersions(event.id, setHistoryRows, err => setError(err.message));
  }, [event.id, finished, historyOpen]);
  const ranked = eventRanking(event);
  const decision = nextRoundDecision(event);
  const config = event.qualificationConfig || {};
  const preview =
    isFinal && registered ? qualification(buildSeriesStandings(series, tournaments), profiles, config) : null;
  const roundsDone = event.rounds.length === 3 && event.rounds.flat().every((m) => m.isDone);
  const stations = series?.events.filter((e) => e.rulesVersion !== FINAL) || [];
  const readyStations =
    stations.length === 4 &&
    stations.every((e) => tournaments.some((t) => t.id === e.eventCode && t.phase === 'finished'));
  const offline = !online || tournament.sync?.fromCache;

  async function write(next, action, details = {}, options = {}) {
    if (offline || writing.current) throw new Error('請等待連線及前一筆操作完成。');
    const current = latest.current;
    if (next.revision !== current.revision) throw new Error('名單或比分已由其他管理者更新，請確認後重試。');
    writing.current = true;
    setBusy(true);
    setError('');
    try {
      let revision;
      if (options.type) {
        const saved = await saveTournamentVersion(current.id, stateOf(next), {
          expectedRevision: current.revision,
          type: options.type,
          reason: options.reason || action,
          changes: [{ action, ...details }],
          sourceVersion: options.sourceVersion
        });
        revision = saved.revision;
        next = { ...next, currentVersion: saved.version, resultLocked: next.phase === 'finished' };
      } else {
        revision = await saveCloudTournament(
          current.id,
          stateOf(next),
          { action, details },
          current.revision,
          options.qualificationSources
        );
      }
      latest.current = { ...next, revision };
      setConfirmed(latest.current);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  function run(operation) {
    setError('');
    Promise.resolve()
      .then(operation)
      .catch((err) => setError(err.message));
  }
  const configChange = (change) =>
    write({ ...event, qualificationConfig: { ...config, ...change } }, '更新最終戰資格', change);
  function assignSlot(index, id) {
    if (event.phase !== 'registration') throw new Error('最終戰已開打。');
    const slots = [config.online?.[0] || '', config.online?.[1] || '', config.local || ''];
    if (id && slots.some((other, i) => i !== index && other === id))
      throw new Error('這位選手已占另一個資格席位。');
    slots[index] = id;
    return configChange(index === 2 ? { local: id } : { online: slots.slice(0, 2) });
  }
  function confirmQualification() {
    const sources = Object.fromEntries(
      stations.map((station) => {
        const result = tournaments.find((t) => t.id === station.eventCode);
        return [station.eventCode, result.revision];
      })
    );
    const next = { ...startFinal(event, preview), qualificationSources: sources, qualificationConfirmedAt: new Date().toISOString() };
    return write(
      next,
      '確認資格並開賽',
      { qualifiedIds: next.qualifiedIds, sources },
      { qualificationSources: sources }
    );
  }
  function propose(next, action, details = {}) {
    setReason('');
    setReview({ next, action, details, revision: event.revision, decisions: next.playoffDecisions || {} });
  }
  function editSwiss(index, match, left) {
    if (match.p1Votes === left) return;
    const next = correctSwissScore(event, index, match.id, left);
    const details = { round: index + 1, matchId: match.id, before: match.p1Votes, after: left };
    if (finished || index !== event.rounds.length - 1 || match.isDone) propose(next, '更正瑞士比分', details);
    else run(() => write(next, '登錄瑞士比分', details));
  }
  function editPlayoff(key, left, gameIndex) {
    const before = gameIndex === undefined ? event.bracket[key].p1Votes : event.bracket[key].games?.[gameIndex]?.p1Votes;
    if (before === left) return;
    const next = scorePlayoff(event, key, left, gameIndex);
    const details = { game: key, ...(gameIndex === undefined ? {} : { gameIndex: gameIndex + 1 }), before: before ?? null, after: left };
    if (before != null || finished) propose(next, '更正淘汰賽比分', details);
    else run(() => write(next, '登錄淘汰賽比分', details));
  }
  const revised = review?.next;
  async function confirmReview() {
    if (review.revision !== latest.current.revision) throw new Error('賽事已有更新，請重新開啟更正。');
    const affected = displacedGames(event, revised);
    const complete = !knockout || (revised.bracket?.gold?.isDone && revised.bracket?.bronze?.isDone);
    const next = {
      ...revised,
      phase: finished && !complete ? 'playing' : revised.phase,
      resultLocked: finished && Boolean(complete)
    };
    await write(
      next,
      review.action,
      { ...review.details, affected, reason, decisions: review.decisions },
      finished
        ? {
            type: review.sourceVersion ? 'restore' : complete ? 'correction' : 'reseed',
            reason,
            sourceVersion: review.sourceVersion
          }
        : {}
    );
    setReview(null);
  }
  const canClose = roundsDone && (!knockout || (event.bracket?.gold?.isDone && event.bracket?.bronze?.isDone));
  async function confirmClear() {
    if (clearCode.trim().toUpperCase() !== event.id) throw new Error('請輸入本場賽事代碼。');
    if (clearRequest.revision !== latest.current.revision) throw new Error('賽事已有更新，請取消後重新確認清除內容。');
    await write({ ...event, ...clearTournamentContents(event) }, 'TOURNAMENT_CLEARED', {
      name: event.name,
      ...(event.seriesId ? { seriesId: event.seriesId } : {}),
      previousPhase: event.phase,
      removedPlayers: event.players.filter((player) => !player.isMC).length,
      removedRounds: event.rounds.length
    });
    setClearRequest(null);
    setClearCode('');
    setSubstituteName('');
    setNewPlayerSlot(null);
    setNotice('已清除選手與賽程，賽事回到報名狀態。賽事名稱、代碼與賽制已保留。');
  }
  return (
    <main className={'season-admin' + (isAkashiki ? ' akashiki-admin' : '')}>
      <header>
        <nav>
          <button disabled={busy || registering} onClick={onBack}>
            返回賽事管理
          </button>
          <a href={'?event=' + event.id} target="_blank" rel="noreferrer">
            查看公開賽程
          </a>
          <button
            disabled={busy || offline || reviewing}
            onClick={() =>
              run(async () => {
                await saveCloudTournament(
                  event.id,
                  { isPublic: !event.isPublic },
                  { action: '更改公開狀態' },
                  event.revision
                );
              })
            }
          >
            {event.isPublic ? '關閉公開' : '開啟公開'}
          </button>
          <button onClick={onSignOut} disabled={busy || registering}>
            登出
          </button>
          <button
            disabled={busy || registering || offline || reviewing}
            onClick={() => {
              setError('');
              setNotice('');
              setClearCode('');
              setClearRequest({ revision: event.revision });
            }}
          >
            清除賽事內容
          </button>
        </nav>
        <h1>{event.name}</h1>
        <p>
          {isAkashiki ? '單場合作賽 · 最多 32 人三輪瑞士制 → 隨機十六強 · 無兩敗淘汰' : isFinal ? '最終戰' : '積分賽'} · {event.judgeCount} 位評審 · {event.id}
        </p>
        {isAkashiki && <p>排名與配對：總票數 → 勝場 → 對手勝率 → 對手的對手勝率。淘汰賽 BO1，冠軍戰 BO3，另設季軍戰。</p>}
      </header>
      {isFinal && !registered && event.qualificationSources && <details>
        <summary>開賽時確認的資格來源</summary>
        {event.qualificationConfirmedAt && <p>{new Date(event.qualificationConfirmedAt).toLocaleString('zh-TW')}</p>}
        {Object.entries(event.qualificationSources).map(([code, revision]) => {
          const current = tournaments.find(t => t.id === code);
          return <p key={code}>{code} · 版本 {revision}{current && current.revision !== revision ? `（目前版本 ${current.revision}）` : ''}</p>;
        })}
      </details>}
      {error && <p role="alert">{error}</p>}
      {busy && !registering && <p role="status">正在儲存賽事…</p>}
      {notice && <p role="status">{notice}</p>}
      {offline && <p role="status">離線中，恢復連線後可操作。</p>}
      {event.clearBackupId && registered && !event.players.length && <button disabled={offline || busy || registering} onClick={() => run(async () => {
        if (!window.confirm('還原清除前的名單、配對與比分？')) return;
        setBusy(true);
        try { await restoreClearedTournament(event.id, event.revision); }
        finally { setBusy(false); }
      })}>還原清除前快照</button>}
      {clearRequest && (
        <section ref={reviewPanel} tabIndex={-1} className="season-review" role="region" aria-label="確認清除賽事內容">
          <h2>清除 {event.name} 的內容？</h2>
          <p>將清除本場的 {event.players.filter((player) => !player.isMC).length} 位選手、{event.rounds.length} 輪瑞士賽、淘汰賽籤表、比分與資格名單，回到報名狀態。</p>
          <p>保留賽事名稱、代碼、賽制、公開狀態、選手資料庫、操作紀錄與歷史完賽版本。舊名單與賽程不會自動還原。</p>
          <label>
            輸入賽事代碼 {event.id} 確認清除
            <input value={clearCode} disabled={busy} autoComplete="off" spellCheck={false}
              onChange={(e) => setClearCode(e.target.value)} />
          </label>
          <button disabled={busy || offline || clearCode.trim().toUpperCase() !== event.id}
            onClick={() => run(confirmClear)}>
            {busy ? '清除中…' : '確認清除內容'}
          </button>
          <button disabled={busy} onClick={() => { setClearRequest(null); setClearCode(''); }}>取消</button>
        </section>
      )}
      {review && (
        <section ref={reviewPanel} tabIndex={-1} className="season-review" role="region" aria-label="確認更正">
          <h2>{review.action}</h2>
          <p>
            {review.details.matchId
              ? '左側票數 ' + review.details.before + ' → ' + review.details.after
              : review.details.forfeitGame ? `${review.details.forfeitGame}：${review.details.name} 棄賽，對手獲勝` : review.details.game ? `${gamesFor(event).find(([key]) => key === review.details.game)?.[1] || '淘汰賽'}${review.details.gameIndex ? ` 第 ${review.details.gameIndex} 局` : ''}：${review.details.before ?? '未登錄'} → ${review.details.after}` : review.details.id || ''}
          </p>
          {review.action === '更正瑞士比分' && <p>重新計算戰績與排名，保留已產生的配對、淘汰賽名單及已登錄比分。</p>}
          <p>需重新登錄比分：{displacedGames(event, revised).join('、') || '無'}</p>
          {isAkashiki && event.bracket?.gold?.isDone && !revised.bracket?.gold?.isDone && <p>冠軍戰尚未結束，確認後將重新開放記分。</p>}
          <label>
            原因
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button
            disabled={busy || offline || !reason.trim()}
            onClick={() => run(confirmReview)}
          >
            確認變更
          </button>
          <button onClick={() => setReview(null)}>取消</button>
        </section>
      )}
      <fieldset disabled={busy || offline || reviewing} className="season-body">
        {registered && (
          <section>
            <h2>{isFinal ? '最終戰資格名單' : '選手報名'}</h2>
            {isFinal ? (
              <>
                <div className="season-fields">
                  {['線上保送一', '線上保送二', '現場海選'].map((label, i) => (
                    <div key={label}>
                      <label>
                        {label}
                        <select
                          disabled={registering}
                          value={(i === 2 ? config.local : config.online?.[i]) || ''}
                          onChange={(e) => {
                            const id = e.target.value;
                            run(() => assignSlot(i, id));
                          }}
                        >
                          <option value="">選擇打師名</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}（{p.realName}）
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        aria-expanded={newPlayerSlot === i}
                        disabled={registering}
                        onClick={() => setNewPlayerSlot(newPlayerSlot === i ? null : i)}
                      >
                        {newPlayerSlot === i ? '取消新增' : '新增選手'} · {label}
                      </button>
                      {newPlayerSlot === i && (
                        <IdentityRegistration
                          singleEntry
                          onBusyChange={setRegistering}
                          profiles={profiles}
                          onPlayer={async (player) => {
                            await assignSlot(i, player.id);
                            setNewPlayerSlot(null);
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <details>
                  <summary>其他選手登錄與 CSV 匯入</summary>
                  <IdentityRegistration
                    onBusyChange={setRegistering}
                    profiles={profiles}
                    onPlayer={async () => {}}
                  />
                </details>
                <TieOrder
                  ties={preview.ties}
                  onResolve={(key, ids) =>
                    run(() => configChange({ decisions: { ...config.decisions, [key]: ids } }))
                  }
                />
                <p>{preview.error || '資格名單已齊備'}</p>
                {!readyStations && <p>等待四站完賽後可開打。</p>}
                <button
                  disabled={registering || Boolean(preview.error) || !readyStations}
                  onClick={() => run(confirmQualification)}
                >
                  確認 24 人並產生首輪
                </button>
                {!preview.error && (
                  <ol className="qualification-roster">
                    {preview.players.map((p) => (
                      <li key={p.id}>
                        <strong>{p.name}</strong>
                        <span>
                          {p.source}
                          {p.seedCredit ? ' · 種子' : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <div className="registration-layout">
                <IdentityRegistration
                  onBusyChange={setRegistering}
                  profiles={profiles}
                  remaining={limit - event.players.length}
                  onPlayers={async (additions) => {
                    const current = latest.current;
                    if (current.phase !== 'registration') throw new Error('賽事已開打，無法新增報名。');
                    const ids = new Set(current.players.map(player => player.id));
                    const duplicates = [];
                    const fresh = additions.filter((player, index) => {
                      if (ids.has(player.id)) { duplicates.push(index); return false; }
                      ids.add(player.id);
                      return true;
                    });
                    if (fresh.length) await write({ ...current, players: registeredPlayers(current.players, fresh, limit) },
                      '選手報名', { players: fresh });
                    return duplicates;
                  }}
                />
                <div className="registration-list">
                  <div className="roster-heading">
                    <h3 id="registration-roster">名單 {event.players.length}／{limit}</h3>
                    <button
                      disabled={registering || event.players.length < 2}
                      onClick={() => run(() => write(nextSwissRound(event), isAkashiki ? '開始合作賽' : '開始積分賽'))}
                    >
                      開始第一輪
                    </button>
                  </div>
                  <ul
                    aria-labelledby="registration-roster"
                    className="my-3 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {event.players.map((p) => (
                      <li
                        key={p.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-slate-700 py-1"
                      >
                        <span>{p.name}</span>
                        <button
                          aria-label={`移除 ${p.name}`}
                          className="whitespace-nowrap"
                          onClick={() =>
                            run(() =>
                              write(
                                { ...event, players: event.players.filter((item) => item.id !== p.id) },
                                '移除報名',
                                { id: p.id }
                              )
                            )
                          }
                        >
                          移除
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>
        )}
        {!registered && (
          <>
            <div className="scoring-layout">
              <div className="score-workspace">
                {event.playoffSeeds?.length > 0 && (
                  <PlayoffBracket
                    event={event}
                    renderScore={(key, match, gameIndex) => (
                      <ScoreButtons judges={event.judgeCount} match={match} onScore={(left) => editPlayoff(key, left, gameIndex)} />
                    )}
                  />
                )}
                {!finished && event.playoffSeeds?.length > 0 && (
                  <details>
                    <summary>淘汰賽棄賽</summary>
                    <p>只判本場對手全票獲勝；四強棄賽者仍可參加季軍戰。{isAkashiki && '冠軍戰 BO3 保留已完成局數，其餘局由對手全票獲勝至兩勝。'}</p>
                    {gamesFor(event).filter(([key]) => event.bracket?.[key] && !event.bracket[key].isDone).map(([key, label]) => (
                      <fieldset key={key}>
                        <legend>{label}</legend>
                        {[event.bracket[key].p1, event.bracket[key].p2].map(p => (
                          <button key={p.id} onClick={() => propose(forfeitPlayoff(event, key, p.id), '淘汰賽棄賽', { id: p.id, name: p.name, forfeitGame: label })}>
                            {p.name} 本場棄賽
                          </button>
                        ))}
                      </fieldset>
                    ))}
                  </details>
                )}
                <section className="score-panel">
                  <h2>瑞士制樹狀圖與記分</h2>
                  {isFinal && <p>種子首輪各記一勝五票：{event.players.filter((p) => p.seedCredit).map((p) => p.name).join('、')}</p>}
                  <PublicTournamentBracket
                    rounds={event.rounds}
                    votesFirst={isAkashiki}
                    renderScore={(match, index) => (
                      <ScoreButtons judges={event.judgeCount} match={match} onScore={(left) => editSwiss(index, match, left)} />
                    )}
                  />
                </section>
                {!finished && canClose && (
                  <button
                    onClick={() =>
                      run(() =>
                        write(
                          { ...event, phase: 'finished', resultLocked: true },
                          '完賽鎖定',
                          {},
                          { type: 'completed' }
                        )
                      )
                    }
                  >
                    結算並鎖定結果
                  </button>
                )}
                {!finished && !event.playoffSeeds?.length && (
                  <>
                    <div className="round-actions">
                      {event.rounds.length < 3 && (
                        <>
                          {decision.revival?.length > 1 && (
                            <p>復活抽籤候選：{decision.revival.map(p => p.name).join('、')}。產生下一輪時隨機抽出一位，結果會隨配對保存。</p>
                          )}
                          {decision.revival?.length === 1 && <p>下一輪復活：{decision.revival[0].name}</p>}
                          {decision.substitute && (
                            <label>
                              主辦方補位選手
                              <input value={substituteName} onChange={(e) => setSubstituteName(e.target.value)} />
                            </label>
                          )}
                          <button
                            disabled={event.rounds.at(-1).some((m) => !m.isDone)}
                            onClick={() =>
                              run(() => {
                                  const next = nextSwissRound(event, { substituteName });
                                  return write(next, '產生下一輪', {
                                    reviveId: next.players.find(p => p.revivedRound === next.rounds.length)?.id || null,
                                    revivalCandidates: decision.revival?.map(p => p.id) || [],
                                    revivalMethod: decision.revival?.length > 1 ? 'random' : 'highest-ranked',
                                    substituteName
                                  });
                              })
                            }
                          >
                            產生第 {event.rounds.length + 1} 輪
                          </button>
                        </>
                      )}
                    </div>
                    <section>
                      <details>
                        <summary>選手棄賽</summary>
                        {event.players
                          .filter((p) => !p.isWithdrawn && !p.isEliminated)
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => propose(withdrawPlayer(event, p.id), '選手棄賽', { id: p.id })}
                            >
                              {p.name} 棄賽
                            </button>
                          ))}
                      </details>
                      {knockout && roundsDone && (
                        <>
                          <TieOrder
                            ties={playoffSelection(event).ties}
                            playoff={isAkashiki}
                            onResolve={(key, ids) =>
                              run(() =>
                                write(
                                  { ...event, playoffDecisions: { ...event.playoffDecisions, [key]: ids } },
                                  isAkashiki ? '十六強入圍加賽結果' : '八強種子裁定',
                                  { ids }
                                )
                              )
                            }
                          />
                          <button
                            disabled={playoffSelection(event).ties.length > 0 || playoffSelection(event).players.length !== (isAkashiki ? 16 : 8)}
                            onClick={() =>
                              run(() => write(seedPlayoff(event, event.playoffDecisions || {}), isAkashiki ? '十六強隨機抽籤' : '確認八強種子'))
                            }
                          >
                            {isAkashiki ? '隨機抽出十六強籤表' : '建立八強籤表'}
                          </button>
                        </>
                      )}
                    </section>
                  </>
                )}

              </div>
              <PublicTournamentRanking tournament={event} rankedPlayers={ranked} />
            </div>
            {finished && (
              <details onToggle={e => setHistoryOpen(e.currentTarget.open)}>
                <summary>完賽版本紀錄</summary>
                {(historyRows.length ? historyRows : versions || [])
                  .filter((v) => v.runId === event.runId)
                  .map((v) => (
                    <button
                      key={v.id}
                      disabled={v.version === event.currentVersion || !v.snapshot.resultLocked}
                      onClick={() => {
                        propose({ ...event, ...stateOf(v.snapshot) }, '回復版本', { version: v.version });
                        setReview((r) => ({ ...r, sourceVersion: v.version }));
                      }}
                    >
                      回復 v{v.version} · {v.reason}
                    </button>
                  ))}
              </details>
            )}
          </>
        )}
      </fieldset>
      {audits.length > 0 && (
        <details>
          <summary>操作紀錄</summary>
          <ol>
            {audits.map((entry) => (
              <li key={entry.id}>
                <time>{formatAuditTime(entry)}</time> · {getAuditActionLabel(entry.action)}　
                {describeAuditLog(entry) || entry.details?.reason || entry.details?.name}
              </li>
            ))}
          </ol>
        </details>
      )}
    </main>
  );
}
