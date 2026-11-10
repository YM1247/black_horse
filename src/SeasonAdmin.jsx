import React, { useEffect, useRef, useState } from 'react';
import {
  correctSwissScore,
  eventRanking,
  FINAL,
  nextRoundDecision,
  nextSwissRound,
  registeredPlayers,
  withdrawPlayer
} from './seasonTournament';
import { buildSeriesStandings } from './series';
import {
  displacedGames,
  playoffSelection,
  qualification,
  scorePlayoff,
  seedPlayoff,
  startFinal
} from './finalTournament';
import { saveCloudTournament, saveTournamentVersion } from './services/tournamentRepository';
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
  'qualifiedIds',
  'playoffDecisions',
  'playoffSeeds',
  'bracket'
];
const stateOf = (data) =>
  Object.fromEntries(stateKeys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));

function TieOrder({ ties, onResolve }) {
  const [orders, setOrders] = useState({});
  return ties.map(({ key, group }) => {
    const ids = orders[key] || [];
    return (
      <fieldset key={key}>
        <legend>同分裁定 · 第 {group[0].displayRank} 名</legend>
        {group.map((_, i) => (
          <label key={i}>
            裁定順序 {i + 1}
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
          確認裁定順序
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
  const [reason, setReason] = useState('');
  const [reviveId, setReviveId] = useState('');
  const [substituteName, setSubstituteName] = useState('');
  const [confirmed, setConfirmed] = useState(tournament);
  const latest = useRef(tournament);
  const writing = useRef(false);
  if (tournament.revision >= latest.current.revision) latest.current = tournament;
  useEffect(() => subscribePlayers(setProfiles, (err) => setError(err.message)), []);
  const event = confirmed.revision > tournament.revision ? confirmed : tournament;
  const isFinal = event.rulesVersion === FINAL;
  const registered = event.phase === 'registration';
  const finished = event.phase === 'finished';
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
    if (id && slots.some((other, i) => i !== index && other === id)) throw new Error('這位選手已占另一個資格席位。');
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
    const next = { ...startFinal(event, preview), qualificationSources: sources };
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
    if (next.rounds.length < event.rounds.length)
      details.redrawRounds = event.rounds.slice(next.rounds.length).map((_, i) => next.rounds.length + i + 1);
    if (finished || index !== event.rounds.length - 1 || match.isDone) propose(next, '更正瑞士比分', details);
    else run(() => write(next, '登錄瑞士比分', details));
  }
  function editPlayoff(key, left) {
    if (event.bracket[key].p1Votes === left) return;
    const next = scorePlayoff(event, key, left);
    const details = { game: key, before: event.bracket[key].p1Votes, after: left };
    if (event.bracket[key].isDone || finished) propose(next, '更正淘汰賽比分', details);
    else run(() => write(next, '登錄淘汰賽比分', details));
  }
  let revised = review?.next,
    reviewTies = [];
  if (review && event.playoffSeeds?.length && !review.sourceVersion && review.action === '更正瑞士比分') {
    const selection = playoffSelection(revised, review.decisions);
    reviewTies = selection.ties;
    if (!reviewTies.length) revised = seedPlayoff(revised, review.decisions);
  }
  async function confirmReview() {
    if (review.revision !== latest.current.revision) throw new Error('賽事已有更新，請重新開啟更正。');
    const affected = displacedGames(event, revised);
    const complete = !isFinal || (revised.bracket?.gold?.isDone && revised.bracket?.bronze?.isDone);
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
  const canClose = roundsDone && (!isFinal || (event.bracket?.gold?.isDone && event.bracket?.bronze?.isDone));
  return (
    <main className="season-admin">
      <header>
        <nav>
          <button disabled={busy || registering} onClick={onBack}>
            返回賽事管理
          </button>
          <a href={'?event=' + event.id} target="_blank" rel="noreferrer">
            查看公開賽程
          </a>
          <button onClick={onSignOut} disabled={busy || registering}>
            登出
          </button>
        </nav>
        <h1>{event.name}</h1>
        <p>
          {isFinal ? '最終戰' : '積分賽'} · {event.judgeCount} 位評審 · {event.id}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {offline && <p role="status">離線中，恢復連線後可操作。</p>}
      <fieldset disabled={busy || offline || Boolean(review)} className="season-body">
        <div>
          <button
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
        </div>
        {registered && (
          <section>
            <h2>{isFinal ? '最終戰資格名單' : '選手報名'}</h2>
            {isFinal ? (
              <>
                <div className="season-fields">
                  {['線上保送一', '線上保送二', '現場海選'].map((label, i) => (
                    <div key={label}>
                      <label>{label}
                        <select
                          disabled={registering}
                          value={(i === 2 ? config.local : config.online?.[i]) || ''}
                          onChange={e => {
                            const id = e.target.value;
                            run(() => assignSlot(i, id));
                          }}
                        >
                          <option value="">選擇打師名</option>
                          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}（{p.realName}）</option>)}
                        </select>
                      </label>
                      <button type="button" aria-expanded={newPlayerSlot === i} disabled={registering}
                        onClick={() => setNewPlayerSlot(newPlayerSlot === i ? null : i)}>
                        {newPlayerSlot === i ? '取消新增' : '新增選手'} · {label}
                      </button>
                      {newPlayerSlot === i && (
                        <IdentityRegistration singleEntry onBusyChange={setRegistering} profiles={profiles}
                          onPlayer={async player => {
                            await assignSlot(i, player.id);
                            setNewPlayerSlot(null);
                          }}/>
                      )}
                    </div>
                  ))}
                </div>
                <details>
                  <summary>其他選手登錄與 CSV 匯入</summary>
                  <IdentityRegistration onBusyChange={setRegistering} profiles={profiles} onPlayer={async () => {}} />
                </details>
                <TieOrder
                  ties={preview.ties}
                  onResolve={(key, ids) =>
                    run(() => configChange({ decisions: { ...config.decisions, [key]: ids } }))
                  }
                />
                <p>{preview.error || '資格名單已齊備'}</p>
                {!preview.error && (
                  <ol>
                    {preview.players.map((p) => (
                      <li key={p.id}>
                        {p.name} · {p.source}
                        {p.seedCredit ? ' · 種子' : ''}
                      </li>
                    ))}
                  </ol>
                )}
                {!readyStations && <p>等待四站完賽後可開打。</p>}
                <button
                  disabled={registering || Boolean(preview.error) || !readyStations}
                  onClick={() => run(confirmQualification)}
                >
                  確認 24 人並產生首輪
                </button>
              </>
            ) : (
              <>
                <IdentityRegistration
                  onBusyChange={setRegistering}
                  profiles={profiles}
                  remaining={48 - event.players.length}
                  onPlayer={(p) => {
                    const current = latest.current;
                    if (current.phase !== 'registration') throw new Error('賽事已開打，無法新增報名。');
                    return write({ ...current, players: registeredPlayers(current.players, [p]) }, '選手報名', {
                      id: p.id,
                      name: p.name
                    });
                  }}
                />
                <h3>名單 {event.players.length}／48</h3>
                <ul>
                  {event.players.map((p) => (
                    <li key={p.id}>
                      {p.name}
                      <button
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
                <button
                  disabled={registering || event.players.length < 2}
                  onClick={() => run(() => write(nextSwissRound(event), '開始積分賽'))}
                >
                  開始第一輪
                </button>
              </>
            )}
          </section>
        )}
        {!registered && (
          <>
            <PublicTournamentRanking tournament={event} rankedPlayers={ranked} prominent />
            <section>
              <h2>瑞士制配對與比分</h2>
              {event.rounds.map((round, index) => (
                <details key={index} open={index === event.rounds.length - 1}>
                  <summary>
                    第 {index + 1} 輪 · {round.length} 場
                  </summary>
                  {index === 0 && isFinal && (
                    <p>
                      種子首輪各記一勝五票：
                      {event.players
                        .filter((p) => p.seedCredit)
                        .map((p) => p.name)
                        .join('、')}
                    </p>
                  )}
                  {round.map((match) => (
                    <article key={match.id}>
                      <div className="bout">
                        <span>
                          <small>先攻</small>
                          {match.p1.name}
                        </span>
                        <b>
                          {match.p1Votes ?? '–'} : {match.p2Votes ?? '–'}
                        </b>
                        <span>
                          <small>後攻</small>
                          {match.p2.name}
                        </span>
                      </div>
                      <ScoreButtons
                        judges={event.judgeCount}
                        match={match}
                        onScore={(left) => editSwiss(index, match, left)}
                      />
                    </article>
                  ))}
                </details>
              ))}
            </section>
            {!finished && !event.playoffSeeds?.length && (
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
                {event.rounds.length < 3 && (
                  <>
                    {decision.revival?.length > 1 && (
                      <label>
                        裁定復活選手
                        <select value={reviveId} onChange={(e) => setReviveId(e.target.value)}>
                          <option value="">請選擇</option>
                          {decision.revival.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
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
                        run(() =>
                          write(nextSwissRound(event, { reviveId, substituteName }), '產生下一輪', {
                            reviveId: decision.revival?.length === 1 ? decision.revival[0].id : reviveId,
                            substituteName
                          })
                        )
                      }
                    >
                      產生第 {event.rounds.length + 1} 輪
                    </button>
                  </>
                )}
                {isFinal && roundsDone && (
                  <>
                    <TieOrder
                      ties={playoffSelection(event).ties}
                      onResolve={(key, ids) =>
                        run(() =>
                          write(
                            { ...event, playoffDecisions: { ...event.playoffDecisions, [key]: ids } },
                            '八強種子裁定',
                            { ids }
                          )
                        )
                      }
                    />
                    <button
                      disabled={playoffSelection(event).ties.length > 0}
                      onClick={() =>
                        run(() => write(seedPlayoff(event, event.playoffDecisions || {}), '確認八強種子'))
                      }
                    >
                      建立八強籤表
                    </button>
                  </>
                )}
              </section>
            )}
            {event.playoffSeeds?.length > 0 && (
              <PlayoffBracket
                event={event}
                renderScore={(key, match) => (
                  <ScoreButtons judges={5} match={match} onScore={(left) => editPlayoff(key, left)} />
                )}
              />
            )}
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
            <details>
              <summary>瑞士制樹狀圖</summary>
              <PublicTournamentBracket rounds={event.rounds} />
            </details>
            {finished && versions?.length > 0 && (
              <details>
                <summary>完賽版本紀錄</summary>
                {versions
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
      {review && (
        <section className="season-review" role="region" aria-label="確認更正">
          <h2>{review.action}</h2>
          <p>
            {review.details.matchId
              ? '左側票數 ' + review.details.before + ' → ' + review.details.after
              : review.details.game || review.details.id || ''}
          </p>
          <TieOrder
            ties={reviewTies}
            onResolve={(key, ids) => setReview({ ...review, decisions: { ...review.decisions, [key]: ids } })}
          />
          {review.details.redrawRounds?.length > 0 && (
            <p>將清除並重新配對第 {review.details.redrawRounds.join('、')} 輪。</p>
          )}
          {!reviewTies.length && <p>需重新登錄比分：{displacedGames(event, revised).join('、') || '無'}</p>}
          <label>
            原因
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button
            disabled={busy || offline || !reason.trim() || Boolean(reviewTies.length)}
            onClick={() => run(confirmReview)}
          >
            確認變更
          </button>
          <button onClick={() => setReview(null)}>取消</button>
        </section>
      )}
    </main>
  );
}
