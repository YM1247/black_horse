import { nextSwissRound, scoreSwiss, nextRoundDecision, publicPlayer, QUALIFIER, FINAL } from './seasonTournament';
import { qualification, startFinal, playoffSelection, seedPlayoff, playoffGames, scorePlayoff } from './finalTournament';

export const previewStages = [['registration','報名中'], ['round1','第一輪'], ['round2','第二輪'], ['round3','第三輪'], ['finished','積分賽完賽'], ['playoff','八強淘汰賽'], ['final','最終戰完賽']];
export function createPublicPreview(stage) {
  const names = ['青焰','夜凪','墨雨','白澤','星野','蒼月','千羽','風鈴','赤羽','流光','冬青','暮雪','初音','山嵐','海月','長名字測試・黑馬新星','晴空','紫苑','時雨','霜華','南風','北辰','夕霧','朝露','雲雀','月白'];
  const players = names.map((name,i)=>publicPlayer({id:`demo-${i}`,name}));
  let state = { id:'preview', seriesId:'black-horse-26-27', eventCode:'DEMO', name:'積分賽第一場', rulesVersion:QUALIFIER, phase:'registration', judgeCount:3, doubleElimination:true, players:players.slice(0,16), rounds:[], sync:{fromCache:false} };
  if (stage === 'registration') return state;
  const final = ['playoff','final'].includes(stage);
  if(final) {
    const rows=players.map((p,i)=>({...p,displayRank:i+1}));
    state=startFinal({...state,name:'黑馬記念最終戰',rulesVersion:FINAL,judgeCount:5,doubleElimination:false},qualification(rows,rows,{online:['demo-0','demo-1'],local:'demo-25'}));
  }
  const target = stage==='round1'?1:stage==='round2'?2:3;
  for(let round=0; round<target; round++) {
    if(!state.rounds[round]) { const d=nextRoundDecision(state); state=nextSwissRound(state,{reviveId:d.revival?.[0]?.id,substituteName:'主辦補位'}); }
    const matches=state.rounds[round];
    const partial=round===target-1 && !['finished','playoff','final'].includes(stage);
    for(const [i,m] of matches.entries()) {
      if(partial && i>=Math.ceil(matches.length/2)) break;
      state=scoreSwiss(state,round,m.id,i%(state.judgeCount+1));
    }
  }
  if(final) {
    const decisions=Object.fromEntries(playoffSelection(state).ties.map(({key,group})=>[key,group.map(p=>p.id)]));
    state=seedPlayoff(state,decisions);
    for(const [key] of (stage==='final'?playoffGames:playoffGames.slice(0,2))) state=scorePlayoff(state,key,5);
  }
  return {...state, phase:['finished','final'].includes(stage)?'finished':'playing'};
}
