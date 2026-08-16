// Core game types. The runner is strictly 3 lanes — never change LANE_COUNT
// without also reworking the perspective/rendering math in renderer.ts.

export type Lane = 0 | 1 | 2;

export type PlayerState = 'running' | 'jumping' | 'ducking';

/**
 * low  -> ground-level obstacle, cleared by JUMPing over it
 * high -> overhead obstacle, cleared by DUCKing under it
 * full -> spans the whole lane height, only cleared by not being in that lane
 */
export type ObstacleType = 'low' | 'high' | 'full';

export interface Obstacle {
  id: number;
  lane: Lane;
  type: ObstacleType;
  /** 0 = just spawned at the horizon, 1 = at the player's position */
  z: number;
  resolved: boolean; // true once scored as passed or already caused game over
}

export interface Coin {
  id: number;
  lane: Lane;
  z: number;
  collected: boolean;
}

export type PowerUpType = 'magnet' | 'shield' | 'star';

export interface PowerUpItem {
  id: number;
  lane: Lane;
  z: number;
  type: PowerUpType;
  collected: boolean;
}

export interface ActivePowerUps {
  magnet: boolean;
  shield: boolean;
  star: boolean;
  magnetTimeLeft: number;
  starTimeLeft: number;
}

export type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover';

export interface GameStats {
  score: number;
  highScore: number;
  distanceM: number;
  coins: number;
  jumps: number;
  ducks: number;
  laneChanges: number;
  elapsedMs: number;
  caloriesBurnt: number; // Fitness calorie burn calculation
  activePowerUps: ActivePowerUps;
}

export type GameAction =
  | 'JUMP'
  | 'DUCK_START'
  | 'DUCK_END'
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'TOGGLE_PAUSE';

export interface GameSnapshot {
  status: GameStatus;
  stats: GameStats;
}
