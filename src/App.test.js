import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { TournamentAdminApp } from './App';

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
    render(<TournamentAdminApp />);

    expect(screen.queryByText(/代表所屬|CREW|SCHOOL/)).not.toBeInTheDocument();
    addPlayer('Alice');

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('參賽陣容 (1)')).toBeInTheDocument();
  });

  test('a three-judge tournament offers only valid three-vote scores', () => {
    render(<TournamentAdminApp />);

    fireEvent.click(screen.getByRole('button', { name: '3 位評審' }));
    addPlayer('Alice');
    addPlayer('Bob');
    fireEvent.click(screen.getByRole('button', { name: '開始抽籤' }));

    expect(screen.getByText('3 位評審制・不淘汰')).toBeInTheDocument();
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

    render(<TournamentAdminApp />);

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

  test('the default URL is the read-only public tournament frontend', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '公開賽事查詢' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('輸入名字...')).not.toBeInTheDocument();
  });

  test('the admin URL requires a token before rendering management controls', async () => {
    window.history.replaceState({}, '', '/?admin=1');
    render(<App />);

    expect(await screen.findByRole('heading', { name: '賽事管理後台' })).toBeInTheDocument();
    expect(screen.getByLabelText('管理 token')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('輸入名字...')).not.toBeInTheDocument();
  });

  test('registration can enable double elimination', () => {
    render(<TournamentAdminApp />);

    fireEvent.click(screen.getByRole('button', { name: '兩敗淘汰' }));
    expect(screen.getByRole('button', { name: '兩敗淘汰' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('選手累積第 2 敗後會自動淘汰，不參與後續輪次。')).toBeInTheDocument();
  });
});
