import { fireEvent, render, screen, within } from '@testing-library/react';
import PublicEventLive, { PublicMatch } from './PublicEventLive';
import { AKASHIKI } from './tournamentState';

const first = { id: 'first', name: '青焰' };
const second = { id: 'second', name: '夜凪' };
const third = { id: 'third', name: '青焰二號', seedCredit: true };
const base = { id: 'event', players: [first, second, third], rounds: [
  [{ id: 'round1', p1: first, p2: second, p1Votes: 2, p2Votes: 1, attackOrder: true }],
  [{ id: 'round2', p1: second, p2: first, p1Votes: null, p2Votes: null, attackOrder: true }]
] };

test('選手搜尋需明確選擇，顯示當輪先後攻並保留即時比分更新', () => {
  const { rerender } = render(<PublicEventLive tournament={base} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '青焰' } });
  const results = screen.getByRole('region', { name: '選手搜尋結果' });
  expect(within(results).getAllByRole('button')).toHaveLength(2);
  fireEvent.click(within(results).getByRole('button', { name: '青焰', exact: true }));
  const personal = screen.getByRole('region', { name: '你的對戰' });
  expect(personal).toHaveTextContent('第 2 輪');
  expect(personal).toHaveTextContent('夜凪先攻');
  expect(personal).toHaveTextContent('青焰後攻');
  expect(personal).toHaveTextContent('等待比分');
  rerender(<PublicEventLive tournament={{ ...base, rounds: [base.rounds[0], [{ ...base.rounds[1][0], p1Votes: 0, p2Votes: 3 }]] }} />);
  expect(personal).toHaveTextContent('0 : 3');
  expect(personal).toHaveTextContent('已完成');
  fireEvent.click(screen.getByRole('link', { name: '第 1 輪' }));
  expect(personal).toHaveTextContent('2 : 1');
  fireEvent.click(screen.getByRole('button', { name: '清除選手選擇' }));
  expect(screen.queryByRole('region', { name: '你的對戰' })).not.toBeInTheDocument();
});

test('首輪種子無對戰及未完整比分不會顯示錯誤成績', () => {
  render(<PublicEventLive tournament={{ ...base, rounds: [[{ ...base.rounds[0][0], p2Votes: null }]] }} />);
  expect(screen.getByText('— : —')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: third.name } });
  fireEvent.click(screen.getByRole('button', { name: third.name }));
  expect(screen.getByRole('region', { name: '你的對戰' })).toHaveTextContent('首輪種子記一勝五票');
});

test('合作賽個人冠軍戰顯示局數與每局票數，仍可回查瑞士輪次', () => {
  render(<PublicEventLive tournament={{ ...base, rulesVersion: AKASHIKI, bracket: { gold: { p1: first, p2: second, p1Votes: 2, p2Votes: 1, games: [{ p1Votes: 3, p2Votes: 0 }], attackOrder: true } } }} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: first.name } });
  fireEvent.click(screen.getByRole('button', { name: first.name, exact: true }));
  const personal = screen.getByRole('region', { name: '你的對戰' });
  expect(personal).toHaveTextContent('冠軍戰');
  expect(personal).toHaveTextContent('局（BO3）');
  expect(personal).toHaveTextContent('第1局 3 : 0 票');
  fireEvent.click(screen.getByRole('link', { name: '第 1 輪' }));
  expect(personal).toHaveTextContent('第 1 輪');
  expect(personal).not.toHaveTextContent('BO3');
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
