import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import QRCode from 'qrcode';
import EventPublicQr from './EventPublicQr';
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }));
beforeEach(() => {
  QRCode.toDataURL.mockReset().mockResolvedValue('data:image/png;base64,test');
  window.history.replaceState({}, '', '/black_horse/?admin=1&manage=OTHER&token=private#scores');
});
afterEach(() => window.history.replaceState({}, '', '/'));
function expand() {
  const details = screen.getByText('公開連結與 QR Code').closest('details');
  details.open = true;
  fireEvent(details, new Event('toggle'));
}
test('展開才產生單場 QR，連結不帶管理參數，提供 PNG 下載與未公開提醒', async () => {
  render(<EventPublicQr eventCode="BH2627R1" name="第一站" isPublic={false} />);
  expect(QRCode.toDataURL).not.toHaveBeenCalled();
  expand();
  expect(await screen.findByAltText('第一站公開連結 QR Code')).toBeInTheDocument();
  const url = `${window.location.origin}/black_horse/?event=BH2627R1`;
  expect(QRCode.toDataURL).toHaveBeenCalledWith(url, expect.objectContaining({ width: 1024, margin: 4, type: 'image/png' }));
  expect(screen.getByRole('link', { name: url })).toHaveAttribute('href', url);
  expect(screen.getByRole('link', { name: '下載 QR Code（PNG）' })).toHaveAttribute('download', 'BH2627R1-qrcode.png');
  expect(screen.getByText(/本場尚未公開/)).toBeInTheDocument();
});
test('產生失敗可重試，切換場次不留下舊圖片', async () => {
  QRCode.toDataURL.mockRejectedValueOnce(new Error('failed'));
  const view = render(<EventPublicQr eventCode="ONE" name="第一站" isPublic />);
  expand();
  fireEvent.click(await screen.findByRole('button', { name: '重新產生' }));
  expect(await screen.findByAltText('第一站公開連結 QR Code')).toBeInTheDocument();
  QRCode.toDataURL.mockResolvedValueOnce('data:image/png;base64,second');
  view.rerender(<EventPublicQr eventCode="TWO" name="第二站" isPublic />);
  await waitFor(() => expect(screen.getByAltText('第二站公開連結 QR Code')).toHaveAttribute('src', 'data:image/png;base64,second'));
  expect(screen.getByRole('link', { name: '下載 QR Code（PNG）' })).toHaveAttribute('download', 'TWO-qrcode.png');
});
