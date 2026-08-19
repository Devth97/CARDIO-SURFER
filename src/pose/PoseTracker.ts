import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import {
  DUCK_DROP_RATIO,
  DUCK_RELEASE_RATIO,
  HAND_RAISE_RELEASE_OFFSET,
  HAND_RAISE_TRIGGER_OFFSET,
  JUMP_ARMED_TIMEOUT_MS,
  JUMP_COOLDOWN_MS,
  JUMP_DISPLACEMENT_RATIO,
  JUMP_RELEASE_RATIO,
  MIN_LANDMARK_CONFIDENCE,
  SMOOTHING_ALPHA,
  TRACKING_LOST_MS,
} from './gestureConfig';
import type { GameAction } from '../game/types';

// MediaPipe BlazePose landmark indices
const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_WRIST = 15;
const R_WRIST = 16;

export interface PoseDebugState {
  tracking: boolean;
  tPoseDetected: boolean;
  rightHandRaised: boolean;
  leftHandRaised: boolean;
  centerX: number;
  centerY: number;
  baselineX: number;
  baselineY: number;
  bodyHeight: number;
  shiftRatio: number;
  dropRatio: number;
  duckActive: boolean;
  landmarks: NormalizedLandmark[] | null;
}

type ActionListener = (action: GameAction) => void;
type DebugListener = (state: PoseDebugState) => void;

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private mirrorCanvas: HTMLCanvasElement;
  private mirrorCtx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private running = false;

  private smoothedX = 0.5;
  private smoothedY = 0.5;
  private bodyHeight = 0.25;
  private hasSample = false;
  private lastGoodPoseAt = 0;
  private tPoseDetected = false;

  private baselineX = 0.5;
  private baselineY = 0.5;
  private calibrated = false;

  private duckActive = false;
  private jumpArmed = false;
  private jumpArmedAt = 0;
  private lastJumpAt = -Infinity;

  private rightHandArmed = false;
  private leftHandArmed = false;
  private rightHandRaised = false;
  private leftHandRaised = false;

  private currentShiftRatio = 0;
  private currentDropRatio = 0;

  private actionListeners = new Set<ActionListener>();
  private debugListeners = new Set<DebugListener>();

  constructor() {
    this.mirrorCanvas = document.createElement('canvas');
    this.mirrorCtx = this.mirrorCanvas.getContext('2d', { willReadFrequently: false })!;
  }

  onAction(fn: ActionListener) {
    this.actionListeners.add(fn);
    return () => this.actionListeners.delete(fn);
  }

  onDebug(fn: DebugListener) {
    this.debugListeners.add(fn);
    return () => this.debugListeners.delete(fn);
  }

  private emitAction(a: GameAction) {
    for (const fn of this.actionListeners) fn(a);
  }

  private emitDebug(landmarks: NormalizedLandmark[] | null) {
    const state: PoseDebugState = {
      tracking: performance.now() - this.lastGoodPoseAt < TRACKING_LOST_MS && this.hasSample,
      tPoseDetected: this.tPoseDetected,
      rightHandRaised: this.rightHandRaised,
      leftHandRaised: this.leftHandRaised,
      centerX: this.smoothedX,
      centerY: this.smoothedY,
      baselineX: this.baselineX,
      baselineY: this.baselineY,
      bodyHeight: this.bodyHeight,
      shiftRatio: this.currentShiftRatio,
      dropRatio: this.currentDropRatio,
      duckActive: this.duckActive,
      landmarks,
    };
    for (const fn of this.debugListeners) fn(state);
  }

  async init() {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }

  calibrateNow() {
    this.baselineX = this.smoothedX;
    this.baselineY = this.smoothedY;
    this.calibrated = true;
    this.duckActive = false;
    this.jumpArmed = false;
    this.rightHandArmed = false;
    this.leftHandArmed = false;
  }

  isCalibrated() {
    return this.calibrated;
  }

  start(video: HTMLVideoElement) {
    if (!this.landmarker) throw new Error('PoseTracker.init() must resolve before start()');
    this.video = video;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private loop = () => {
    if (!this.running || !this.video || !this.landmarker) return;
    const video = this.video;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      if (
        this.mirrorCanvas.width !== video.videoWidth ||
        this.mirrorCanvas.height !== video.videoHeight
      ) {
        this.mirrorCanvas.width = video.videoWidth;
        this.mirrorCanvas.height = video.videoHeight;
      }
      const ctx = this.mirrorCtx;
      ctx.save();
      ctx.translate(this.mirrorCanvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      ctx.restore();

      const now = performance.now();
      const result = this.landmarker.detectForVideo(this.mirrorCanvas, now);
      this.processResult(result.landmarks?.[0] ?? null, now);
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private processResult(landmarks: NormalizedLandmark[] | null, now: number) {
    if (!landmarks) {
      this.tPoseDetected = false;
      this.rightHandRaised = false;
      this.leftHandRaised = false;
      this.emitDebug(null);
      return;
    }

    const ok = (i: number) => (landmarks[i]?.visibility ?? 1) >= MIN_LANDMARK_CONFIDENCE;
    const okShoulders = ok(L_SHOULDER) && ok(R_SHOULDER);

    if (!okShoulders) {
      this.tPoseDetected = false;
      this.rightHandRaised = false;
      this.leftHandRaised = false;
      this.emitDebug(landmarks);
      return;
    }

    const cx = (landmarks[L_SHOULDER].x + landmarks[R_SHOULDER].x) / 2;
    const cy = (landmarks[L_SHOULDER].y + landmarks[R_SHOULDER].y) / 2;

    const headToShoulder = ok(NOSE) ? Math.abs(cy - landmarks[NOSE].y) : 0.15;
    const bh = Math.max(0.08, headToShoulder * 2.2);

    // Standing T-Pose Check (both arms horizontal) for baseline calibration
    if (ok(L_WRIST) && ok(R_WRIST)) {
      const lWristYDiff = Math.abs(landmarks[L_WRIST].y - cy);
      const rWristYDiff = Math.abs(landmarks[R_WRIST].y - cy);
      const wristSpan = Math.abs(landmarks[L_WRIST].x - landmarks[R_WRIST].x);
      const shoulderWidth = Math.abs(landmarks[L_SHOULDER].x - landmarks[R_SHOULDER].x);

      const horizontalArms = lWristYDiff < 0.35 * bh && rWristYDiff < 0.35 * bh;
      const wideSpan = wristSpan > 1.2 * Math.max(0.06, shoulderWidth);

      this.tPoseDetected = horizontalArms && wideSpan;
    } else {
      this.tPoseDetected = false;
    }

    // On mirrored canvas:
    // MediaPipe L_WRIST is user's physical RIGHT hand (screen right)!
    // MediaPipe R_WRIST is user's physical LEFT hand (screen left)!
    this.rightHandRaised =
      ok(L_WRIST) && landmarks[L_WRIST].y < landmarks[L_SHOULDER].y - HAND_RAISE_TRIGGER_OFFSET * bh;

    this.leftHandRaised =
      ok(R_WRIST) && landmarks[R_WRIST].y < landmarks[R_SHOULDER].y - HAND_RAISE_TRIGGER_OFFSET * bh;

    if (!this.hasSample) {
      this.smoothedX = cx;
      this.smoothedY = cy;
      this.bodyHeight = bh;
      this.hasSample = true;
    } else {
      this.smoothedX = SMOOTHING_ALPHA * cx + (1 - SMOOTHING_ALPHA) * this.smoothedX;
      this.smoothedY = SMOOTHING_ALPHA * cy + (1 - SMOOTHING_ALPHA) * this.smoothedY;
      this.bodyHeight = SMOOTHING_ALPHA * bh + (1 - SMOOTHING_ALPHA) * this.bodyHeight;
    }
    this.lastGoodPoseAt = now;

    if (this.calibrated) {
      this.runGestureLogic(now, cy, landmarks, bh, ok);
    }
    this.emitDebug(landmarks);
  }

  private runGestureLogic(
    nowMs: number,
    rawCy: number,
    landmarks: NormalizedLandmark[],
    bh: number,
    ok: (i: number) => boolean,
  ) {
    this.currentShiftRatio = (this.smoothedX - this.baselineX) / bh;
    // Use the smoothed Y and smoothed body-height (like currentShiftRatio
    // uses smoothedX), not the raw per-frame values — comparing a single
    // noisy frame against a threshold as tight as 7% of body height fires on
    // ordinary landmark jitter alone, causing continuous false JUMPs that
    // then starve DUCK_START (which only triggers from the 'running' state)
    // of ever running. bh in particular is a ratio *denominator*: a noisy
    // frame where it reads smaller than usual inflates the ratio even with
    // no real displacement, so it needs smoothing just as much as the
    // position itself does.
    this.currentDropRatio = (this.smoothedY - this.baselineY) / this.bodyHeight;
    const upwardRise = (this.baselineY - this.smoothedY) / this.bodyHeight;

    // Slow baseline adaptation when standing comfortably upright
    if (!this.duckActive && Math.abs(this.currentDropRatio) < 0.05) {
      this.baselineY = 0.01 * rawCy + 0.99 * this.baselineY;
    }

    // --- INSTANT HIGH-SENSITIVITY JUMP: Upward rise >= 6% above standing baseline ---
    // Unlike duck/hand-raise below, this had no "armed" latch — only the
    // cooldown timer gated re-triggering. A real jump keeps the body risen
    // above the threshold for longer than JUMP_COOLDOWN_MS (actual airtime
    // plus smoothing lag), so a single real jump could re-cross the
    // threshold and fire JUMP several times before landing — exactly what
    // "continuously jumping" from one real jump looks like. Require
    // dropping back below JUMP_RELEASE_RATIO before arming again, same
    // pattern as duckActive/rightHandArmed/leftHandArmed.
    if (!this.jumpArmed && upwardRise > JUMP_DISPLACEMENT_RATIO && nowMs - this.lastJumpAt > JUMP_COOLDOWN_MS) {
      this.jumpArmed = true;
      this.jumpArmedAt = nowMs;
      this.lastJumpAt = nowMs;
      this.emitAction('JUMP');
    } else if (
      this.jumpArmed &&
      (upwardRise < JUMP_RELEASE_RATIO || nowMs - this.jumpArmedAt > JUMP_ARMED_TIMEOUT_MS)
    ) {
      this.jumpArmed = false;
    }

    // --- INSTANT HIGH-SENSITIVITY DUCK: Downward drop >= 8% below standing baseline ---
    if (!this.duckActive && this.currentDropRatio > DUCK_DROP_RATIO) {
      this.duckActive = true;
      this.emitAction('DUCK_START');
    }

    if (this.duckActive && this.currentDropRatio < DUCK_RELEASE_RATIO) {
      this.duckActive = false;
      this.emitAction('DUCK_END');
    }

    // --- MIRRORED HAND RAISE STEERING LOGIC ---
    // User's physical Right Hand (L_WRIST in mirrored canvas) -> MOVE_RIGHT
    const rightHandHigh =
      ok(L_WRIST) && landmarks[L_WRIST].y < landmarks[L_SHOULDER].y - HAND_RAISE_TRIGGER_OFFSET * bh;
    const rightHandLow =
      !ok(L_WRIST) || landmarks[L_WRIST].y > landmarks[L_SHOULDER].y + HAND_RAISE_RELEASE_OFFSET * bh;

    if (rightHandHigh && !this.rightHandArmed) {
      this.rightHandArmed = true;
      this.emitAction('MOVE_RIGHT');
    } else if (rightHandLow) {
      this.rightHandArmed = false; // Lowering hand resets trigger so lifting again moves a 2nd lane right!
    }

    // User's physical Left Hand (R_WRIST in mirrored canvas) -> MOVE_LEFT
    const leftHandHigh =
      ok(R_WRIST) && landmarks[R_WRIST].y < landmarks[R_SHOULDER].y - HAND_RAISE_TRIGGER_OFFSET * bh;
    const leftHandLow =
      !ok(R_WRIST) || landmarks[R_WRIST].y > landmarks[R_SHOULDER].y + HAND_RAISE_RELEASE_OFFSET * bh;

    if (leftHandHigh && !this.leftHandArmed) {
      this.leftHandArmed = true;
      this.emitAction('MOVE_LEFT');
    } else if (leftHandLow) {
      this.leftHandArmed = false; // Lowering hand resets trigger so lifting again moves a 2nd lane left!
    }
  }
}
