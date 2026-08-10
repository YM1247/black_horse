import { render, screen } from '@testing-library/react';
import FullScreenCloudManager from './FullScreenCloudManager';

test('cloud management occupies the complete browser viewport', () => {
  render(<FullScreenCloudManager><div>賽事列表</div></FullScreenCloudManager>);

  const page = screen.getByTestId('cloud-management-page');
  expect(page).toHaveClass('fixed', 'inset-0');
  expect(page.firstElementChild).toHaveClass('w-full', 'h-full');
  expect(page).toHaveTextContent('賽事列表');
});
