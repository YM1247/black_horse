import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import IdentityRegistration from './IdentityRegistration';
import { saveIdentity } from './services/playerDirectory';

vi.mock('./services/playerDirectory', () => ({
  saveIdentity: vi.fn(async row => ({ id: row.realName, name: row.name }))
}));
beforeEach(() => { saveIdentity.mockClear(); });
const rows = count => Array.from({ length: count }, (_, i) => `本名${i},09000000${String(i).padStart(2, '0')},打師${i}`);
const upload = count => fireEvent.change(screen.getByLabelText('匯入 CSV（本名、電話號碼、打師名）'), {
  target: { files: [{ text: async () => ['本名,電話號碼,打師名', ...rows(count)].join('\n') }] }
});

test('32 人匯入只提交四次賽事名單，並顯示完成進度', async () => {
  const onPlayers = vi.fn(async () => {});
  render(<IdentityRegistration profiles={[]} onPlayers={onPlayers} />);
  upload(32);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已完成 32／32 筆'));
  expect(saveIdentity).toHaveBeenCalledTimes(32);
  expect(onPlayers.mock.calls.map(([players]) => players.length)).toEqual([8, 8, 8, 8]);
  expect(new Set(onPlayers.mock.calls.flatMap(([players]) => players.map(player => player.id))).size).toBe(32);
});

test('名單寫入失敗保留未提交部分，重試不重送已完成的批次', async () => {
  const onPlayers = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('版本衝突')).mockResolvedValue();
  render(<IdentityRegistration profiles={[]} onPlayers={onPlayers} />);
  upload(10);
  expect(await screen.findByRole('alert')).toHaveTextContent('版本衝突');
  expect(screen.getByText(/待處理 2 筆/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重試' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已完成 2／2 筆'));
  expect(onPlayers.mock.calls.map(([players]) => players.map(player => player.id))).toEqual([
    Array.from({ length: 8 }, (_, i) => `本名${i}`), ['本名8', '本名9'], ['本名8', '本名9']
  ]);
});

test('遇到待核對身分時先提交之前的選手，確認後才繼續', async () => {
  const onPlayers = vi.fn(async () => {});
  render(<IdentityRegistration profiles={[{ id: 'old', realName: '本名1', phone: '0900000001', name: '舊名' }]} onPlayers={onPlayers} />);
  upload(3);
  expect(await screen.findByRole('heading', { name: '請核對選手身分' })).toBeInTheDocument();
  expect(onPlayers.mock.calls[0][0].map(player => player.id)).toEqual(['本名0']);
  expect(saveIdentity).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /沿用 舊名/ }));
  await waitFor(() => expect(onPlayers).toHaveBeenCalledTimes(2));
  expect(onPlayers.mock.calls[1][0].map(player => player.id)).toEqual(['本名1', '本名2']);
});
