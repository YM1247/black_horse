import React, { useEffect, useRef, useState } from 'react';
import { eventRanking, FINAL, nextRoundDecision, nextSwissRound, registeredPlayers, scoreSwiss, withdrawPlayer } from './seasonTournament';
import { buildSeriesStandings } from './series';
import { displacedGames, playoffSelection, qualification, scorePlayoff, seedPlayoff, startFinal } from './finalTournament';
import { saveCloudTournament, saveTournamentVersion } from './services/tournamentRepository';
import { subscribePlayers } from './services/playerDirectory';
import IdentityRegistration from './IdentityRegistration';
import PlayoffBracket from './PlayoffBracket';
import PublicTournamentBracket from './PublicTournamentBracket';
import { PublicTournamentRanking } from './PublicTournamentPage';

const stateKeys = ['phase','players','rounds','currentRoundNum','judgeCount','doubleElimination','runId','runNumber',
  'rulesVersion','currentVersion','resultLocked','qualificationConfig','qualifiedIds','playoffDecisions','playoffSeeds','bracket'];
const stateOf = data => Object.fromEntries(stateKeys.filter(key=>data[key] !== undefined).map(key=>[key,data[key]]));

function TieOrder({ ties, onResolve }) {
  const [orders,setOrders] = useState({});
  return ties.map(({key,group})=>{
    const ids = orders[key] || [];
    return <fieldset key={key}><legend>同分裁定 · 第 {group[0].displayRank} 名</legend>
      {group.map((_,i)=><label key={i}>裁定順序 {i+1}<select value={ids[i] || ''} onChange={e=>{
        const next = [...ids]; next[i]=e.target.value; setOrders({...orders,[key]:next});
      }}><option value="">選擇選手</option>{group.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>)}
      <button disabled={new Set(ids.filter(Boolean)).size !== group.length} onClick={()=>onResolve(key,ids)}>確認裁定順序</button>
    </fieldset>;
  });
}

function ScoreButtons({ judges, match, onScore }) {
  return <div className="score-options">{Array.from({length:judges+1},(_,i)=><button key={i}
    aria-pressed={match.p1Votes === judges-i} onClick={()=>onScore(judges-i)}>{judges-i} : {i}</button>)}</div>;
}

export default function SeasonAdmin({ tournament, series, tournaments, online, versions, onBack, onSignOut }) {
  const [profiles,setProfiles] = useState([]);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [review,setReview] = useState(null);
  const [reason,setReason] = useState('');
  const [reviveId,setReviveId] = useState('');
  const [substituteName,setSubstituteName] = useState('');
  const latest = useRef(tournament);
  const writing = useRef(false);
  if (tournament.revision >= latest.current.revision) latest.current = tournament;
  useEffect(()=>subscribePlayers(setProfiles,err=>setError(err.message)),[]);
  const event = latest.current;
  const isFinal = event.rulesVersion === FINAL;
  const registered = event.phase === 'registration';
  const finished = event.phase === 'finished';
  const ranked = eventRanking(event);
  const decision = nextRoundDecision(event);
  const config = event.qualificationConfig || {};
  const preview = isFinal && registered ? qualification(buildSeriesStandings(series,tournaments),profiles,config) : null;
  const roundsDone = event.rounds.length === 3 && event.rounds.flat().every(m=>m.isDone);
  const readyStations = series?.events.filter(e=>e.rulesVersion !== FINAL).every(e=>tournaments.some(t=>t.id===e.eventCode && t.phase==='finished'));
  const offline = !online || tournament.sync?.fromCache;

  async function write(next, action, details = {}, options = {}) {
    if (offline || writing.current) throw new Error('請等待連線及前一筆操作完成。');
    const current = latest.current;
    writing.current = true; setBusy(true); setError('');
    try {
      let revision;
      if (options.type) {
        const saved = await saveTournamentVersion(current.id,stateOf(next),{expectedRevision:current.revision,
          type:options.type,reason:options.reason || action,changes:[{action,...details}],sourceVersion:options.sourceVersion});
        revision = saved.revision;
        next = {...next,currentVersion:saved.version,resultLocked:next.phase === 'finished'};
      } else {
        revision = await saveCloudTournament(current.id,stateOf(next),{action,details},current.revision);
      }
      latest.current = {...next,revision};
    } finally { writing.current=false; setBusy(false); }
  }
  function run(operation) {
    setError('');
    Promise.resolve().then(operation).catch(err=>setError(err.message));
  }
  const configChange = change => write({...event,qualificationConfig:{...config,...change}},'更新最終戰資格',change);
  function propose(next,action,details = {}) {
    setReason(''); setReview({next,action,details,revision:event.revision,decisions:next.playoffDecisions || {}});
  }
  function editSwiss(index,match,left) {
    let next = scoreSwiss(event,index,match.id,left);
    if (match.p1Votes === left) return;
    const details = {round:index+1,matchId:match.id,before:match.p1Votes,after:left};
    if (finished || index !== event.rounds.length-1 || match.isDone) propose(next,'更正瑞士比分',details);
    else run(()=>write(next,'登錄瑞士比分',details));
  }
  function editPlayoff(key,left) {
    if (event.bracket[key].p1Votes === left) return;
    const next = scorePlayoff(event,key,left);
    const details = {game:key,before:event.bracket[key].p1Votes,after:left};
    if (event.bracket[key].isDone || finished) propose(next,'更正淘汰賽比分',details);
    else run(()=>write(next,'登錄淘汰賽比分',details));
  }
  let revised = review?.next, reviewTies = [];
  if (review && event.playoffSeeds?.length && !review.sourceVersion && review.action === '更正瑞士比分') {
    const selection = playoffSelection(revised,review.decisions);
    reviewTies = selection.ties;
    if (!reviewTies.length) revised = seedPlayoff(revised,review.decisions);
  }
  async function confirmReview() {
    if (review.revision !== latest.current.revision) throw new Error('賽事已有更新，請重新開啟更正。');
    const affected = displacedGames(event,revised);
    const complete = !isFinal || (revised.bracket?.gold?.isDone && revised.bracket?.bronze?.isDone);
    const next = {...revised,phase:finished && !complete ? 'playing' : revised.phase,resultLocked:finished && Boolean(complete)};
    await write(next,review.action,{...review.details,affected,reason,decisions:review.decisions},finished ? {
      type:review.sourceVersion ? 'restore' : complete ? 'correction' : 'reseed',reason,sourceVersion:review.sourceVersion
    } : {});
    setReview(null);
  }
  const canClose = roundsDone && (!isFinal || event.bracket?.gold?.isDone && event.bracket?.bronze?.isDone);
  return <main className="season-admin"><header><nav><button disabled={busy} onClick={onBack}>返回賽事管理</button>
    <a href={'?event='+event.id} target="_blank" rel="noreferrer">查看公開賽程</a><button onClick={onSignOut} disabled={busy}>登出</button></nav>
    <h1>{event.name}</h1><p>{isFinal ? '最終戰' : '積分賽'} · {event.judgeCount} 位評審 · {event.id}</p></header>
    {error && <p role="alert">{error}</p>}{offline && <p role="status">離線中，恢復連線後可操作。</p>}
    <fieldset disabled={busy || offline || Boolean(review)} className="season-body">
    <div><button onClick={()=>run(async()=>{
      await saveCloudTournament(event.id,{isPublic:!event.isPublic},{action:'更改公開狀態'},event.revision);
    })}>{event.isPublic ? '關閉公開' : '開啟公開'}</button></div>
    {registered && <section><h2>{isFinal ? '最終戰資格名單' : '選手報名'}</h2>
      {isFinal ? <>
        <details><summary>登錄新的保送或海選選手</summary><IdentityRegistration profiles={profiles} onPlayer={async()=>{}}/></details>
        <div className="season-fields">{['線上保送一','線上保送二','現場海選'].map((label,i)=><label key={label}>{label}
          <select value={(i===2 ? config.local : config.online?.[i]) || ''} onChange={e=>{const id=e.target.value;
            run(()=>{ const slots=[config.online?.[0] || '',config.online?.[1] || '']; slots[i]=id;
              return configChange(i===2 ? {local:id} : {online:slots}); });}}>
            <option value="">選擇打師名</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}（{p.realName}）</option>)}</select></label>)}</div>
        <TieOrder ties={preview.ties} onResolve={(key,ids)=>run(()=>configChange({decisions:{...config.decisions,[key]:ids}}))}/>
        <p>{preview.error || '資格名單已齊備'}</p>
        {!preview.error && <ol>{preview.players.map(p=><li key={p.id}>{p.name} · {p.source}{p.seedCredit ? ' · 種子' : ''}</li>)}</ol>}
        {!readyStations && <p>等待四站完賽後可開打。</p>}
        <button disabled={Boolean(preview.error) || !readyStations} onClick={()=>run(()=>write(startFinal(event,preview),'確認資格並開賽',{qualifiedIds:preview.players.map(p=>p.id)}))}>確認 24 人並產生首輪</button>
      </> : <>
        <IdentityRegistration profiles={profiles} remaining={48-event.players.length} onPlayer={p=>{
          const current=latest.current;
          return write({...current,players:registeredPlayers(current.players,[p])},'選手報名',{id:p.id,name:p.name});
        }}/>
        <h3>名單 {event.players.length}／48</h3><ul>{event.players.map(p=><li key={p.id}>{p.name}
          <button onClick={()=>run(()=>write({...event,players:event.players.filter(item=>item.id!==p.id)},'移除報名',{id:p.id}))}>移除</button></li>)}</ul>
        <button disabled={event.players.length<2} onClick={()=>run(()=>write(nextSwissRound(event),'開始積分賽'))}>開始第一輪</button>
      </>}
    </section>}
    {!registered && <>
      <PublicTournamentRanking tournament={event} rankedPlayers={ranked} prominent/>
      <section><h2>瑞士制配對與比分</h2>
        {event.rounds.map((round,index)=><details key={index} open={index===event.rounds.length-1}><summary>第 {index+1} 輪 · {round.length} 場</summary>
          {index===0 && isFinal && <p>種子首輪各記一勝五票：{event.players.filter(p=>p.seedCredit).map(p=>p.name).join('、')}</p>}
          {round.map(match=><article key={match.id}><div className="bout"><span><small>先攻</small>{match.p1.name}</span>
            <b>{match.p1Votes ?? '–'} : {match.p2Votes ?? '–'}</b><span><small>後攻</small>{match.p2.name}</span></div>
            <ScoreButtons judges={event.judgeCount} match={match} onScore={left=>editSwiss(index,match,left)}/></article>)}</details>)}
      </section>
      {!finished && !event.playoffSeeds?.length && <section>
        <details><summary>選手棄賽</summary>{event.players.filter(p=>!p.isWithdrawn && !p.isEliminated).map(p=><button key={p.id}
          onClick={()=>propose(withdrawPlayer(event,p.id),'選手棄賽',{id:p.id})}>{p.name} 棄賽</button>)}</details>
        {event.rounds.length < 3 && <>
          {decision.revival?.length > 1 && <label>裁定復活選手<select value={reviveId} onChange={e=>setReviveId(e.target.value)}>
            <option value="">請選擇</option>{decision.revival.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
          {decision.revival?.length===1 && <p>下一輪復活：{decision.revival[0].name}</p>}
          {decision.substitute && <label>主辦方補位選手<input value={substituteName} onChange={e=>setSubstituteName(e.target.value)}/></label>}
          <button disabled={event.rounds.at(-1).some(m=>!m.isDone)} onClick={()=>run(()=>write(nextSwissRound(event,{reviveId,substituteName}),
            '產生下一輪',{reviveId:decision.revival?.length===1 ? decision.revival[0].id : reviveId,substituteName}))}>產生第 {event.rounds.length+1} 輪</button>
        </>}
        {isFinal && roundsDone && <>
          <TieOrder ties={playoffSelection(event).ties} onResolve={(key,ids)=>run(()=>write({...event,playoffDecisions:{...event.playoffDecisions,[key]:ids}},'八強種子裁定',{ids}))}/>
          <button disabled={playoffSelection(event).ties.length>0} onClick={()=>run(()=>write(seedPlayoff(event,event.playoffDecisions || {}),'確認八強種子'))}>建立八強籤表</button>
        </>}
      </section>}
      {event.playoffSeeds?.length>0 && <PlayoffBracket event={event} renderScore={(key,match)=><ScoreButtons judges={5} match={match} onScore={left=>editPlayoff(key,left)}/>}/>}
      {!finished && canClose && <button onClick={()=>run(()=>write({...event,phase:'finished',resultLocked:true},'完賽鎖定',{}, {type:'completed'}))}>結算並鎖定結果</button>}
      <details><summary>瑞士制樹狀圖</summary><PublicTournamentBracket rounds={event.rounds}/></details>
      {finished && versions?.length>0 && <details><summary>完賽版本紀錄</summary>{versions.filter(v=>v.runId===event.runId).map(v=><button key={v.id}
        disabled={v.version===event.currentVersion || !v.snapshot.resultLocked} onClick={()=>{
          propose({...event,...stateOf(v.snapshot)},'回復版本',{version:v.version});
          setReview(r=>({...r,sourceVersion:v.version}));
        }}>回復 v{v.version} · {v.reason}</button>)}</details>}
    </>}
    </fieldset>
    {review && <section className="season-review" role="region" aria-label="確認更正"><h2>{review.action}</h2>
      <p>{review.details.matchId ? '左側票數 '+review.details.before+' → '+review.details.after : review.details.game || review.details.id || ''}</p>
      <TieOrder ties={reviewTies} onResolve={(key,ids)=>setReview({...review,decisions:{...review.decisions,[key]:ids}})}/>
      {!reviewTies.length && <p>需重新登錄比分：{displacedGames(event,revised).join('、') || '無'}</p>}
      <label>原因<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button disabled={busy || offline || !reason.trim() || Boolean(reviewTies.length)} onClick={()=>run(confirmReview)}>確認變更</button>
      <button onClick={()=>setReview(null)}>取消</button></section>}
  </main>;
}
