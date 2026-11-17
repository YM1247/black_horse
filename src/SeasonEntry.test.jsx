import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TournamentAdminApp } from './App';
import { QUALIFIER } from './seasonTournament';
import { createCloudTournament, ensureCloudTournament, saveCloudTournament, subscribeAdminTournaments, ensureTournamentSummaries, subscribeCloudSeries, syncPublicSeriesProjection } from './services/tournamentRepository';
import { AKASHIKI, AKASHIKI_EVENT, createEmptyTournament } from './tournamentState';

const stored = vi.hoisted(() => new Map());

vi.mock('./firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('./services/playerDirectory', () => ({
  subscribePlayers: (cb) => {
    cb([]);
    return () => {};
  }
}));
vi.mock('./services/tournamentRepository', async (importOriginal) => {
  const actual = await importOriginal();
  const create = vi.fn(async ({ eventCode, name, tournament }) => {
    stored.set(eventCode, { ...tournament, id: eventCode, name, revision: 0, isPublic: true });
    return eventCode;
  });
  return {
    ...actual,
    ensureCloudSeries: vi.fn(async () => {}),
    ensureTournamentSummaries: vi.fn(async () => {}),
    subscribeAuth: (cb) => {
      cb({ uid: 'admin' });
      return () => {};
    },
    subscribeAdminTournaments: vi.fn((cb) => {
      cb([]);
      return () => {};
    }),
    subscribeCloudSeries: vi.fn((_id, cb) => {
      cb(null);
      return () => {};
    }),
    subscribeTournament: (id, cb) => {
      cb(stored.get(id) || null);
      return () => {};
    },
    subscribeTournamentVersions: () => () => {},
    subscribeTournamentAuditLogs: () => () => {},
    syncPublicSeriesProjection: vi.fn(async () => {}),
    createCloudTournament: create,
    ensureCloudTournament: vi.fn(async (definition) => stored.has(definition.eventCode)
      ? definition.eventCode : create(definition)),
    saveCloudTournament: vi.fn()
  };
});

it('系列卡建立第一站後進入新制報名，離開不會以舊版自動儲存覆寫名單', async () => {
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  fireEvent.click(await screen.findByRole('button', { name: /黑馬記念26-27.*進入管理/ }));
  fireEvent.click(await screen.findByRole('button', { name: '建立 積分賽第一場' }));
  expect(await screen.findByRole('heading', { name: '選手報名' })).toBeInTheDocument();
  expect(createCloudTournament.mock.calls[0][0].tournament).toMatchObject({
    rulesVersion: QUALIFIER,
    judgeCount: 3,
    doubleElimination: true,
    seriesId: 'black-horse-26-27'
  });
  fireEvent.click(screen.getByRole('button', { name: '返回賽事管理' }));
  expect(await screen.findByRole('heading', { name: '黑馬記念26-27' })).toBeInTheDocument();
  expect(saveCloudTournament).not.toHaveBeenCalled();
});

