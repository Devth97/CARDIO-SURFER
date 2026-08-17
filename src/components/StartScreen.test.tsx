import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StartScreen from './StartScreen';

describe('StartScreen', () => {
  it('calls onStart when PLAY is clicked', () => {
    const onStart = vi.fn();
    render(
      <StartScreen
        onStart={onStart}
        onViewLeaderboard={() => {}}
        onSignOut={() => {}}
        user={null}
        error={null}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByText(/enable camera & play/i));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('calls onViewLeaderboard when the leaderboard button is clicked', () => {
    const onViewLeaderboard = vi.fn();
    render(
      <StartScreen
        onStart={() => {}}
        onViewLeaderboard={onViewLeaderboard}
        onSignOut={() => {}}
        user={null}
        error={null}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByTitle('Leaderboard'));
    expect(onViewLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('does not show a player badge when signed out', () => {
    render(
      <StartScreen
        onStart={() => {}}
        onViewLeaderboard={() => {}}
        onSignOut={() => {}}
        user={null}
        error={null}
        loading={false}
      />,
    );

    expect(screen.queryByTitle('Sign out')).not.toBeInTheDocument();
  });

  it('shows the player badge and calls onSignOut when signed in', () => {
    const onSignOut = vi.fn();
    render(
      <StartScreen
        onStart={() => {}}
        onViewLeaderboard={() => {}}
        onSignOut={onSignOut}
        user={{ displayName: 'Ada', photoURL: null }}
        error={null}
        loading={false}
      />,
    );

    expect(screen.getByText('Ada')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Sign out'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
