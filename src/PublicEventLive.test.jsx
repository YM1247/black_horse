import { fireEvent, render, screen } from '@testing-library/react';
import PublicEventLive, { PublicMatch } from './PublicEventLive';
import { vi } from 'vitest';

const first = { id: 'first', name: '青焰' };
const second = { id: 'second', name: '夜凪' };
const third = { id: 'third', name: '青焰二號', seedCredit: true };
const base = { id: 'event', players: [first, second, third], rounds: [
  [{ id: 'round1', p1: first, p2: second, p1Votes: 2, p2Votes: 1, attackOrder: true }],
  [{ id: 'round2', p1: second, p2: first, p1Votes: null, p2Votes: null, attackOrder: true }]
] };

test('搜尋高亮而不過濾，送出捲動至對戰並保留比分更新', () => {
  const scroll = vi.fn();
  const prior = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = scroll;
  try {
    const extra = {id:'other',p1:{name:'其他甲'},p2:{name:'其他乙'}};
    const data = {...base, rounds:[base.rounds[0], [...base.rounds[1],extra]]};
    const {rerender} = render(<PublicEventLive tournament={data} />);
    fireEvent.change(screen.getByRole('searchbox'), {target:{value:'青焰'}});
    expect(screen.getAllByRole('article')).toHaveLength(2);
    const row=screen.getByRole('article',{name:'第 2 輪對戰 1'});
    expect(row).toHaveClass('is-search-match');
    expect(screen.getByRole('article',{name:'第 2 輪對戰 2'})).not.toHaveClass('is-search-match');
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('searchbox').closest('form'));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(row).toHaveFocus();
    rerender(<PublicEventLive tournament={{...data,rounds:[base.rounds[0],[{...base.rounds[1][0],p1Votes:0,p2Votes:3},extra]]}} />);
    expect(row).toHaveTextContent('0 : 3');
    expect(row).toHaveClass('is-search-match');
    fireEvent.click(screen.getByRole('link',{name:'第 1 輪'}));
    expect(screen.getByRole('article')).toHaveClass('is-search-match');
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:''}});
    expect(screen.getByRole('article')).not.toHaveClass('is-search-match');
  } finally { Element.prototype.scrollIntoView = prior; }
});

test('沒有符合對戰時保留賽程並提示，不捲動', () => {
  render(<PublicEventLive tournament={base} />);
  fireEvent.change(screen.getByRole('searchbox'), {target:{value:third.name}});
  expect(screen.getByRole('status')).toHaveTextContent('目前沒有符合的對戰');
  expect(screen.getByRole('article')).toBeInTheDocument();
  expect(screen.getByText('— : —')).toBeInTheDocument();
  fireEvent.submit(screen.getByRole('searchbox').closest('form'));
});

test('BO3 只完成一局時保留目前局數且不誤報完賽', () => {
  render(<PublicMatch prominent unit="局（BO3）" match={{ p1: first, p2: second, p1Votes: 1, p2Votes: 0, isDone: false, games: [{ p1Votes: 2, p2Votes: 1 }] }} />);
  expect(screen.getByText('1 : 0')).toBeInTheDocument();
  expect(screen.getByText('進行中')).toBeInTheDocument();
  expect(screen.queryByText('已完成')).not.toBeInTheDocument();
});

test('分組及戰績使用該輪快照，區分跨組與票數組', async () => {
  const { groupPublicMatches, matchRecord } = await import('./PublicEventLive');
  const matches = [
    {id:'a',p1:{wins:3},p2:{wins:3},p1WinsSnapshot:2,p2WinsSnapshot:2,p1VotesSnapshot:5,p2VotesSnapshot:6},
    {id:'b',p1:{wins:2},p2:{wins:2},p1WinsSnapshot:1,p2WinsSnapshot:1},
    {id:'c',p1:{wins:2},p2:{wins:1},p1WinsSnapshot:2,p2WinsSnapshot:1}
  ];
  expect(groupPublicMatches(matches,2).map(g=>g.label)).toEqual(['2-0 組','跨組（2-0／1-1）','1-1 組']);
  expect(matchRecord(matches[0],'p1',2)).toEqual({wins:2,losses:0,votes:5});
  expect(groupPublicMatches(matches.slice(0,1),2,true)[0].label).toBe('跨組（6 票／5 票）');
});

test('淘汰賽同樣即時高亮，可送出前往符合的對戰', () => {
  const prior=Element.prototype.scrollIntoView;
  const scroll=vi.fn();
  Element.prototype.scrollIntoView=scroll;
  try {
    const player={id:'knockout',name:'淘汰測試'};
    render(<PublicEventLive tournament={{...base,playoffSeeds:[player,second],bracket:{q1:{p1:player,p2:second}}}} />);
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'淘汰測試'}});
    const target=document.querySelector('[data-playoff-game="q1"]');
    expect(target).toHaveClass('is-search-match');
    fireEvent.submit(screen.getByRole('searchbox').closest('form'));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(target).toHaveFocus();
  } finally {Element.prototype.scrollIntoView=prior;}
});
