import { fireEvent, render, screen } from '@testing-library/react';
import SeriesAdminDashboard from './SeriesAdminDashboard';
import { SIMULATION_SERIES } from './series';

test('series dashboard shows separate event controls and cumulative standings', () => {
  const onOpenEvent = jest.fn();
  const onCreateEvent = jest.fn();
  const tournaments = [{
    id: 'MOCK819',
    phase: 'finished',
    players: [{ name: 'Alice' }],
    isPublic: true
  }];
  const standings = [{
    name: 'Alice',
    displayRank: 1,
    eventPoints: { MOCK819: 100, MOCK821: 0, MOCK826: 0 },
    participatedEvents: 1,
    totalPoints: 100
  }];

  render(<SeriesAdminDashboard
    series={SIMULATION_SERIES}
    tournaments={tournaments}
    standings={standings}
    onBack={jest.fn()}
    onOpenEvent={onOpenEvent}
    onCreateEvent={onCreateEvent}
  />);

  expect(screen.getByRole('heading', { name: '模擬賽' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '管理 8/19' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '建立 8/21' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '建立 8/26' })).toBeInTheDocument();
  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.getAllByText('100')).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: '管理 8/19' }));
  expect(onOpenEvent).toHaveBeenCalledWith(SIMULATION_SERIES, SIMULATION_SERIES.events[0], tournaments[0]);
  fireEvent.click(screen.getByRole('button', { name: '建立 8/21' }));
  expect(onCreateEvent).toHaveBeenCalledWith(SIMULATION_SERIES, SIMULATION_SERIES.events[1]);
});
