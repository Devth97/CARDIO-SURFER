import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { User } from 'firebase/auth';
import LeaderboardScreen from './LeaderboardScreen';
import { getLeaderboard } from '../api/client';

vi.mock('../api/client', () => ({
  getLeaderboard: vi.fn(),
}));

const mockedGetLeaderboard = vi.mocked(getLeaderboard);

describe('LeaderboardScreen', () => {
  beforeEach(() => {
    mockedGetLeaderboard.mockReset();
  });

  it('loads and renders weekly entries by default, highlighting the current user', async () => {
    mockedGetLeaderboard.mockResolvedValue({
      scope: 'weekly',
      entries: [
        { uid: 'uid-1', displayName: 'Ada', avatarUrl: null, score: 900 },
        { uid: 'uid-2', displayName: 'Grace', avatarUrl: null, score: 500 },
      ],
    });
    const currentUser = { uid: 'uid-2' } as User;

    render(<LeaderboardScreen currentUser={currentUser} onBack={() => {}} />);

    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
    expect(getLeaderboard).toHaveBeenCalledWith('weekly');
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('switches to all-time scope on tab click', async () => {
    mockedGetLeaderboard.mockResolvedValue({ scope: 'weekly', entries: [] });
    render(<LeaderboardScreen currentUser={null} onBack={() => {}} />);
    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('weekly'));

    mockedGetLeaderboard.mockResolvedValue({ scope: 'alltime', entries: [] });
    fireEvent.click(screen.getByText('ALL-TIME'));

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('alltime'));
  });

  it('shows a retry button on fetch failure and retries on click', async () => {
    mockedGetLeaderboard.mockRejectedValueOnce(new Error('network error'));
    render(<LeaderboardScreen currentUser={null} onBack={() => {}} />);

    await waitFor(() => expect(screen.getByText(/couldn't load leaderboard/i)).toBeInTheDocument());

    mockedGetLeaderboard.mockResolvedValueOnce({ scope: 'weekly', entries: [] });
    fireEvent.click(screen.getByText(/retry/i));

    await waitFor(() => expect(screen.getByText(/no runs yet/i)).toBeInTheDocument());
  });

  it('calls onBack when the back button is clicked', () => {
    mockedGetLeaderboard.mockResolvedValue({ scope: 'weekly', entries: [] });
    const onBack = vi.fn();
    render(<LeaderboardScreen currentUser={null} onBack={onBack} />);

    fireEvent.click(screen.getByTitle('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
