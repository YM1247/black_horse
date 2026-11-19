import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import TournamentBackupTools from './TournamentBackupTools';
import { readTournamentBackup } from './tournamentBackup';
import { saveTournamentVersion } from './services/tournamentRepository';
import { AKASHIKI, createEmptyTournament } from './tournamentState';

vi.mock('./services/tournamentRepository', () => ({ saveTournamentVersion: vi.fn(async () => ({})) }));

test('離線下載的 JSON 能預覽，同場連線並輸入代碼後才能送出還原', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const createURL = vi.fn(() => 'blob:test');
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createURL;
    static revokeObjectURL() {}
  });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    const event = { ...createEmptyTournament({ rulesVersion: AKASHIKI }), id: 'AKASHIKI', revision: 4 };
    const props = { event, offline: true, onBusy: vi.fn() };
    const { rerender } = render(<TournamentBackupTools {...props} />);
    fireEvent.click(screen.getByText('賽事資料工具'));
    fireEvent.click(screen.getByText('下載目前賽事 JSON'));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const text = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(createURL.mock.calls[0][0]);
    });
    const backup = await readTournamentBackup(text, event);
    expect(backup.state).toEqual(expect.objectContaining({ rulesVersion: AKASHIKI, bracket: {} }));
    fireEvent.click(screen.getByText('從備份還原'));
    const upload = screen.getByLabelText(/選擇本場/);
    expect(upload).toBeDisabled();
    rerender(<TournamentBackupTools {...props} offline={false} />);
    fireEvent.change(upload, { target: { files: [{ text: async () => text }] } });
    const submit = await screen.findByText('確認還原本場賽事');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/輸入 AKASHIKI/), { target: { value: event.id } });
    expect(submit).toBeEnabled();
    rerender(<TournamentBackupTools {...props} event={{ ...event, revision: 5 }} offline={false} />);
    expect(submit).toBeDisabled();
    fireEvent.change(upload, { target: { files: [{ text: async () => text }] } });
    await screen.findByText('確認還原本場賽事');
    fireEvent.change(screen.getByLabelText(/輸入 AKASHIKI/), { target: { value: event.id } });
    fireEvent.click(screen.getByText('確認還原本場賽事'));
    expect(await screen.findByText('已還原賽事資料。')).toBeInTheDocument();
    expect(saveTournamentVersion).toHaveBeenCalledWith(event.id, backup.state,
      expect.objectContaining({ expectedRevision: 5, type: 'json-restore' }));
  } finally { click.mockRestore(); vi.unstubAllGlobals(); }
});
