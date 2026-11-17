import { vi } from 'vitest';
import { saveIdentity, subscribePlayers } from './playerDirectory';
import { getDocs, runTransaction } from 'firebase/firestore/lite';

vi.mock('../firebase', () => ({ getFirebaseServices: () => ({ app: {} }) }));
vi.mock('firebase/firestore/lite', () => ({
  collection: (_db, name) => name, doc: (_db, name, id) => ({ name, id }),
  getFirestore: () => ({}), connectFirestoreEmulator: vi.fn(), getDocs: vi.fn(),
  runTransaction: vi.fn()
}));
const row = { realName: '新本名', phone: '0912345678', name: '新打師名' };

test('儲存選手以記憶體更新訂閱，初次查詢晚到也不覆蓋剛儲存的資料', async () => {
  let completeRead;
  getDocs.mockReturnValueOnce(new Promise(resolve => { completeRead = resolve; }));
  runTransaction.mockImplementationOnce((_db, operation) => operation({
    get: async () => ({ data: () => undefined }), set: vi.fn(), delete: vi.fn()
  }));
  const callback = vi.fn();
  const unsubscribe = subscribePlayers(callback, vi.fn());
  window.dispatchEvent(new Event('focus'));
  const player = await saveIdentity(row);
  expect(getDocs).toHaveBeenCalledTimes(1);
  expect(player).toEqual({ id: expect.any(String), name: row.name });
  expect(player).not.toHaveProperty('phone');
  expect(callback).toHaveBeenLastCalledWith([{ ...row, id: player.id }]);
  completeRead({ docs: [{ id: 'old', data: () => ({ id: 'old', name: '舊選手' }) }] });
  await vi.waitFor(() => expect(callback).toHaveBeenLastCalledWith([
    { id: 'old', name: '舊選手' }, { ...row, id: player.id }
  ]));
  unsubscribe();
  window.dispatchEvent(new Event('focus'));
  expect(getDocs).toHaveBeenCalledTimes(1);
});
