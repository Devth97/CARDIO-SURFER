// Tunable thresholds for Hand-Raise Steering & High-Sensitivity Jump/Duck.

export const SMOOTHING_ALPHA = 0.50; // Fast instant response
export const MIN_LANDMARK_CONFIDENCE = 0.28;

// Instant High-Sensitivity Jump: Upward shoulder/head displacement of 7% above standing baseline.
export const JUMP_DISPLACEMENT_RATIO = 0.07; // 7% upward rise above baseline standing position
export const JUMP_RELEASE_RATIO = 0.03; // Must fall back below 3% rise before another jump can arm
export const JUMP_COOLDOWN_MS = 220; // Fast 220ms consecutive jump cooldown

// Duck: Requires a clear 16% downward squat drop below standing baseline.
export const DUCK_DROP_RATIO = 0.16; // 16% downward squat drop below baseline standing position
export const DUCK_RELEASE_RATIO = 0.06; // Return to within 6% of standing releases duck

// Hand Raise Steering: Raising wrist above shoulder height by 5% of body height.
export const HAND_RAISE_TRIGGER_OFFSET = 0.05; // 5% body height above shoulder line
export const HAND_RAISE_RELEASE_OFFSET = 0.02; // Hand lowered below shoulder line resets trigger

// Tracking lost threshold
export const TRACKING_LOST_MS = 1200;
