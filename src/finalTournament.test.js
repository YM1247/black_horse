import { expect,it } from 'vitest';
import { displacedGames, playoffGames, playoffSelection, qualification, resultPlayer, scorePlayoff, seedPlayoff, startFinal } from './finalTournament';
import { nextSwissRound, scoreSwiss, FINAL, eventRanking } from './seasonTournament';
import { createEmptyTournament } from './tournamentState';

const standings = Array.from({length:26},(_,i)=>({id:String(i+1),name:'打師'+(i+1), displayRank:i+1}));
const config = {online:['1','2'],local:'26'};
it('驗證二十四人、種子順延、首尾對戰、三輪與全部八場淘汰賽',()=>{
  const preview = qualification(standings,standings,config);
  expect(preview.error).toBe('');
  expect(preview.players.filter(p=>p.seedCredit).map(p=>p.id)).toEqual(['1','2','3','4','5','6','7','8']);
  const event = createEmptyTournament({rulesVersion:FINAL,judgeCount:5,doubleElimination:false});
  let state = startFinal(event,preview);
  expect(state.rounds[0]).toHaveLength(8);
  expect([state.rounds[0][0].p1.id,state.rounds[0][0].p2.id].sort()).toEqual(['26','9']);
  expect(state.players.filter(p=>p.wins===1 && p.votes===5)).toHaveLength(8);
  expect(eventRanking(state)[0].opponentWinRate).toBe(0);
  for (let i=0;i<3;i++) {
    if (i) state = nextSwissRound(state);
    for (const [j,m] of state.rounds[i].entries()) state = scoreSwiss(state,i,m.id,j%6);
  }
  expect(state.rounds.map(r=>r.length)).toEqual([8,12,12]);
  const decisions=Object.fromEntries(playoffSelection(state).ties.map(({key,group})=>[key,group.map(p=>p.id)]));
  state=seedPlayoff(state,decisions);
  const ids=state.playoffSeeds.map(p=>p.id);
  for(const [key,,a,b] of playoffGames.slice(0,4)) {
    expect(new Set([state.bracket[key].p1.id,state.bracket[key].p2.id])).toEqual(new Set([ids[Number(a)-1],ids[Number(b)-1]]));
  }
  for (const [key] of playoffGames) state=scorePlayoff(state,key,5);
  expect(Object.values(state.bracket).filter(m=>m.isDone)).toHaveLength(8);
  expect(new Set([resultPlayer(state.bracket.gold),resultPlayer(state.bracket.gold,false),resultPlayer(state.bracket.bronze)].map(p=>p.id)).size).toBe(3);
  const corrected=scorePlayoff(state,'q1',0);
  expect(displacedGames(state,corrected)).toEqual(['四強 1','季軍戰','冠軍戰']);
  expect(corrected.bracket.s2).toEqual(state.bracket.s2);
});
it('拒絕重複資格，同分跨入圍線須人工裁定',()=>{
  expect(qualification(standings,standings,{...config,local:'1'}).error).toContain('不同');
  expect(qualification(standings,standings,{...config,local:'5'}).error).toContain('重複');
  const rows = standings.map(p=>p.id==='24' ? {...p,displayRank:23} : p);
  const preview = qualification(rows,standings,config);
  expect(preview.ties).toHaveLength(1);
  const final=qualification(rows,standings,{...config,decisions:{[preview.ties[0].key]:['24','23']}});
  expect(final.players.map(p=>p.id)).toContain('24');
  expect(final.players.map(p=>p.id)).not.toContain('23');
});
