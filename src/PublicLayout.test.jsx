import { fireEvent, render, screen } from '@testing-library/react';
import { PublicBrand, PublicBottomNav } from './PublicLayout';

test('底部導覽只有純文字，依可用內容顯示目的地', () => {
  const { rerender } = render(<PublicBottomNav seriesCode="BH2627" />);
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  rerender(<PublicBottomNav hasSchedule hasRanking seriesCode="BH2627" />);
  const nav = screen.getByRole('navigation', { name: '公開頁面導覽' });
  expect(nav.querySelector('svg')).toBeNull();
  expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['賽況', '排名', '系列']);
  rerender(<PublicBottomNav hasSchedule hasRanking />);
  expect(screen.queryByRole('link', { name: '系列' })).not.toBeInTheDocument();
  rerender(<PublicBottomNav series hasEvents />);
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  rerender(<PublicBottomNav series hasEvents hasRanking />);
  expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['場次', '排名']);
});

test('底部選單的目前位置隨頁內目的地更新', () => {
  window.history.replaceState({}, '', '/?event=TEST12');
  render(<PublicBottomNav hasSchedule hasRanking />);
  expect(screen.getByRole('link', { name: '賽況' })).toHaveAttribute('aria-current', 'location');
  window.history.replaceState({}, '', '/?event=TEST12#event-ranking');
  fireEvent(window, new HashChangeEvent('hashchange'));
  expect(screen.getByRole('link', { name: '排名' })).toHaveAttribute('aria-current', 'location');
  expect(screen.getByRole('link', { name: '賽況' })).not.toHaveAttribute('aria-current');
  window.history.replaceState({}, '', '/');
});


test('公開 Logo 僅展示品牌，不提供首頁連結或鍵盤互動', () => {
  render(<PublicBrand title="公開賽事" backHref="/?series=BH2627" />);
  const logo = screen.getByRole('img', { name: '黑馬記念' });
  expect(logo.closest('a, button, [tabindex]')).toBeNull();
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link', { name: '返回系列賽' })).toHaveAttribute('href', '/?series=BH2627');
});
