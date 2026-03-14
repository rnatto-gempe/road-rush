# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Road Rush is a 2D endless runner racing game built with vanilla JavaScript and the Canvas API. The entire game (~5600 lines) lives in a single file: `src/main.js`. It uses Vite for dev server and bundling, and deploys to GitHub Pages.

## Commands

- **Dev server:** `npm run dev` (serves at `http://localhost:5173`)
- **Build:** `npm run build` (outputs to `dist/`)
- **Preview build:** `npm run preview`
- No tests or linter configured. Validate changes by running the dev server and playing the game.

## Architecture

### Single-file game (`src/main.js`)

The game is structured as a finite state machine (FSM) with these states:
- `titleState` — title screen with "Start" / "Ranking" buttons
- `titleRankingState` — ranking overlay on the title screen
- `playingState` — main gameplay loop
- `explosionState` — cinematic collision/explosion sequence before game over
- `gameOverState` — score display, name input, ranking, feedback, ads

Each state object implements `enter()`, `update(dt)`, and `render(ctx)`. The FSM object at `fsm` manages transitions via `fsm.transition(newState)`.

### Game loop

Fixed timestep at 60 FPS (`FIXED_DT = 1/60`). An accumulator pattern decouples update ticks from render frames. Hit-stop frames pause updates for juice effects.

### Key systems (top-to-bottom in file)

1. **Constants & difficulty config** (~lines 1-190) — `DIFFICULTY` object is the single source of truth for speed ramps, traffic tiers, fuel drain curves
2. **AudioManager** (~line 195) — Web Audio API singleton for procedural sound (engine drone, road noise, nitro, SFX). No audio files; all sounds are synthesized
3. **DOM elements** (~line 1680+) — Touch controls, name form, ranking button, feedback modal, AdSense slot. Created programmatically, positioned via `resizeCanvas()`
4. **Input handling** — Keyboard (`keydown`/`keyup` maps) + mobile touch buttons. `consumeKey(key)` for one-shot actions
5. **Gameplay functions** — Player movement, traffic spawning (fairness system prevents unfair spawns), fuel/coin/nitro/shield items, collision with graded responses
6. **Visual effects** — Screen shake, shockwave rings, chromatic aberration, motion ghosts, bloom (offscreen canvas), heat haze, speed lines, speed vignette
7. **HUD rendering** — Fuel bar, score, combo counter, nitro bar, mute icon
8. **FSM states** (~line 4273+) — State definitions with enter/update/render
9. **Ranking system** — Fetches from/submits to `https://road-rush-api.fly.dev/api/ranking`

### Canvas scaling

The game renders at a fixed 400×700 logical resolution. `resizeCanvas()` scales the canvas to fill the viewport while maintaining aspect ratio, using CSS transforms. All game logic uses the logical coordinate system.

### Deployment

GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages on push to `main`. Vite `base` is set to `/road-rush/`.

## Ralph Agent System

The `ralph/` directory contains configuration for the Ralph autonomous coding agent. Ralph reads `prd.json` for user stories, implements them one at a time, and logs progress to `progress.txt`. The `ralph/` directory is gitignored.

## Key Conventions

- All game tuning parameters live in the `DIFFICULTY` config object or named constants at the top of `main.js`
- UI text is in Portuguese (pt-BR)
- Mobile support: touch controls are dynamically created/positioned; device detection via `ontouchstart` and viewport size
- Collision system uses AABB overlap with separate hitbox functions for player and vehicles
- Traffic spawning has a fairness system (`isFairToSpawn`) that ensures the player always has a gap to dodge through
