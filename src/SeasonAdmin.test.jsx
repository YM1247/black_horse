import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import SeasonAdmin from './SeasonAdmin';
import { AKASHIKI, createEmptyTournament } from './tournamentState';
import { FINAL, QUALIFIER, publicPlayer, nextSwissRound, scoreSwiss } from './seasonTournament';
import { saveCloudTournament } from './services/tournamentRepository';
import { seedPlayoff, playoffSelection } from './finalTournament';
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
  expect(await screen.findByRole('heading', { name: '瑞士制樹狀圖與記分' })).toBeInTheDocument();
  const bout = screen.getByRole('group', { name: '第 1 輪 第 1 場' });
  expect(within(bout).getAllByRole('button')).toHaveLength(4);
  const nextRound = screen.getByRole('button', { name: '產生第 2 輪' });
  expect(nextRound.closest('section')).toBeNull();
  expect(nextRound.compareDocumentPosition(screen.getByText('選手棄賽')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(nextRound).toBeDisabled();
  fireEvent.click(within(bout).getByRole('button', { name: '3 : 0' }));
  await waitFor(() => expect(saveCloudTournament).toHaveBeenCalledTimes(3));
  expect(saveCloudTournament.mock.calls[2][1].rounds[0][0].p1Votes).toBe(3);
  await waitFor(() => expect(nextRound).toBeEnabled());

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

const cooperativeEvent = (phase = 'playing') => ({
  ...createEmptyTournament({ rulesVersion: AKASHIKI }),
  id: 'AKASHIKI', name: '赤式x黑馬記念合作賽', revision: 12,
  isPublic: true, phase, runNumber: 3,
  resultLocked: phase === 'finished', currentVersion: phase === 'finished' ? 2 : 0,
  players: [{ id: 'a', name: '合作選手', wins: 0, votes: 0, losses: 0 }],
  rounds: phase === 'registration' ? [] : [[]],
  qualifiedIds: ['a'], playoffSeeds: [{ id: 'a', name: '合作選手' }], playoffDecisions: { tie: ['a'] }
});

test.each(['registration', 'playing', 'finished'])('%s 的合作賽需確認代碼才清除，保留賽制並回到報名', async (phase) => {
  saveCloudTournament.mockClear();
  const event = cooperativeEvent(phase);
  render(<SeasonAdmin tournament={event} tournaments={[]} online versions={[]} />);
  fireEvent.click(screen.getByRole('button', { name: '清除賽事內容' }));
  const confirmation = within(screen.getByRole('region', { name: '確認清除賽事內容' }));
  expect(confirmation.getByRole('button', { name: '確認清除內容' })).toBeDisabled();
  expect(saveCloudTournament).not.toHaveBeenCalled();
  fireEvent.change(confirmation.getByRole('textbox'), { target: { value: 'akashiki' } });
  fireEvent.click(confirmation.getByRole('button', { name: '確認清除內容' }));
  await waitFor(() => expect(saveCloudTournament).toHaveBeenCalledTimes(1));
  const [code, state, audit, revision] = saveCloudTournament.mock.calls[0];
  expect(code).toBe('AKASHIKI');
  expect(revision).toBe(12);
  expect(state).toMatchObject({
    phase: 'registration', rulesVersion: AKASHIKI, judgeCount: 3, doubleElimination: false,
    players: [], rounds: [], bracket: {}, qualifiedIds: [], playoffSeeds: [], playoffDecisions: {},
    qualificationConfig: {}, qualificationSources: {}, runNumber: 4, resultLocked: false, currentVersion: 0
  });
  expect(state.runId).not.toBe(event.runId);
  expect(state).not.toHaveProperty('isPublic');
  expect(audit).toMatchObject({ action: 'TOURNAMENT_CLEARED', details: { removedPlayers: 1, removedRounds: event.rounds.length } });
  expect(await screen.findByRole('heading', { name: '名單 0／32' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: event.name })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('已清除選手與賽程');
});

test('取消、離線與確認後版本衝突不會清除賽事', async () => {
  saveCloudTournament.mockClear();
  const event = cooperativeEvent();
  const view = render(<SeasonAdmin tournament={event} tournaments={[]} online versions={[]} />);
  fireEvent.click(screen.getByRole('button', { name: '清除賽事內容' }));
  fireEvent.click(within(screen.getByRole('region', { name: '確認清除賽事內容' })).getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('region', { name: '確認清除賽事內容' })).not.toBeInTheDocument();
  expect(saveCloudTournament).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '清除賽事內容' }));
  view.rerender(<SeasonAdmin tournament={{ ...event, revision: 13 }} tournaments={[]} online versions={[]} />);
  const confirmation = within(screen.getByRole('region', { name: '確認清除賽事內容' }));
  fireEvent.change(confirmation.getByRole('textbox'), { target: { value: 'AKASHIKI' } });
  fireEvent.click(confirmation.getByRole('button', { name: '確認清除內容' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('賽事已有更新');
  expect(saveCloudTournament).not.toHaveBeenCalled();
  view.rerender(<SeasonAdmin tournament={event} tournaments={[]} online={false} versions={[]} />);
  expect(screen.getByRole('button', { name: '確認清除內容' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '清除賽事內容' })).toBeDisabled();
});

test('雲端清除失敗時保留名單與確認內容供重試', async () => {
  saveCloudTournament.mockClear();
  saveCloudTournament.mockRejectedValueOnce(new Error('同步失敗，請稍後重試。'));
  render(<SeasonAdmin tournament={cooperativeEvent('registration')} tournaments={[]} online versions={[]} />);
  fireEvent.click(screen.getByRole('button', { name: '清除賽事內容' }));
  const confirmation = within(screen.getByRole('region', { name: '確認清除賽事內容' }));
  fireEvent.change(confirmation.getByRole('textbox'), { target: { value: 'AKASHIKI' } });
  fireEvent.click(confirmation.getByRole('button', { name: '確認清除內容' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('同步失敗');
  expect(screen.getByRole('heading', { name: '名單 1／32' })).toBeInTheDocument();
  expect(confirmation.getByRole('textbox')).toHaveValue('AKASHIKI');
  fireEvent.click(confirmation.getByRole('button', { name: '確認清除內容' }));
  expect(await screen.findByRole('heading', { name: '名單 0／32' })).toBeInTheDocument();
});

test('CSV 跳過已報名及同一批重複身分，其他有效列照常加入', async () => {
  saveCloudTournament.mockClear();
  const event = { ...createEmptyTournament({ rulesVersion: QUALIFIER }), id: 'DUPTEST', revision: 0,
    players: [{ id: 'old', name: '已有', wins: 0, votes: 0 }] };
  saveIdentity.mockImplementationOnce(async () => ({ id: 'old', name: '已有' }))
    .mockImplementationOnce(async () => ({ id: 'new', name: '新手' }))
    .mockImplementationOnce(async () => ({ id: 'new', name: '新手' }));
  render(<SeasonAdmin tournament={event} tournaments={[]} online versions={[]} />);
  fireEvent.change(screen.getByLabelText(/匯入 CSV/), { target: { files: [{
    text: async () => '本名,電話號碼,打師名\n舊甲,0911111111,已有\n新乙,0922222222,新手\n新乙,0922222222,新手'
  }] } });
  expect(await screen.findByText(/已跳過 2 筆重複報名：第 2 列 已有、第 4 列 新手/)).toBeInTheDocument();
  expect(screen.getByText('已加入本場 1 位')).toBeInTheDocument();
  expect(saveCloudTournament.mock.calls[0][1].players.map(player => player.id)).toEqual(['old', 'new']);
});

test('合作賽未滿 32 人可以開賽', async () => {
  saveCloudTournament.mockClear();
  const event = { ...createEmptyTournament({ rulesVersion: AKASHIKI }), id: 'AKASHIKI', revision: 0,
    players: ['a', 'b', 'c'].map(id => publicPlayer({ id, name: id })) };
  render(<SeasonAdmin tournament={event} tournaments={[]} online versions={[]} />);
  fireEvent.click(screen.getByRole('button', { name: '開始第一輪' }));
  await waitFor(() => expect(saveCloudTournament).toHaveBeenCalledTimes(1));
  expect(saveCloudTournament.mock.calls[0][1].rounds[0]).toHaveLength(2);
});

test('淘汰賽棄賽需確認後保存全票判負，瑞士比分更正不改已抽出籤表', async () => {
  saveCloudTournament.mockClear();
  let event = { ...createEmptyTournament({ rulesVersion: AKASHIKI }), id: 'AKASHIKI', revision: 0,
    players: Array.from({ length: 20 }, (_, i) => publicPlayer({ id: String(i), name: '選手' + i })) };
  for (let r = 0; r < 3; r++) {
    event = nextSwissRound(event);
    for (const match of event.rounds[r]) event = scoreSwiss(event, r, match.id, 3);
  }
  const decisions = Object.fromEntries(playoffSelection(event).ties.map(({ key, group }) => [key, group.map(p => p.id)]));
  event = seedPlayoff(event, decisions);
  render(<SeasonAdmin tournament={event} tournaments={[]} online versions={[]} />);
  fireEvent.click(screen.getByRole('button', { name: event.bracket.r1.p1.name + ' 本場棄賽' }));
  const review = within(screen.getByRole('region', { name: '確認更正' }));
  expect(saveCloudTournament).not.toHaveBeenCalled();
  fireEvent.change(review.getByLabelText('原因'), { target: { value: '現場選手通知棄賽' } });
  fireEvent.click(review.getByRole('button', { name: '確認變更' }));
  await waitFor(() => expect(saveCloudTournament).toHaveBeenCalledTimes(1));
  const saved = saveCloudTournament.mock.calls[0][1];
  expect(saved.bracket.r1).toMatchObject({ p1Votes: 0, p2Votes: 3, isDone: true });
  const swiss = within(screen.getByRole('group', { name: '第 1 輪 第 1 場' }));
  fireEvent.click(swiss.getByRole('button', { name: '0 : 3' }));
  const correction = within(screen.getByRole('region', { name: '確認更正' }));
  fireEvent.change(correction.getByLabelText('原因'), { target: { value: '更正誤植' } });
  fireEvent.click(correction.getByRole('button', { name: '確認變更' }));
  await waitFor(() => expect(saveCloudTournament).toHaveBeenCalledTimes(2));
  expect(saveCloudTournament.mock.calls[1][1].bracket).toEqual(saved.bracket);
  expect(saveCloudTournament.mock.calls[1][1].playoffSeeds).toEqual(saved.playoffSeeds);
});


test('赤式只填打師名，CSV 只讀打師名並跳過既有與同批重複，不寫私人名錄', async () => {
  saveCloudTournament.mockClear();
  saveIdentity.mockClear();
  const event = { ...createEmptyTournament({ rulesVersion: AKASHIKI }), id: 'AKASHIKI', revision: 0, players: [] };
  render(<SeasonAdmin tournament={event} tournaments={[]} online versions={[]} />);
  expect(screen.queryByLabelText('本名')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('電話號碼')).not.toBeInTheDocument();
  for (const name of ['甲', '乙']) {
    fireEvent.change(screen.getByLabelText('打師名'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: '登錄選手' }));
    await waitFor(() => expect(screen.getByLabelText('打師名')).toHaveValue(''));
  }
  fireEvent.change(screen.getByLabelText('匯入 CSV（打師名）'), { target: { files: [{
    text: async () => '打師名\n甲\n丙\n丙'
  }] } });
  expect(await screen.findByText(/已跳過 2 筆重複報名/)).toBeInTheDocument();
  const saved = saveCloudTournament.mock.calls.at(-1)[1].players;
  expect(saved.map(p => p.name)).toEqual(['甲', '乙', '丙']);
  expect(new Set(saved.map(p => p.id)).size).toBe(3);
  expect(saved.every(p => !('realName' in p) && !('phone' in p))).toBe(true);
  expect(saveIdentity).not.toHaveBeenCalled();
});
