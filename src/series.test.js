import { BLACK_HORSE } from './series';
import { buildSeriesStandings, normalizeSeriesDefinition, SIMULATION_SERIES } from './series';

const player = (name, wins, votes, isWithdrawn = false) => ({
  id: `${name}-${wins}-${votes}`,
  name,
  wins,
  votes,
  isWithdrawn,
  isMC: false
});

const tournament = (id, phase, players) => ({ id, eventCode: id, phase, players, rounds: [] });

test('simulation series contains three separate three-judge double-elimination events', () => {
  expect(SIMULATION_SERIES.events.map(event => event.name)).toEqual(['8/19', '8/21', '8/26']);
  expect(SIMULATION_SERIES.events.every(event => event.judgeCount === 3)).toBe(true);
  expect(SIMULATION_SERIES.events.every(event => event.doubleElimination)).toBe(true);
  expect(new Set(SIMULATION_SERIES.events.map(event => event.eventCode)).size).toBe(3);
});

test('cloud series can add or remove event definitions without restoring defaults', () => {
  const series = normalizeSeriesDefinition({
    id: SIMULATION_SERIES.id,
    name: SIMULATION_SERIES.name,
    events: [{ id: 'aug-28', name: '8/28', eventCode: 'mock828' }]
  }, SIMULATION_SERIES);

  expect(series.events).toEqual([{
    id: 'aug-28',
    name: '8/28',
    eventCode: 'MOCK828',
    judgeCount: 3,
    doubleElimination: true
  }]);
});

test('missing cloud series keeps a mutable copy of the initial events', () => {
  const series = normalizeSeriesDefinition(null, SIMULATION_SERIES);
  expect(series.events).toEqual(SIMULATION_SERIES.events);
  expect(series.events).not.toBe(SIMULATION_SERIES.events);
});

test('series standings combine finished events by exact player name', () => {
  const standings = buildSeriesStandings(SIMULATION_SERIES, [
    tournament('MOCK819', 'finished', [player('Alice', 3, 9), player('Bob', 2, 7)]),
    tournament('MOCK821', 'finished', [player('Bob', 3, 8), player('Carol', 2, 6)]),
    tournament('MOCK826', 'playing', [player('Alice', 1, 3), player('Carol', 1, 3)])
  ]);

  expect(standings.map(standing => standing.name)).toEqual(['Bob', 'Alice', 'Carol']);
  expect(standings.find(standing => standing.name === 'Bob')).toMatchObject({
    totalPoints: 185,
    participatedEvents: 2,
    eventPoints: { MOCK819: 85, MOCK821: 100, MOCK826: 0 }
  });
  expect(standings.find(standing => standing.name === 'Alice')).toMatchObject({ totalPoints: 100, participatedEvents: 2 });
  expect(standings.find(standing => standing.name === 'Carol')).toMatchObject({ totalPoints: 85, participatedEvents: 2 });
});

test('unfinished events contribute zero and equal totals share a series rank', () => {
  const standings = buildSeriesStandings(SIMULATION_SERIES, [
    tournament('MOCK819', 'playing', [player('Alice', 1, 3), player('Bob', 0, 1)])
  ]);

  expect(standings).toHaveLength(2);
  expect(standings.every(standing => standing.totalPoints === 0)).toBe(true);
  expect(standings.every(standing => standing.displayRank === 1)).toBe(true);
});

test('withdrawn players remain visible with zero event points', () => {
  const standings = buildSeriesStandings(SIMULATION_SERIES, [
    tournament('MOCK819', 'finished', [player('Alice', 0, 0, true)])
  ]);
  expect(standings[0]).toMatchObject({ name: 'Alice', totalPoints: 0, eventPoints: { MOCK819: 0 } });
});

test('黑馬四站以編號採計三站，更正即重算，最終戰不納入', () => {
  const stations=BLACK_HORSE.events.slice(0,4);
  const scores=[3,2,1,0];
  function fixture(event,wins,i) {
    const losses=wins===0 ? 2 : 3-wins;
    const player={id:'person',name:i===3?'新打師名':'舊打師名',wins,votes:wins*3};
    const other={id:'opponent'+i,name:'同名',wins:losses,votes:losses*3};
    const rounds=Array.from({length:wins+losses},(_,j)=>[{p1:player,p2:other,p1Votes:j<wins?3:0,p2Votes:j<wins?0:3,isDone:true}]);
    return {id:event.eventCode,rulesVersion:event.rulesVersion,players:[player,other],phase:'finished',rounds};
  }
  const events=stations.map((s,i)=>fixture(s,scores[i],i));
  events.push(fixture(BLACK_HORSE.events[4],3,4));
  const standing=()=>buildSeriesStandings(BLACK_HORSE,events).find(p=>p.id==='person');
  expect(standing()).toMatchObject({name:'新打師名',participatedEvents:4,totalPoints:185,countedEvents:stations.slice(0,3).map(s=>s.eventCode)});
  events[3]=fixture(stations[3],3,3);
  expect(standing().totalPoints).toBe(255);
  expect(standing().countedEvents).not.toContain(stations[2].eventCode);
});
