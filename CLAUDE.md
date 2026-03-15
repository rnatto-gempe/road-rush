# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Road Rush is a 2D endless runner racing game built with vanilla JavaScript and the Canvas API. The entire game (~9500 lines) lives in a single file: `src/main.js`. It uses Vite for dev server and bundling, and deploys to GitHub Pages.

## Commands

- **Dev server:** `npm run dev` (serves at `http://localhost:5173`)
- **Build:** `npm run build` (outputs to `dist/`)
- **Preview build:** `npm run preview`
- No tests or linter configured. Validate changes by running `npm run build` (catches syntax/import errors) and playing the game in the browser.

## Architecture

### Single-file game (`src/main.js`)

The game is structured as a finite state machine (FSM) with these states:
- `titleState` — title screen with "Start" / "Ranking" / "Configurações" buttons
- `titleRankingState` — ranking overlay on the title screen
- `countdownState` — pre-game countdown with gyroscope calibration (sample averaging)
- `settingsState` — gyroscope toggle/sensitivity slider, sound controls, mini test track
- `playingState` — main gameplay loop
- `explosionState` — cinematic collision/explosion sequence before game over
- `gameOverState` — score display, name input, ranking, feedback, ads

Each state object implements `onEnter()`, `update(dt)`, `render(ctx)`, and optionally `onExit()`. The FSM at `fsm` (~line 3381) manages transitions via `fsm.transition(newState)`.

### Game loop

Fixed timestep at 60 FPS (`FIXED_DT = 1/60`). An accumulator pattern decouples update ticks from render frames. Hit-stop frames pause updates for juice effects. The paused else-branch (~line 9471) drains the accumulator and is the place to tick UI timers that run while paused (e.g. recalibrate feedback).

### Phase system (road → sky → space)

The game has three visual/gameplay phases triggered by elapsed time:
- **road** — default ground-level racing with cars, trucks, motos
- **sky** — player sprite becomes car-with-wings; obstacles are birds, airplanes, helicopters
- **space** — player becomes a spaceship; obstacles are asteroids, fighters, cruisers

Phase transitions are animated with particle effects and eased backgrounds. `gameState.phase` tracks current phase; `gameState.phaseTransition` manages animated crossfades. Each vehicle type in `VEHICLE_TYPES` (~line 197) has a `phase` property determining when it spawns.

### Key systems (top-to-bottom in file)

1. **Constants & difficulty config** (~lines 1-195) — `DIFFICULTY` object is the single source of truth for speed ramps, traffic tiers, fuel drain curves. Weapon, near-miss, and phase constants also here.
2. **Vehicle types** (`VEHICLE_TYPES` ~line 197) — defines all obstacle types per phase with minTime, speed, dimensions, draw functions
3. **AudioManager** (~line 317) — Web Audio API singleton for procedural sound (engine drone, road noise, nitro, beat system, SFX). No audio files; all sounds are synthesized. Key methods: `playNearMiss()`, `playCrash()`, `playComboUp()`, `playTapeStop()`
4. **Gyroscope system** (~line 2178) — `processGyroInput()` is the unified pipeline: EMA filter → subtract baseline → dead zone (3° scaled remap) → power curve (^1.5) → sensitivity multiplier → target velocity. Constants: `GYRO_EMA_ALPHA`, `GYRO_DEAD_ZONE`, `GYRO_MAX_ANGLE`, `GYRO_SENSITIVITY_LEVELS`
5. **DOM elements** (~line 2445+) — Touch controls, name form, feedback modal, AdSense slot. Created programmatically, positioned via `resizeCanvas()`
6. **Input handling** — Keyboard (`keydown`/`keyup` maps) + mobile touch buttons + gyroscope. `consumeKey(key)` for one-shot actions
7. **Rendering functions** (~line 4177+) — `renderRoad()`, `renderSkyElements()`, `renderSpaceElements()` with phase-aware backgrounds and transition rendering
8. **Player movement** (`updatePlayer` ~line 4666) — handles keyboard, touch, and gyro input; applies lerp smoothing
9. **Traffic spawning** (~line 5134) — `isFairToSpawn()` fairness system ensures player always has a gap; phase-aware vehicle selection
10. **Near-miss system** (~line 5305) — proximity detection, combo multiplier, spark particles, float text, screen shake, camera zoom
11. **Weapon system** — power-up spawning, bullet firing, vehicle destruction with explosions
12. **HUD rendering** (~line 6741+) — fuel bar, score, combo counter, nitro bar with opacity animation system
13. **FSM states** (~line 7118+) — state definitions with onEnter/update/render/onExit
14. **Score/ranking** — submits to n8n webhook (`SCORE_WEBHOOK_URL`); feedback via `FEEDBACK_WEBHOOK_URL`

