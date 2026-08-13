import { fireEvent, render, screen } from '@testing-library/react';
import ResultCorrectionPanel from './ResultCorrectionPanel';

const players = [
  { id: 'a', name: '甲', wins: 1, votes: 3, losses: 0, isWithdrawn: false, isEliminated: false },
  { id: 'b', name: '乙', wins: 0, votes: 0, losses: 1, isWithdrawn: false, isEliminated: false }
];
const rounds = [[{
  id: 'm1',
  p1: players[0],
  p2: players[1],
  p1Votes: 3,
  p2Votes: 0,
  isDone: true,
  isMCMatch: false
}]];

const renderPanel = (overrides = {}) => {
  const props = {
    players,
    rounds,
    judgeCount: 3,
    doubleElimination: true,
    versions: [],
    runId: 'run-1',
    currentVersion: 1,
    onCancel: jest.fn(),
    onCommit: jest.fn().mockResolvedValue(undefined),
    onRestore: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
  render(<ResultCorrectionPanel {...props} />);
  return props;
};

test('a correction requires a reason and a second confirmation click', async () => {
  const props = renderPanel();
  fireEvent.change(screen.getByLabelText('更正 甲 姓名'), { target: { value: '甲改名' } });
  fireEvent.change(screen.getByRole('textbox', { name: '更正原因' }), { target: { value: '修正登錄姓名' } });

  fireEvent.click(screen.getByRole('button', { name: '預覽並準備送出更正' }));
  expect(props.onCommit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '再次點擊確認執行' }));

  expect(props.onCommit).toHaveBeenCalledWith(expect.objectContaining({
    reason: '修正登錄姓名',
    changes: [expect.objectContaining({ type: 'player-name', before: '甲', after: '甲改名' })]
  }));
});

test('versions from an older cleared run are view-only', () => {
  renderPanel({
    versions: [{ id: 'old-v1', runId: 'old-run', version: 1, type: 'completed', reason: '舊賽事' }]
  });
  expect(screen.getByText('舊場次紀錄・僅供查看')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '回復此版本' })).not.toBeInTheDocument();
});

