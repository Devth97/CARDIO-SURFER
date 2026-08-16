# Subway Fit — Phase 1 Backend PRD

**Status:** Draft for review
**Date:** 2026-08-16
**Owner:** solo founder/developer (beginner, cost-sensitive)
**Companion doc:** [Phase 1 TRD](../technical/subway-fit-phase1-trd.md)

## 1. Background

Subway Fit is a pose-tracking, Subway-Surfers-style fitness game. It currently runs entirely client-side (Vite + React + Three.js + MediaPipe pose tracking) with zero backend — no accounts, no persistence, no leaderboard. The game logic and rendering bugs that blocked gameplay have been fixed; this PRD covers the first backend milestone needed before wider release.

A second milestone — a real-money weekly contest (₹50 entry, ₹1000 payout to the top scorer, funded via a payment gateway) — was explicitly requested by the product owner but is **out of scope for this PRD**. It requires payment gateway integration, marketplace-style payout/KYC handling, state-by-state legal review of real-money gaming in India, Google Play's separate Real Money Gaming certification, and server-authoritative anti-cheat (since gameplay currently runs entirely in the browser and scores are otherwise trivially falsifiable). That work is deferred to a Phase 2 PRD once Phase 1 is live and validated.

## 2. Goals

1. Let players sign in with a Google account so their progress and scores persist across devices/sessions.
2. Give players a reason to keep coming back: a global leaderboard, both weekly (resets every week) and all-time.
3. Track calories burned per run alongside score, since this is a fitness game, not just an arcade game.
4. Monetize free play with a non-intrusive banner ad, without requiring any payment infrastructure.
5. Do all of this on infrastructure that cannot generate a surprise bill for a first-time app developer.

## 3. Non-goals (Phase 1)

- No real-money contests, entry fees, or payouts.
- No payment gateway integration.
- No RevenueCat / IAP / subscriptions.
- No email/password login, Apple Sign-In, or guest play — Google Sign-In only.
- No server-authoritative gameplay replay verification (full anti-cheat). A basic plausibility check is included; see TRD §5.
- No social features (friends, chat, sharing) beyond the public leaderboard.

## 4. Users & use cases

- **New player:** opens the app, is prompted to sign in with Google before the first run (sign-in is required upfront, not optional). After signing in, plays a run, sees their score and calories burned, and sees where they land on the leaderboard.
- **Returning player:** signs in automatically (persisted session), plays more runs, watches their weekly and all-time rank change, checks their personal run history.
- **Casual visitor (not signed in):** can view the public leaderboard (read-only) before deciding to sign in and play.

## 5. Functional requirements

### 5.1 Authentication
- Google Sign-In via Firebase Authentication is required before a player can start a run.
- Session persists across visits (no re-login every time).

### 5.2 Score & calorie submission
- At the end of every run, the app submits: final score, calories burned, and run duration, tied to the signed-in player.
- The player sees immediate confirmation of their submitted score (no waiting/loading state that breaks the game-over flow).

### 5.3 Leaderboard
- **Weekly leaderboard:** ranks players by best (or total — see TRD open question resolved in TRD §3) score within the current calendar week; resets each week.
- **All-time leaderboard:** ranks players by best score ever recorded.
- Both leaderboards show: rank, display name, avatar (from Google account), score.
- Leaderboards are viewable by anyone, signed in or not.

### 5.4 Personal history
- A signed-in player can view their own past runs (score, calories, date) — supports a future "my stats" screen.

### 5.5 Ads
- A banner ad (Google AdMob) is shown on non-gameplay screens (menu, game-over, leaderboard) for all users. No ad-free tier exists yet.

## 6. Success criteria

- A player can sign in, play a run, and see their score appear on both leaderboards within a few seconds of finishing.
- Leaderboard and auth infrastructure run within free-tier limits at expected early-stage traffic (see TRD §6 for specific thresholds).
- No manual step is required to avoid an unexpected bill under normal (non-abusive) usage.

## 7. Open questions carried to Phase 2

- Real-money contest legality by Indian state and Play Store Real Money Gaming certification requirements.
- Payment gateway choice for entry-fee collection and prize payout/KYC.
- Server-authoritative anti-cheat design (needed once money is on the line).
- RevenueCat cannot integrate with a TWA-wrapped web app (no native billing bridge) — if RevenueCat is still wanted, the Android app must move to a native shell (e.g. Capacitor) before Phase 2 begins. This is a packaging decision to revisit at that time.
