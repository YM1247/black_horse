import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const addPlayer = (name) => {
  fireEvent.change(screen.getByPlaceholderText('輸入名字...'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /加入名單/ }));
};

describe('Swiss tournament Phase 1', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  test('players are registered by name without a school field', () => {
    render(<App />);

    expect(screen.queryByText(/代表所屬|CREW|SCHOOL/)).not.toBeInTheDocument();
    addPlayer('Alice');

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('參賽陣容 (1)')).toBeInTheDocument();
  });

  test('a three-judge tournament offers only valid three-vote scores', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '3 位評審' }));
    addPlayer('Alice');
    addPlayer('Bob');
    fireEvent.click(screen.getByRole('button', { name: '開始抽籤' }));

    expect(screen.getByText('3 位評審制')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3:0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2:1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1:2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0:3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '5:0' })).not.toBeInTheDocument();
  });

  test('legacy local data is migrated without losing the tournament', async () => {
    localStorage.setItem('swiss_tournament_players', JSON.stringify([
      { id: 'legacy-player', name: 'Legacy Player', school: 'Legacy School', wins: 1, votes: 5, isWithdrawn: false }
    ]));

    render(<App />);

    expect(screen.getByText('Legacy Player')).toBeInTheDocument();
    expect(screen.queryByText('Legacy School')).not.toBeInTheDocument();
    await waitFor(() => {
      const storedPlayers = JSON.parse(localStorage.getItem('swiss_tournament_players'));
      expect(storedPlayers[0]).not.toHaveProperty('school');
      expect(storedPlayers[0]).toMatchObject({ name: 'Legacy Player', wins: 1, votes: 5 });
    });
  });

  test('an event query opens the public tournament page', () => {
    window.history.replaceState({}, '', '/?event=AB12');
    render(<App />);

    expect(screen.getByRole('heading', { name: '公開賽事查詢' })).toBeInTheDocument();
    expect(screen.getByText(/尚未設定 Firebase/)).toBeInTheDocument();
  });
});
