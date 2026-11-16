import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import PublicSeriesPage from './PublicSeriesPage';

vi.mock('./firebase', () => ({ isFirebaseConfigured: true }));

vi.mock('./services/tournamentRepository', () => ({
  normalizeEventCode: value => String(value || '').trim().toUpperCase(),
  validateEventCode: value => /^[A-Z0-9]{4,10}$/.test(String(value || '').trim().toUpperCase()),
  subscribePublicSeries: (code, onSeries) => {
    onSeries({
      id: code,
      publicCode: code,
      name: '模擬賽',
      description: '系列說明',
      clientUpdatedAt: '2026-08-13T10:00:00.000Z',
      sync: { fromCache: false },
      events: [
        { id: 'one', name: '8/19', eventCode: code === 'REGSER' ? 'REG819' : 'MOCK819', judgeCount: 3, doubleElimination: true },
        { id: 'two', name: '8/21', eventCode: 'MOCK821', judgeCount: 3, doubleElimination: true },
        { id: 'three', name: '8/26', eventCode: 'MOCK826', judgeCount: 3, doubleElimination: true }
      ]
    });
    return vi.fn();
  },
  subscribeTournament: (code, onTournament) => {
    onTournament({
      id: code,
      phase: code === 'REG819' ? 'registration' : code === 'MOCK819' ? 'finished' : 'playing',
      players: ['MOCK819', 'REG819'].includes(code) ? [{ id: 'alice', name: 'Alice', wins: 1, votes: 3 }] : [],
      rounds: code === 'MOCK819' ? [[{
        id: 'm1', p1: { id: 'alice', name: 'Alice' }, p2: { id: 'bob', name: 'Bob' }, p1Votes: 3, p2Votes: 0
      }]] : [],
      clientUpdatedAt: '2026-08-13T10:01:00.000Z',
      sync: { fromCache: false }
    });
    return vi.fn();
  }
}));

test('public series page shows public events and computes finished-event standings', async () => {
  render(<PublicSeriesPage initialCode="SIM2026" />);

  expect(await screen.findByRole('heading', { name: '模擬賽' })).toBeInTheDocument();
  expect(screen.queryByText('系列說明')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '8/19' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '8/21' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '8/26' })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: '查看單場賽況' })[0]).toHaveAttribute('href', '/?event=MOCK819');
  await waitFor(() => expect(screen.getAllByText('Alice')).toHaveLength(2));
  expect(screen.getByText('已完賽')).toBeInTheDocument();
  expect(screen.getAllByText('進行中')).toHaveLength(2);

  const mobileStandings = screen.getByLabelText('手機版系列積分排名');
  const desktopStandings = screen.getByLabelText('桌面版系列積分排名');
  expect(mobileStandings).toHaveClass('md:hidden');
  expect(desktopStandings).toHaveClass('hidden', 'md:block');
  expect(mobileStandings).toHaveTextContent('Alice');
  expect(mobileStandings).toHaveTextContent('總積分100');
  expect(mobileStandings).toHaveTextContent('8/19100');
  expect(within(mobileStandings).getByText('8/26').parentElement).toHaveClass('col-span-2');

  const playerHeader = screen.getByRole('columnheader', { name: '選手' });
  const aliceCell = screen.getByRole('cell', { name: 'Alice' });
  const eventHeader = screen.getByRole('columnheader', { name: '8/19' });
  expect(playerHeader).toHaveClass('left-12', 'w-40', 'max-w-40');
  expect(aliceCell).toHaveClass('left-12', 'w-40', 'max-w-40', 'break-words');
  expect(aliceCell).toHaveAttribute('title', 'Alice');
  expect(eventHeader).toHaveClass('min-w-[5.5rem]');
});

test('系列排名可按打師名搜尋，保留原本名次與得分並提示找不到選手', async () => {
  render(<PublicSeriesPage initialCode="SIM2026" />);
  expect(await screen.findByRole('cell', { name: 'Alice' })).toBeInTheDocument();
  const input = screen.getByRole('searchbox', { name: '搜尋打師名' });
  fireEvent.change(input, { target: { value: 'nobody' } });
  expect(screen.queryByRole('cell', { name: 'Alice' })).not.toBeInTheDocument();
  expect(screen.getAllByText('找不到這位選手，請確認打師名。')).toHaveLength(2);
  fireEvent.change(input, { target: { value: ' ali ' } });
  const row = screen.getByRole('cell', { name: 'Alice' }).parentElement;
  expect(row).toHaveTextContent('100');
  expect(row.firstElementChild).toHaveTextContent('1');
});

test('已有報名選手但尚未完賽，不顯示零分排名搜尋與導覽', async () => {
  render(<PublicSeriesPage initialCode="REGSER" />);
  expect(await screen.findByText('積分排名將在首場完賽後公布。')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('cell', { name: 'Alice' })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '公開頁面導覽' })).not.toBeInTheDocument();
});