### Canvas scaling

Fixed 400×700 logical resolution (`CANVAS_WIDTH`, `CANVAS_HEIGHT`). `resizeCanvas()` scales via CSS transforms to fill viewport while maintaining aspect ratio. All game logic uses the logical coordinate system. Road spans from `ROAD_LEFT` (40) to `ROAD_RIGHT` (360).

### Deployment

GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages on push to `main`. Vite `base` is set to `/road-rush/`.

## Critical Patterns & Gotchas

### Gyroscope
- `processGyroInput()` is the SINGLE source of truth for gyro physics — never duplicate gyro logic in `updatePlayer` or `settingsState`
- `gyroSmoothedGamma` holds EMA-filtered value (updated in `onDeviceOrientation`); `gyroBaselineGamma` is calibration offset
- Three places stop the gyro listener (`stopGyroscope()`, `playingState.onExit`, `settingsState.onExit`) — all must reset `gyroSmoothedGamma` to 0
- iOS 13+ requires `DeviceOrientationEvent.requestPermission()` from user gesture
- `localStorage` key `roadrush_gyro` persists `{enabled, sensitivityIndex}`

### Pause overlay & touch events
- Pause overlay buttons are detected in TWO places: `touchend` handler (~line 3204) and `click` handler (~line 3298) — both must be kept in sync
- `_touchHandled` flag prevents double-fire between touchend and click events
- `e.preventDefault()` in touchend blocks click — so BOTH handlers must handle every button

### Countdown calibration
- `countdownState` collects `gyroSmoothedGamma` samples during last 1s, averages them for baseline (min 20 samples, fallback to snapshot)
- Transition to `playingState` is gated by `calibrationDone` flag, not just timer ≤ 0
- Stddev > 8° triggers "MANTENHA O CELULAR PARADO" warning with 1.5s delay

### Collision & fairness
- AABB collision with separate hitbox functions for player and vehicles
- `isFairToSpawn()` ensures the player always has a navigable gap
- Near-miss detection runs per-vehicle once they pass below the player

## Ralph Agent System

The `ralph/` directory (gitignored) contains configuration for the Ralph autonomous coding agent:
- `prd.json` — current PRD with user stories, acceptance criteria, and pass status
- `progress.txt` — append-only progress log with learnings and codebase patterns
- `archive/` — completed PRDs from previous iterations
- `ralph.sh` — agent runner script
- `claude.md` — Ralph-specific instructions

Ralph reads `prd.json`, implements user stories one at a time (highest priority with `passes: false`), commits each as `feat: [Story ID] - [Story Title]`, and logs progress. The `Codebase Patterns` section at the top of `progress.txt` consolidates reusable learnings.

## Key Conventions

- All game tuning parameters live in the `DIFFICULTY` config object or named constants at the top of `main.js`
- UI text is in Portuguese (pt-BR)
- Mobile support: touch controls are dynamically created/positioned; device detection via `ontouchstart` and viewport size
- All sprites are drawn procedurally on canvas (no image assets)
- All sounds are synthesized via Web Audio API (no audio files)
- Feature branches follow pattern `ralph/<feature-name>` and merge to `main` via PR or direct merge
