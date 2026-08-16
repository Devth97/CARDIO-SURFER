import {
  BASE_SPEED,
  COLLISION_Z,
  DESPAWN_Z,
  DUCK_MIN_HOLD_MS,
  JUMP_DURATION_MS,
  LANE_CHANGE_MS,
  LANE_COUNT,
  MAX_SPEED,
  METERS_PER_SPEED_UNIT_PER_SEC,
  SCORE_PER_COIN,
  SCORE_PER_METER,
  SPAWN_INTERVAL_BASE_MS,
  SPAWN_INTERVAL_MIN_MS,
  SPEED_RAMP_PER_SEC,
} from './constants';
import { soundManager } from './SoundManager';
import type {
  ActivePowerUps,
  Coin,
  GameAction,
  GameSnapshot,
  GameStats,
  GameStatus,
  Lane,
  Obstacle,
  ObstacleType,
  PlayerState,
  PowerUpItem,
  PowerUpType,
} from './types';

let idCounter = 1;
const nextId = () => idCounter++;
const HIGH_SCORE_KEY = 'cardio_surfer_high_score';

export interface ParticleEffect {
  x: number;
  y: number;
  color: string;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface PlayerRenderState {
  lane: Lane;
  displayLane: number;
  state: PlayerState;
  jumpProgress: number;
  duckHeld: boolean;
  activePowerUps: ActivePowerUps;
}

type Listener = (snapshot: GameSnapshot) => void;

export class GameEngine {
  status: GameStatus = 'idle';

  private lane: Lane = 1;
  private laneFrom: Lane = 1;
  private laneChangeStartedAt = 0;
  private laneChanging = false;

  private playerState: PlayerState = 'running';
  private jumpStartedAt = 0;
  private duckStartedAt = 0;
  private duckHeld = false;

  private obstacles: Obstacle[] = [];
  private coins: Coin[] = [];
  private powerUps: PowerUpItem[] = [];

  private magnetUntilMs = 0;
  private starUntilMs = 0;
  private shieldActive = false;

  private speed = BASE_SPEED;
  private timeSinceSpawnMs = 0;
  private nextSpawnInMs = SPAWN_INTERVAL_BASE_MS;
  private clockMs = 0;

  private highScore = 0;
  private stats: GameStats = {
    score: 0,
    highScore: 0,
    distanceM: 0,
    coins: 0,
    jumps: 0,
    ducks: 0,
    laneChanges: 0,
    elapsedMs: 0,
    caloriesBurnt: 0,
    activePowerUps: {
      magnet: false,
      shield: false,
      star: false,
      magnetTimeLeft: 0,
      starTimeLeft: 0,
    },
  };

  private listeners = new Set<Listener>();
  private gameOverReason: string | null = null;

  constructor() {
    this.loadHighScore();
  }

  private loadHighScore() {
    try {
      const saved = localStorage.getItem(HIGH_SCORE_KEY);
      if (saved) {
        this.highScore = parseInt(saved, 10) || 0;
      }
    } catch {
      this.highScore = 0;
    }
  }

