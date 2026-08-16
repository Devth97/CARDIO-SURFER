// Tunable game constants. Kept in one place so difficulty/feel can be
// adjusted without touching engine logic.

export const LANE_COUNT = 3;

// Speed is expressed in "z-units per second" — an obstacle's z goes 0 -> 1
// as it travels from the horizon to the player.
export const BASE_SPEED = 0.34;
export const MAX_SPEED = 1.05;
export const SPEED_RAMP_PER_SEC = 0.006;

export const JUMP_DURATION_MS = 450; // Faster responsive jump duration for consecutive jumps
export const DUCK_MIN_HOLD_MS = 180;
export const LANE_CHANGE_MS = 140; // Crisp, fast 140ms lane transition

// z at which an obstacle is considered "at" the player for collision purposes.
export const COLLISION_Z = 0.94;
// z past which an obstacle/coin is removed from the world.
export const DESPAWN_Z = 1.08;

export const SPAWN_INTERVAL_BASE_MS = 1200;
export const SPAWN_INTERVAL_MIN_MS = 680;

export const SCORE_PER_METER = 1;
export const SCORE_PER_COIN = 25;
export const METERS_PER_SPEED_UNIT_PER_SEC = 12;
