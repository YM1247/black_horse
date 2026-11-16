import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import PublicTournamentPage from './PublicTournamentPage';

vi.mock('./firebase', () => ({ isFirebaseConfigured: true }));

vi.mock('./services/tournamentRepository', () => ({
  normalizeEventCode: value => String(value || '').trim().toUpperCase(),
  validateEventCode: value => /^[A-Z0-9]{4,10}$/.test(String(value || '').trim().toUpperCase()),
  subscribeTournament: (code, onTournament) => {
    const alice = { id: 'alice', name: 'Alice', wins: 1, votes: 3, isWithdrawn: false, isEliminated: false };
    const bob = { id: 'bob', name: 'Bob', wins: 0, votes: 0, isWithdrawn: false, isEliminated: false };
    const value = {
      id: 'MOCK819',
      name: '8/19',
      phase: 'finished',
      judgeCount: 3,
      doubleElimination: true,
      players: [alice, bob],
      rounds: [[{
        id: 'match-1',
        round: 1,
        p1: alice,
        p2: bob,
        p1Votes: 3,
        p2Votes: 0,
        p1WinsSnapshot: 0,
        p2WinsSnapshot: 0,
        p1VotesSnapshot: 0,
        p2VotesSnapshot: 0,
        isMCMatch: false
      }]],
      clientUpdatedAt: '2026-08-20T10:00:00.000Z',
      sync: { fromCache: false, hasPendingWrites: false }
    };
    if (code === 'SERIES1') value.seriesId = 'black-horse-26-27';
    if (code === 'PLAYNOW') value.phase = 'playing';
    if (code === 'REGNOW') { value.phase = 'registration'; value.rounds = []; }
    if (code === 'OFF123') value.sync.fromCache = true;
    onTournament(value);
    return vi.fn();
  }
}));

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  window.scrollTo = vi.fn();
});

test('已完賽預設只顯示排名，可切換獨立賽況頁並保留賽事', async () => {
  render(<PublicTournamentPage initialCode="MOCK819" />);
  expect(await screen.findByRole('region', { name: '最終排名' })).toHaveTextContent('本場積分 100');
  expect(screen.queryByRole('region', { name: '本輪對戰' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '排名', exact:true })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('link', { name:'賽況',exact:true }));
  const matches=screen.getByRole('region', { name:'本輪對戰' });
  expect(matches).toHaveTextContent('0-0 組');
  expect(matches).not.toHaveTextContent('賽前');
  expect(screen.queryByRole('region', { name:'最終排名' })).not.toBeInTheDocument();
  expect(window.location.search).toContain('event=MOCK819');
  expect(window.location.search).toContain('view=matches');
  fireEvent.click(screen.getByRole('link', { name:'排名',exact:true }));
  expect(screen.queryByRole('region', { name:'本輪對戰' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name:'最終排名' })).toHaveTextContent('Alice');
});

test('進行中預設賽況，排名連結保存預覽參數，上一頁還原選擇', async () => {
  window.history.replaceState({}, '', '/?event=PLAYNOW&extra=keep');
  render(<PublicTournamentPage initialCode="PLAYNOW" />);
  expect(await screen.findByRole('region', { name:'本輪對戰' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name:'即時排名' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name:'排名',exact:true }));
  expect(window.location.search).toContain('extra=keep');
  expect(window.location.search).toContain('view=ranking');
  expect(screen.getByRole('region', { name:'即時排名' })).toBeInTheDocument();
  window.history.replaceState({}, '', '/?event=PLAYNOW&view=matches');
  fireEvent(window, new PopStateEvent('popstate'));
  expect(screen.getByRole('region', { name:'本輪對戰' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name:'即時排名' })).not.toBeInTheDocument();
});

test.each([['MOCK819','matches','本輪對戰'], ['PLAYNOW','ranking','即時排名']])('明確頁面連結優先於 %s 狀態預設', async (code,view,region) => {
  window.history.replaceState({}, '', `/?event=${code}&view=${view}`);
  render(<PublicTournamentPage initialCode={code} />);
  expect(await screen.findByRole('region', { name:region })).toBeInTheDocument();
});

test('尚無賽程時隱藏搜尋、排名與沒有目標的導覽', async () => {
  render(<PublicTournamentPage initialCode="REGNOW" />);
  expect(await screen.findByText('賽程尚未公布，開賽後會即時更新。')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '即時排名' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '完整瑞士制賽程' })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '公開頁面導覽' })).not.toBeInTheDocument();
});

test('斷線時使用同風格提示，隱藏無法連線的重試操作', async () => {
  const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  try {
    render(<PublicTournamentPage initialCode="OFF123" />);
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveClass('public-notice', 'public-notice--offline');
    expect(notice).toHaveTextContent('目前離線');
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument();
  } finally { offline.mockRestore(); }
});

test('切回賽況保留選手選擇', async () => {
  render(<PublicTournamentPage initialCode="PLAYNOW" />);
  const search = await screen.findByRole('searchbox');
  fireEvent.change(search, { target:{ value:'Alice' } });
  expect(screen.getByRole('article')).toHaveClass('is-search-match');
  fireEvent.click(screen.getByRole('link', { name:'排名',exact:true }));
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name:'賽況',exact:true }));
  expect(screen.getByRole('searchbox')).toHaveValue('Alice');
  expect(screen.getByRole('article')).toHaveClass('is-search-match');
});

test.each([['SERIES1',true],['PLAYNOW',false]])('只有系列場次 %s 顯示頂部返回入口並移除切換欄', async (code,hasSeries) => {
  render(<PublicTournamentPage initialCode={code} />);
  await screen.findByRole('heading',{name:'8/19'});
  const back=screen.queryByRole('link',{name:'返回系列賽'});
  if(hasSeries) expect(back).toHaveAttribute('href','/?series=BH2627');
  else expect(back).not.toBeInTheDocument();
  expect(screen.queryByText('切換賽事')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox',{name:'賽事代碼'})).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('即時更新中');
  expect(screen.getByRole('status').closest('header')).toBeInTheDocument();
});