  private saveHighScore() {
    if (this.stats.score > this.highScore) {
      this.highScore = Math.floor(this.stats.score);
      try {
        localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
      } catch {
        // ignore quota errors
      }
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.stats.highScore = Math.max(this.highScore, Math.floor(this.stats.score));

    // Dynamic Cardio Fitness Calorie Calculation
    const calFromDist = this.stats.distanceM * 0.065;
    const calFromJumps = this.stats.jumps * 0.2;
    const calFromDucks = this.stats.ducks * 0.32;
    const calFromMoves = this.stats.laneChanges * 0.08;
    this.stats.caloriesBurnt = Number(
      (calFromDist + calFromJumps + calFromDucks + calFromMoves).toFixed(1),
    );

    this.stats.activePowerUps = {
      magnet: this.clockMs < this.magnetUntilMs,
      shield: this.shieldActive,
      star: this.clockMs < this.starUntilMs,
      magnetTimeLeft: Math.max(0, Math.ceil((this.magnetUntilMs - this.clockMs) / 1000)),
      starTimeLeft: Math.max(0, Math.ceil((this.starUntilMs - this.clockMs) / 1000)),
    };

    const snapshot: GameSnapshot = {
      status: this.status,
      stats: { ...this.stats },
    };
    for (const fn of this.listeners) fn(snapshot);
  }

  start() {
    this.loadHighScore();
    idCounter = 1;
    this.lane = 1;
    this.laneFrom = 1;
    this.laneChanging = false;
    this.playerState = 'running';
    this.duckHeld = false;
    this.obstacles = [];
    this.coins = [];
    this.powerUps = [];
    this.magnetUntilMs = 0;
    this.starUntilMs = 0;
    this.shieldActive = false;
    this.speed = BASE_SPEED;
    this.timeSinceSpawnMs = 0;
    this.nextSpawnInMs = SPAWN_INTERVAL_BASE_MS;
    this.clockMs = 0;
    this.gameOverReason = null;
    this.stats = {
      score: 0,
      highScore: this.highScore,
      distanceM: 0,
      coins: 0,
      jumps: 0,
      ducks: 0,
      laneChanges: 0,
      elapsedMs: 0,
      caloriesBurnt: 0,
      activePowerUps: {
        magnet: false,
        shield: false,
        star: false,
        magnetTimeLeft: 0,
        starTimeLeft: 0,
      },
    };
    this.status = 'playing';
    soundManager.startBgMusic();
    this.emit();
  }

  togglePause() {
    if (this.status === 'playing') {
      this.status = 'paused';
      soundManager.stopBgMusic();
    } else if (this.status === 'paused') {
      this.status = 'playing';
      soundManager.startBgMusic();
    }
    this.emit();
  }

  getGameOverReason() {
    return this.gameOverReason;
  }

  handleAction(action: GameAction) {
    if (action === 'TOGGLE_PAUSE') {
      this.togglePause();
      return;
    }
    if (this.status !== 'playing') return;

    switch (action) {
      case 'JUMP': {
        const isJumping = this.playerState === 'jumping';
        const jumpElapsed = this.clockMs - this.jumpStartedAt;
        const jumpProgress = isJumping ? jumpElapsed / JUMP_DURATION_MS : 0;

        if (this.playerState === 'running' || (isJumping && jumpProgress > 0.35)) {
          this.playerState = 'jumping';
          this.jumpStartedAt = this.clockMs;
          this.stats.jumps++;
          soundManager.playJump();
        }
        break;
      }
      case 'DUCK_START':
        this.duckHeld = true;
        if (this.playerState === 'running') {
          this.playerState = 'ducking';
          this.duckStartedAt = this.clockMs;
          this.stats.ducks++;
          soundManager.playDuck();
        }
        break;
      case 'DUCK_END':
        this.duckHeld = false;
        break;
      case 'MOVE_LEFT':
        this.changeLane(-1);
        break;
      case 'MOVE_RIGHT':
        this.changeLane(1);
        break;
    }
  }

  private changeLane(dir: -1 | 1) {
    const target = Math.min(LANE_COUNT - 1, Math.max(0, this.lane + dir)) as Lane;
    if (target === this.lane) return;
    this.laneFrom = this.lane;
    this.lane = target;
    this.laneChanging = true;
    this.laneChangeStartedAt = this.clockMs;
    this.stats.laneChanges++;
    soundManager.playMove();
  }

  update(dtMs: number) {
    if (this.status !== 'playing') return;
    this.clockMs += dtMs;
    this.stats.elapsedMs = this.clockMs;

    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_RAMP_PER_SEC * (dtMs / 1000));

    if (this.laneChanging && this.clockMs - this.laneChangeStartedAt >= LANE_CHANGE_MS) {
      this.laneChanging = false;
    }

    if (this.playerState === 'jumping') {
      const elapsed = this.clockMs - this.jumpStartedAt;
      if (elapsed >= JUMP_DURATION_MS) {
        this.playerState = this.duckHeld ? 'ducking' : 'running';
        if (this.playerState === 'ducking') this.duckStartedAt = this.clockMs;
      }
    }

    if (this.playerState === 'ducking' && !this.duckHeld) {
      const elapsed = this.clockMs - this.duckStartedAt;
      if (elapsed >= DUCK_MIN_HOLD_MS) {
        this.playerState = 'running';
      }
    }

    const multiplier = this.clockMs < this.starUntilMs ? 2 : 1;
    const metersThisTick = this.speed * METERS_PER_SPEED_UNIT_PER_SEC * (dtMs / 1000);
    this.stats.distanceM += metersThisTick;
    this.stats.score += metersThisTick * SCORE_PER_METER * multiplier;

    this.advanceWorld(dtMs);
    this.spawnIfDue(dtMs);
    this.checkCollisions();

    this.emit();
  }

