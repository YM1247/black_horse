import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import SeasonAdmin from './SeasonAdmin';
import { createEmptyTournament } from './tournamentState';
import { FINAL, QUALIFIER } from './seasonTournament';
import { saveCloudTournament } from './services/tournamentRepository';
import { saveIdentity } from './services/playerDirectory';

vi.mock('./services/playerDirectory', () => ({
  subscribePlayers: (callback) => {
    callback([{ id: 'stable', name: '舊打師名', realName: '私人本名', phone: '0912345678' }]);
    return () => {};
  },
  saveIdentity: vi.fn(async (row) => ({ id: 'stable', name: row.name }))
}));
vi.mock('./services/tournamentRepository', async (importOriginal) => ({
  ...(await importOriginal()),
  saveCloudTournament: vi.fn(async (_id, _state, _audit, revision) => revision + 1)
}));

test('在後台核對改名後，以原編號報名並開始第一輪，公開寫入沒有本名電話', async () => {
  const event = {
    ...createEmptyTournament({ rulesVersion: QUALIFIER }),
    id: 'TEST26',
    revision: 0,
    isPublic: true,
    name: '積分賽',
    players: [{ id: 'other', name: '選手甲', wins: 0, votes: 0 }]
  };
  render(<SeasonAdmin tournament={event} tournaments={[]} online versions={[]} />);
  fireEvent.change(screen.getByLabelText('本名'), { target: { value: '私人本名' } });
  fireEvent.change(screen.getByLabelText('電話號碼'), { target: { value: '0912345678' } });
  fireEvent.change(screen.getByLabelText('打師名'), { target: { value: '新打師名' } });
  fireEvent.click(screen.getByRole('button', { name: '登錄選手' }));
  expect(await screen.findByRole('heading', { name: '請核對選手身分' })).toBeInTheDocument();
  expect(saveCloudTournament).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /沿用 舊打師名/ }));
  await waitFor(() => expect(saveCloudTournament).toHaveBeenCalledTimes(1));
  expect(saveIdentity.mock.calls[0][1].id).toBe('stable');
  await waitFor(() => expect(screen.getByRole('button', { name: '開始第一輪' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '開始第一輪' }));
  await waitFor(() => expect(saveCloudTournament).toHaveBeenCalledTimes(2));
  const [, state, , revision] = saveCloudTournament.mock.calls[1];
  expect(revision).toBe(1);
  expect(state.rounds[0][0]).toMatchObject({ attackOrder: true });
  expect(state.players.map((p) => p.id)).toEqual(['other', 'stable']);
  expect(JSON.stringify(saveCloudTournament.mock.calls)).not.toMatch(/私人本名|0912345678/);
  expect(await screen.findByRole('heading', { name: '瑞士制配對與比分' })).toBeInTheDocument();
});

test('最終戰可直接新增未參賽選手並填入第二個線上保送席位', async () => {
  saveCloudTournament.mockClear();
  saveIdentity.mockResolvedValueOnce({ id: 'new-online', name: '首次參加' });
  const event = {
    ...createEmptyTournament({ rulesVersion: FINAL }), id: 'BH2627F', revision: 0,
    name: '最終戰', qualificationConfig: { online: ['stable', ''], local: 'audition' }
  };
  render(<SeasonAdmin tournament={event} tournaments={[]} online versions={[]} />);
  fireEvent.click(screen.getByRole('button', { name: '新增選手 · 線上保送二' }));
  const form = within(screen.getByRole('region', { name: '新增資格席位選手' }));
  fireEvent.change(form.getByLabelText('本名'), { target: { value: '新人本名' } });
  fireEvent.change(form.getByLabelText('電話號碼'), { target: { value: '0900000001' } });
  fireEvent.change(form.getByLabelText('打師名'), { target: { value: '首次參加' } });
  fireEvent.click(screen.getByRole('button', { name: '儲存並填入席位' }));
  await waitFor(() => expect(saveCloudTournament).toHaveBeenCalledTimes(1));
  const [, state] = saveCloudTournament.mock.calls[0];
  expect(state.qualificationConfig).toEqual({ online: ['stable', 'new-online'], local: 'audition' });
  expect(JSON.stringify(state)).not.toMatch(/新人本名|0900000001/);
});
