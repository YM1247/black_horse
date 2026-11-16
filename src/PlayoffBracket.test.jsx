import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PlayoffBracket from './PlayoffBracket';
import { akashikiPlayoffGames, buildPlayoff, gamesFor, scorePlayoff } from './finalTournament';
import { AKASHIKI, FINAL } from './tournamentState';

function fixture() {
  const playoffSeeds = Array.from({ length: 16 }, (_, i) => ({ id: String(i), name: '籤位選手' + (i + 1) }));
  return { rulesVersion: AKASHIKI, playoffSeeds, bracket: buildPlayoff(playoffSeeds, {}, akashikiPlayoffGames) };
}

function ScoreHarness({ initial }) {
  const [event, setEvent] = useState(initial);
  return <PlayoffBracket event={event} renderScore={(key, match, gameIndex) => <div className="score-options">
    {[3, 2, 1, 0].map(left => <button key={left} onClick={() => setEvent(current => scorePlayoff(current, key, left, gameIndex))}>{left} : {3 - left}</button>)}
  </div>} />;
}

test('公開十六強樹狀圖一次呈現四輪、正確晉級來源與季軍分支，保持唯讀', () => {
  render(<PlayoffBracket event={fixture()} />);
  const tree = screen.getByRole('region', { name: '十六強晉級樹狀圖' });
  expect(tree).toHaveAttribute('tabindex', '0');
  expect(within(tree).getAllByRole('article')).toHaveLength(16);
  for (const name of ['十六強', '八強', '四強', '獎牌戰']) expect(within(tree).getByRole('heading', { name, exact: true })).toBeInTheDocument();
  const quarter = within(tree).getByRole('article', { name: '八強 1', exact: true });
  expect(within(quarter).getByText('十六強 1 勝者', { exact: true })).toBeInTheDocument();
  expect(within(quarter).getByText('十六強 2 勝者', { exact: true })).toBeInTheDocument();
  const bronze = within(tree).getByRole('article', { name: '季軍戰', exact: true });
  expect(within(bronze).getByText('四強 1 敗者', { exact: true })).toBeInTheDocument();
  expect(within(bronze).getByText('四強 2 敗者', { exact: true })).toBeInTheDocument();
  expect(within(tree).queryByRole('button')).not.toBeInTheDocument();
});

test('樹狀圖直接記分後更新相應八強選手，未完成另一場時仍等待', () => {
  const event = fixture();
  render(<ScoreHarness initial={event} />);
  for (const name of ['十六強 1', '十六強 2']) fireEvent.click(within(screen.getByRole('article', { name, exact: true })).getByRole('button', { name: '3 : 0', exact: true }));
  const quarter = screen.getByRole('article', { name: '八強 1', exact: true });
  expect(quarter).toHaveTextContent(event.bracket.r1.p1.name);
  expect(quarter).toHaveTextContent(event.bracket.r2.p1.name);
  expect(within(quarter).getAllByRole('button')).toHaveLength(4);
  expect(within(screen.getByRole('article', { name: '八強 2', exact: true })).queryByRole('button')).not.toBeInTheDocument();
});

test('冠軍戰保留逐局票數與 BO3 記分，2:0 後不顯示第三局', () => {
  let event = fixture();
  for (const [key] of gamesFor(event)) if (key !== 'gold') event = scorePlayoff(event, key, 3);
  render(<ScoreHarness initial={event} />);
  for (const i of [1, 2]) fireEvent.click(within(screen.getByRole('group', { name: `冠軍戰第 ${i} 局`, exact: true })).getByRole('button', { name: '3 : 0', exact: true }));
  expect(screen.queryByRole('group', { name: '冠軍戰第 3 局', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: '冠軍戰', exact: true })).toHaveTextContent('2局');
  expect(document.querySelector('.medalists')).toHaveTextContent(event.bracket.gold.p1.name);
});

test('既有五票八強仍顯示原場次與冠軍、季軍戰', () => {
  const playoffSeeds = fixture().playoffSeeds.slice(0, 8);
  render(<PlayoffBracket event={{ rulesVersion: FINAL, playoffSeeds, bracket: buildPlayoff(playoffSeeds) }} />);
  expect(screen.getByRole('region', { name: '八強淘汰賽', exact: true })).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(8);
  expect(screen.queryByRole('region', { name: '十六強晉級樹狀圖' })).not.toBeInTheDocument();
});


test('公開八強隱藏籤位與場次編號，已完成才明示勝敗', () => {
  const playoffSeeds=fixture().playoffSeeds.slice(0,8);
  const event={rulesVersion:FINAL,playoffSeeds,bracket:buildPlayoff(playoffSeeds)};
  event.bracket.q1={...event.bracket.q1,p1Votes:5,p2Votes:0,isDone:true};
  event.bracket.q2={...event.bracket.q2,p1Votes:1,p2Votes:0,isDone:false};
  render(<PlayoffBracket event={event} publicView />);
  expect(screen.getByRole('heading',{name:'淘汰賽',exact:true})).toBeInTheDocument();
  const done=screen.getByRole('article',{name:'八強 1',exact:true});
  expect(within(done).queryByRole('heading')).not.toBeInTheDocument();
  const stage=screen.getByRole('region',{name:'八強',exact:true});
  expect(within(stage).getAllByRole('heading')).toHaveLength(1);
  expect(within(stage).getAllByRole('article')).toHaveLength(4);
  expect(screen.queryByRole('region',{name:'四強',exact:true})).not.toBeInTheDocument();
  expect(screen.queryByRole('region',{name:'冠軍戰',exact:true})).not.toBeInTheDocument();
  expect(screen.queryByText('等待晉級結果')).not.toBeInTheDocument();
  expect(done).not.toHaveTextContent('#');
  expect(done.querySelector('.is-winner')).toHaveTextContent(event.bracket.q1.p1.name);
  expect(done.querySelector('.public-winner-label')).toBeNull();
  expect(done.querySelector('.is-loser')).toHaveTextContent(event.bracket.q1.p2.name);
  const pending=screen.getByRole('article',{name:'八強 2',exact:true});
  expect(pending.querySelector('.is-loser')).toBeNull();
  expect(pending.querySelector('.public-winner-label')).toBeNull();
});


test('公開合作賽按階段分組並保留冠軍戰逐局比分', () => {
  let event=fixture();
  for(const [key] of gamesFor(event)) if(key!=='gold') event=scorePlayoff(event,key,3);
  event=scorePlayoff(event,'gold',3,0);
  render(<PlayoffBracket event={event} publicView />);
  expect(within(screen.getByRole('region',{name:'十六強',exact:true})).getAllByRole('article')).toHaveLength(8);
  const final=screen.getByRole('region',{name:'冠軍戰',exact:true});
  expect(within(final).getAllByRole('heading')).toHaveLength(1);
  expect(within(final).getByText('第 1 局 · 3 : 0 票')).toBeInTheDocument();
  expect(final.querySelector('.public-winner-label')).toBeNull();
});

test('後續階段有確定對戰才顯示，公開只列出已知組合', () => {
  const seeds=fixture().playoffSeeds.slice(0,8);
  let event={rulesVersion:FINAL,judgeCount:5,playoffSeeds:seeds,bracket:buildPlayoff(seeds)};
  event=scorePlayoff(scorePlayoff(event,'q1',5),'q2',5);
  render(<PlayoffBracket event={event} publicView />);
  expect(within(screen.getByRole('region',{name:'四強',exact:true})).getAllByRole('article')).toHaveLength(1);
  expect(screen.queryByRole('region',{name:'季軍戰',exact:true})).not.toBeInTheDocument();
});