  private advanceWorld(dtMs: number) {
    const dz = this.speed * (dtMs / 1000);
    const isMagnet = this.clockMs < this.magnetUntilMs;

    for (const o of this.obstacles) o.z += dz;

    for (const c of this.coins) {
      c.z += dz;
      if (isMagnet && c.z > 0.15 && c.z < COLLISION_Z && !c.collected) {
        if (c.lane < this.lane) c.lane = (c.lane + 1) as Lane;
        else if (c.lane > this.lane) c.lane = (c.lane - 1) as Lane;
      }
    }

    for (const p of this.powerUps) p.z += dz;

    this.obstacles = this.obstacles.filter((o) => o.z < DESPAWN_Z);
    this.coins = this.coins.filter((c) => c.z < DESPAWN_Z);
    this.powerUps = this.powerUps.filter((p) => p.z < DESPAWN_Z);
  }

  private spawnIfDue(dtMs: number) {
    this.timeSinceSpawnMs += dtMs;
    if (this.timeSinceSpawnMs < this.nextSpawnInMs) return;
    this.timeSinceSpawnMs = 0;

    const speedFactor = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    this.nextSpawnInMs =
      SPAWN_INTERVAL_BASE_MS - (SPAWN_INTERVAL_BASE_MS - SPAWN_INTERVAL_MIN_MS) * speedFactor;

    this.spawnObstacleWave();

    if (Math.random() < 0.5) this.spawnCoinRun();
    if (Math.random() < 0.18) this.spawnPowerUp();
  }

  private spawnObstacleWave() {
    const blockedCount = Math.random() < 0.35 ? 2 : 1;
    const lanes: Lane[] = [0, 1, 2];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const chosen = lanes.slice(0, blockedCount);

    for (const lane of chosen) {
      const type = this.randomObstacleType();
      this.obstacles.push({ id: nextId(), lane, type, z: 0, resolved: false });
    }
  }

  private randomObstacleType(): ObstacleType {
    const r = Math.random();
    if (r < 0.38) return 'low';
    if (r < 0.72) return 'high';
    return 'full';
  }

  private spawnCoinRun() {
    const occupiedLanes = new Set(this.obstacles.filter((o) => o.z < 0.15).map((o) => o.lane));
    const free: Lane[] = [0, 1, 2].filter((l) => !occupiedLanes.has(l as Lane)) as Lane[];
    if (free.length === 0) return;
    const lane = free[Math.floor(Math.random() * free.length)];
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      this.coins.push({ id: nextId(), lane, z: -0.06 * i, collected: false });
    }
  }