it('首頁優先顯示黑馬記念，展開封存系列後仍可進入模擬賽', async () => {
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  const active = await screen.findByRole('button', { name: /黑馬記念26-27.*進入管理/ });
  expect(screen.queryByRole('button', { name: /模擬賽.*進入管理/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: '顯示已封存系列賽' }));
  const archived = screen.getByRole('button', { name: /模擬賽.*已封存.*進入管理/ });
  expect(active.compareDocumentPosition(archived) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(archived);
  expect(await screen.findByRole('heading', { name: '模擬賽' })).toBeInTheDocument();
});

it('合作賽與系列賽同層，建立單場專屬賽制並可返回首頁再進入', async () => {
  createCloudTournament.mockClear();
  saveCloudTournament.mockClear();
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  const entry = await screen.findByRole('button', { name: /赤式x黑馬記念合作賽.*進入管理/ });
  expect(screen.getByRole('button', { name: /黑馬記念26-27.*進入管理/ }).parentElement).toBe(entry.parentElement);
  fireEvent.click(entry);
  expect(await screen.findByRole('heading', { name: AKASHIKI_EVENT.name })).toBeInTheDocument();
  const created = createCloudTournament.mock.calls[0][0];
  expect(created).toMatchObject({ name: AKASHIKI_EVENT.name, eventCode: 'AKASHIKI', tournament: { rulesVersion: AKASHIKI, judgeCount: 3, doubleElimination: false } });
  expect(created.tournament).not.toHaveProperty('seriesId');
  expect(screen.getByRole('heading', { name: '名單 0／32' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '開始第一輪' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '返回賽事管理' }));
  expect(await screen.findByRole('button', { name: /赤式x黑馬記念合作賽.*進入管理/ })).toBeInTheDocument();
  expect(saveCloudTournament).not.toHaveBeenCalled();
});

it('一般建立表單不能占用合作賽代碼', async () => {
  createCloudTournament.mockClear();
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  fireEvent.change(await screen.findByLabelText('新賽事代碼'), { target: { value: 'AKASHIKI' } });
  fireEvent.click(screen.getByRole('button', { name: '建立並進入', exact: true }));
  expect(await screen.findByText(/AKASHIKI 為合作賽專用代碼/)).toBeInTheDocument();
  expect(createCloudTournament).not.toHaveBeenCalled();
});

it('合作賽摘要存在但主文件被刪除時，入口仍會重建空白賽事', async () => {
  stored.delete('AKASHIKI');
  ensureCloudTournament.mockClear();
  subscribeAdminTournaments.mockImplementationOnce((cb) => {
    cb([{ id: 'AKASHIKI', name: AKASHIKI_EVENT.name, phase: 'finished', playerCount: 32, revision: 183 }]);
    return () => {};
  });
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  fireEvent.click(await screen.findByRole('button', { name: /赤式x黑馬記念合作賽.*進入管理/ }));
  expect(await screen.findByRole('heading', { name: '名單 0／32' })).toBeInTheDocument();
  expect(ensureCloudTournament).toHaveBeenCalledWith(expect.objectContaining({ eventCode: 'AKASHIKI' }));
  expect(screen.queryByText('找不到指定的雲端賽事。')).not.toBeInTheDocument();
});

it('合作賽已存在時，入口保留現有報名資料', async () => {
  createCloudTournament.mockClear();
  stored.set('AKASHIKI', {
    ...createEmptyTournament(AKASHIKI_EVENT), id: 'AKASHIKI', name: AKASHIKI_EVENT.name, revision: 4,
    players: [{ id: 'saved', name: '已報名的選手', wins: 0, votes: 0, losses: 0 }]
  });
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  fireEvent.click(await screen.findByRole('button', { name: /赤式x黑馬記念合作賽.*進入管理/ }));
  expect(await screen.findByRole('heading', { name: '名單 1／32' })).toBeInTheDocument();
  expect(screen.getByText('已報名的選手')).toBeInTheDocument();
  expect(createCloudTournament).not.toHaveBeenCalled();
});


it('摘要檢查尚未完成時，後台仍立即訂閱賽事列表', async () => {
  ensureTournamentSummaries.mockReturnValueOnce(new Promise(() => {}));
  subscribeAdminTournaments.mockClear();
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  expect(subscribeAdminTournaments).toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: /黑馬記念26-27.*進入管理/ })).toBeInTheDocument();
});

it('登入收到系列與快取摘要時不發布空清單，伺服器摘要到齊後才發布', async () => {
  subscribeCloudSeries.mockClear();
  subscribeAdminTournaments.mockClear();
  syncPublicSeriesProjection.mockClear();
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  const [, seriesUpdate] = subscribeCloudSeries.mock.calls.findLast(([id]) => id === 'black-horse-26-27');
  const [summariesUpdate] = subscribeAdminTournaments.mock.calls.at(-1);
  await act(async () => {
    seriesUpdate({ id: 'black-horse-26-27', publicCode: 'BH2627', events: [
      { name: '第一站', eventCode: 'BH2627S1', rulesVersion: QUALIFIER }
    ] }, true);
    summariesUpdate([], false);
  });
  expect(syncPublicSeriesProjection).not.toHaveBeenCalled();
  act(() => summariesUpdate([{ id: 'BH2627S1', seriesId: 'black-horse-26-27', isPublic: true }], true));
  await waitFor(() => expect(syncPublicSeriesProjection).toHaveBeenCalledWith(
    expect.objectContaining({ publicCode: 'BH2627' }), [expect.objectContaining({ id: 'BH2627S1' })]));
});

it('管理網址重新整理後直接載入原本的場次', async () => {
  stored.set('AKASHIKI', { ...createEmptyTournament(AKASHIKI_EVENT), id: 'AKASHIKI', name: '恢復管理測試', revision: 1 });
  window.history.replaceState({}, '', '/?admin=1&manage=AKASHIKI');
  try {
    render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
    expect(await screen.findByRole('heading', { name: '恢復管理測試' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回賽事管理' }));
    await waitFor(() => expect(location.search).toBe('?admin=1'));
  } finally { window.history.replaceState({}, '', '/'); }
});

it.each(['BH2627S3', 'BH2627F'])('獨立賽不能使用預留場次 %s', async code => {
  createCloudTournament.mockClear();
  render(<TournamentAdminApp authenticatedUser={{ uid: 'admin' }} />);
  fireEvent.change(await screen.findByLabelText('新賽事代碼'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: '建立並進入', exact: true }));
  expect(await screen.findByText(/此代碼已保留給系列場次/)).toBeInTheDocument();
  expect(createCloudTournament).not.toHaveBeenCalled();
});
