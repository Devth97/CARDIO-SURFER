import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GameOverScreen from './GameOverScreen';
import type { GameStats } from '../game/types';

// highScore is deliberately higher than score so isNewHigh stays false —
// the confetti celebration path is pre-existing behavior out of scope for
// this task, and canvas-confetti needs a 2D canvas context jsdom doesn't
// provide by default.
const baseStats: GameStats = {
  score: 500,
  highScore: 900,
  distanceM: 120,
  coins: 10,
  jumps: 5,
  ducks: 3,
  laneChanges: 8,
  elapsedMs: 60000,
  caloriesBurnt: 25,
  activePowerUps: { magnet: false, shield: false, star: false, magnetTimeLeft: 0, starTimeLeft: 0 },
};

describe('GameOverScreen', () => {
  it('shows a rank placeholder when rank is not yet known', () => {
    render(
      <GameOverScreen
        stats={baseStats}
        reason={null}
        rank={null}
        onRestart={() => {}}
        onViewLeaderboard={() => {}}
      />,
    );

    expect(screen.getByText('Weekly Rank —')).toBeInTheDocument();
  });

  it('shows the resolved rank once known', () => {
    render(
      <GameOverScreen
        stats={baseStats}
        reason={null}
        rank={7}
        onRestart={() => {}}
        onViewLeaderboard={() => {}}
      />,
    );

    expect(screen.getByText('#7')).toBeInTheDocument();
  });

  it('calls onViewLeaderboard when the leaderboard link is clicked', () => {
    const onViewLeaderboard = vi.fn();
    render(
      <GameOverScreen
        stats={baseStats}
        reason={null}
        rank={null}
        onRestart={() => {}}
        onViewLeaderboard={onViewLeaderboard}
      />,
    );

    fireEvent.click(screen.getByText(/view leaderboard/i));
    expect(onViewLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('calls onRestart when PLAY AGAIN is clicked', () => {
    const onRestart = vi.fn();
    render(
      <GameOverScreen
        stats={baseStats}
        reason={null}
        rank={null}
        onRestart={onRestart}
        onViewLeaderboard={() => {}}
      />,
    );

    fireEvent.click(screen.getByText(/play again/i));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