  private spawnPowerUp() {
    const occupiedLanes = new Set(this.obstacles.filter((o) => o.z < 0.15).map((o) => o.lane));
    const free: Lane[] = [0, 1, 2].filter((l) => !occupiedLanes.has(l as Lane)) as Lane[];
    if (free.length === 0) return;
    const lane = free[Math.floor(Math.random() * free.length)];

    const r = Math.random();
    const type: PowerUpType = r < 0.4 ? 'shield' : r < 0.7 ? 'magnet' : 'star';
    this.powerUps.push({ id: nextId(), lane, z: -0.05, type, collected: false });
  }

  private checkCollisions() {
    const multiplier = this.clockMs < this.starUntilMs ? 2 : 1;

    for (const o of this.obstacles) {
      if (o.resolved) continue;
      if (o.z < COLLISION_Z) continue;
      if (o.lane !== this.lane) {
        o.resolved = true;
        continue;
      }
      const cleared =
        (o.type === 'low' && this.playerState === 'jumping') ||
        (o.type === 'high' && this.playerState === 'ducking');
      if (cleared) {
        o.resolved = true;
        continue;
      }

      if (this.shieldActive) {
        this.shieldActive = false;
        o.resolved = true;
        soundManager.playPowerup();
        continue;
      }

      o.resolved = true;
      soundManager.playHit();
      this.saveHighScore();
      this.triggerGameOver(
        o.type === 'full'
          ? 'Blocked — step sideways to clear'
          : o.type === 'low'
            ? 'Hit a hurdle — jump to clear low barriers'
            : 'Hit overhead beam — squat/duck to clear low',
      );
      return;
    }

    for (const c of this.coins) {
      if (c.collected) continue;
      if (c.lane !== this.lane) continue;
      if (c.z < COLLISION_Z - 0.06 || c.z > COLLISION_Z + 0.06) continue;
      c.collected = true;
      this.stats.coins++;
      this.stats.score += SCORE_PER_COIN * multiplier;
      soundManager.playCoin();
    }

    for (const p of this.powerUps) {
      if (p.collected) continue;
      if (p.lane !== this.lane) continue;
      if (p.z < COLLISION_Z - 0.06 || p.z > COLLISION_Z + 0.06) continue;
      p.collected = true;
      soundManager.playPowerup();

      if (p.type === 'shield') {
        this.shieldActive = true;
      } else if (p.type === 'magnet') {
        this.magnetUntilMs = this.clockMs + 7000;
      } else if (p.type === 'star') {
        this.starUntilMs = this.clockMs + 8000;
      }
    }
  }

  private triggerGameOver(reason: string) {
    this.status = 'gameover';
    this.gameOverReason = reason;
    soundManager.stopBgMusic();
  }

  getPlayerRenderState(): PlayerRenderState {
    let displayLane: number = this.lane;
    if (this.laneChanging) {
      const t = Math.min(1, (this.clockMs - this.laneChangeStartedAt) / LANE_CHANGE_MS);
      const eased = 1 - Math.pow(1 - t, 2);
      displayLane = this.laneFrom + (this.lane - this.laneFrom) * eased;
    }
    let jumpProgress = 0;
    if (this.playerState === 'jumping') {
      jumpProgress = Math.min(1, (this.clockMs - this.jumpStartedAt) / JUMP_DURATION_MS);
    }
    return {
      lane: this.lane,
      displayLane,
      state: this.playerState,
      jumpProgress,
      duckHeld: this.playerState === 'ducking',
      activePowerUps: {
        magnet: this.clockMs < this.magnetUntilMs,
        shield: this.shieldActive,
        star: this.clockMs < this.starUntilMs,
        magnetTimeLeft: Math.max(0, Math.ceil((this.magnetUntilMs - this.clockMs) / 1000)),
        starTimeLeft: Math.max(0, Math.ceil((this.starUntilMs - this.clockMs) / 1000)),
      },
    };
  }

  getObstacles(): Obstacle[] {
    return this.obstacles;
  }

  getCoins(): Coin[] {
    return this.coins;
  }

  getPowerUps(): PowerUpItem[] {
    return this.powerUps;
  }

  getStats(): GameStats {
    return this.stats;
  }
}
