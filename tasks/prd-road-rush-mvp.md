# PRD: Road Rush — MVP

## Introduction

Road Rush is a minimalist arcade vertical racing game inspired by Road Fighter (Konami, 1984). The player drives at high speed on an infinite highway, dodging traffic and collecting fuel, in a session designed to last 45–120 seconds. This PRD covers the MVP: a fully playable core loop built in 3 incremental phases. Built with Vite + vanilla JavaScript, desktop-first (keyboard controls).

## Goals

- Deliver a playable core loop: start → drive → dodge → die → retry in under 3 seconds
- Implement the vertical scrolling road with increasing speed (200–800 px/s)
- Spawn traffic with fairness constraint (always 1 passable corridor)
- Implement fuel as the session timer (drains constantly, game over when empty)
- Score system with distance + near miss + coins
- Instant retry (< 300ms from game over to playing again)
- Stable 60 FPS on modern desktop browsers
- Bundle size < 200KB gzipped

## Implementation Phases

The MVP is split into 3 incremental phases. Each phase produces a playable build. **Do not start the next phase until the current one is playtested and the game feel is validated.**

| Phase | Name | Scope | Playtest Goal |
|-------|------|-------|---------------|
| MVP-0 | Skeleton | Game loop + road + car + 1 traffic type (sedan) + basic collision (death) + game over + retry | "Does the core loop feel good? Is the car responsive?" |
| MVP-1 | Core Systems | Fuel + scoring + 4 traffic types + difficulty ramp + fairness constraint | "Is the session length ~60-90s? Does difficulty feel fair?" |
| MVP-2 | Juice & Depth | Near miss + combo + DDA + items (nitro/shield/coins) + VFX | "Is the risk/reward compelling? Does it feel juicy?" |

---

## Road & Lane Specification

The road uses **4 discrete lanes** on a fixed logical canvas.

| Parameter | Value |
|-----------|-------|
| Logical canvas width | 400 px |
| Logical canvas height | 700 px |
| Canvas scaling | Letterbox (maintain aspect ratio, center, black bars on sides) |
| Road width | 320 px (centered, 40px margin each side for rumble strips) |
| Number of lanes | 4 |
| Lane width | 80 px each |
| Player car width | 40 px (~50% of a lane) |
| Player car height | 64 px |

Traffic spawns **centered in a lane** but moves on a continuous X axis (not snapped to lanes). "Stays in lane" means the vehicle's target X is the lane center. Vehicles that "change lanes" interpolate smoothly to an adjacent lane center.

---

## Traffic Frame of Reference

All traffic moves **in the same direction** as the player (same as Road Fighter). The player is faster, so traffic scrolls downward on screen.

| Concept | Formula |
|---------|---------|
| Visual speed of traffic | `scroll_speed - vehicle_own_speed` (positive = moves down on screen) |
| Truck own speed | 40% of current scroll speed |
| Sedan own speed | 60% of current scroll speed |
| Sports car own speed | 85% of current scroll speed (appears almost stationary, harder to pass) |
| Motorcycle own speed | 70% of current scroll speed (but weaves laterally) |

A vehicle with `own_speed = scroll_speed` would appear stationary on screen. All traffic is slower than the player, so all traffic scrolls downward — but some scroll much slower (sports car barely moves down), creating different dodge timings.

---

## User Stories

### Phase MVP-0: Skeleton

#### US-001: Project Setup & Game Loop
**Description:** As a developer, I need the project scaffolded with Vite + vanilla JS and a stable game loop so that all subsequent features have a solid foundation.

**Acceptance Criteria:**
- [ ] Vite project initialized with vanilla JS
- [ ] HTML5 Canvas at 400×700 logical resolution, scaled to viewport with letterboxing (centered, aspect ratio preserved)
- [ ] Game loop using `requestAnimationFrame` with fixed delta time (1/60s timestep with accumulator pattern)
- [ ] Finite State Machine: Title → Playing → GameOver → Playing
- [ ] Title screen shows "Road Rush" title text and "Press Enter to Start" pulsing
- [ ] Game starts on Enter key press
- [ ] Verify in browser: canvas renders centered with correct aspect ratio at different window sizes

#### US-002: Road Rendering & Scrolling
**Description:** As a player, I want to see an infinite road scrolling downward so that I feel the sensation of high-speed driving.

**Acceptance Criteria:**
- [ ] Dark asphalt background (`#1A1A2E` → `#16213E` vertical gradient)
- [ ] 4 lanes, each 80px wide, within 320px road area
- [ ] White dashed lane markers (40% opacity, 3 markers between 4 lanes) scrolling downward
- [ ] Solid white border lines on road edges
- [ ] Red/white rumble strips on outer edges (40px each side)
- [ ] Scroll speed starts at 200 px/s
- [ ] Scroll speed increases: `200 + (elapsed_seconds × 5)` px/s
- [ ] Soft cap at 600 px/s (after ~80s, ramp reduces to +1.5/s)
- [ ] Hard cap at 800 px/s
- [ ] Verify in browser: lane markers scroll smoothly, no tearing

#### US-003: Player Car & Movement
**Description:** As a player, I want to control a car that moves left and right on the road so that I can dodge traffic.

**Acceptance Criteria:**
- [ ] Player car rendered as red rounded rectangle (`#E53935`), 40×64 px
- [ ] Car positioned at bottom 20% of screen vertically (Y = ~560)
- [ ] Keyboard controls: Arrow Left / Arrow Right to move horizontally
- [ ] Progressive acceleration on key hold: 1200 px/s² lateral acceleration
- [ ] Deceleration when no input: 1800 px/s² (quick stop)
- [ ] Max lateral speed: 400 px/s
- [ ] Car constrained within road borders (left edge: 40px, right edge: 360px)
- [ ] Hitbox is 80% of sprite size (32×51 px, centered within sprite)
- [ ] Verify in browser: car feels responsive, cannot leave the road

#### US-004a: Basic Traffic (Sedan Only)
**Description:** As a player, I want to face sedans on the road that I must dodge so that the core dodge mechanic can be validated.

**Acceptance Criteria:**
- [ ] Sedan: blue rectangle (`#1E88E5`), 40×60 px, spawns centered in a random lane
- [ ] Sedan own speed: 60% of scroll speed (scrolls downward at 40% of scroll speed)
- [ ] Spawns at Y = -60 (above screen), removed when Y > 760 (below screen)
- [ ] Spawn interval: one sedan every 1200–1600 px of distance traveled
- [ ] Max 2 simultaneous sedans on screen
- [ ] Verify in browser: sedans appear from top, scroll down at a speed that feels like you're overtaking them

#### US-005a: Basic Collision (Death Only)
**Description:** As a player, I want to die on any collision so that the core loop (drive → die → retry) can be tested.

**Acceptance Criteria:**
- [ ] AABB collision detection between player hitbox (80%) and sedan hitbox (80%)
- [ ] Any collision = instant game over (simplified for MVP-0; graded collisions come in MVP-1)
- [ ] Screen shake on death: 10px offset decaying over 0.5s
- [ ] Verify in browser: collisions feel fair (generous hitbox means near-visual-contact survives)

#### US-006a: Game Over & Retry
**Description:** As a player, I want to see my run result and instantly retry so that the core retry loop works.

**Acceptance Criteria:**
- [ ] Game over screen shows: "GAME OVER", survival time, distance traveled
- [ ] "Press Enter to Retry" text
- [ ] Retry on Enter key, transition to gameplay in < 300ms
- [ ] All game state fully reset on retry (no variable leaks between runs)
- [ ] Verify in browser: retry is instant, no stale state from previous run

---

### Phase MVP-1: Core Systems

#### US-004b: Full Traffic System (4 Types)
**Description:** As a player, I want to face 4 distinct traffic types with increasing variety over time so that the game feels progressively more challenging.

**Acceptance Criteria:**
- [ ] Four traffic types with distinct visuals and behavior:
  - Truck: gray (`#616161`), 60×72 px (1.5× width), own speed 40% of scroll
  - Sedan: blue (`#1E88E5`), 40×60 px, own speed 60% of scroll, stays in lane
  - Sports car: dark red (`#B71C1C`), 36×58 px, own speed 85% of scroll, changes to adjacent lane randomly (smooth interpolation over 0.8s). Appears after 40s
  - Motorcycle: yellow (`#FFC107`), 20×48 px, own speed 70% of scroll, weaves between lanes every 1–2s. Appears after 60s
- [ ] Spawn rate scales with time:
  - 0–20s: max 2 simultaneous, 1200–1600 px interval
  - 20–40s: max 3, 800–1200 px interval
  - 40–70s: max 4, 600–900 px interval
  - 70s+: max 5, 400–700 px interval
- [ ] Type selection weighted by time: aggressive types (sports car, motorcycle) go from 0% at 0s → 15% at 30s → 35% at 60s → 60% at 90s+

#### US-005b: Graded Collision System
**Description:** As a player, I want different collision severities so that not every mistake is instant death.

**Acceptance Criteria:**
- [ ] Collision type classified by **approach direction**, not overlap percentage:
  - **Lateral collision** (player velocity primarily horizontal relative to traffic): Glancing blow — 20% scroll speed reduction for 0.8s, spark VFX
  - **Frontal collision** (player velocity primarily vertical or low relative lateral speed): Hard hit — 40% scroll speed reduction for 1.5s, -15 fuel, red flash overlay (20% opacity, 0.15s), strong screen shake (6px, 0.3s)
  - **Border collision** (car touches road edge): 30% speed reduction for 1s
  - **Fatal collision**: instant game over when scroll speed > 600 px/s AND frontal collision type
- [ ] Direction classification: if `abs(player.vx) > abs(relative_vy) * 0.5` → lateral, else → frontal. (Player actively swerving = raspão; player moving straight into traffic = frontal)
- [ ] After any collision: 1.5s invulnerability window (breathing room, prevents chain-death)
- [ ] Screen shake: glancing 2px/0.15s, frontal 6px/0.3s, fatal 10px/0.5s

#### US-007a: Fairness Constraint
**Description:** As a designer, I need to guarantee that every death is the player's fault, never the game generating an impossible situation.

**Acceptance Criteria:**
- [ ] Before spawning a new traffic wave, validate: within any vertical band of 96px (1.5× player height), there must exist a horizontal corridor of at least 60px (1.5× player width) free of obstacles
- [ ] The corridor check accounts for **projected positions** of lane-changing vehicles (sports car, motorcycle) over the next 1.0s
- [ ] If the constraint would be violated, delay the spawn until it's safe
- [ ] Edge case: trucks (60px wide) in adjacent lanes leave only 20px gap — this MUST be caught and prevented
- [ ] Verification: add a debug mode (toggle with D key) that draws the free corridors in green overlay

#### US-008a: Fuel System
**Description:** As a player, I want fuel as a ticking clock that forces me to take risks collecting refills so that sessions have a natural endpoint.

**Acceptance Criteria:**
- [ ] Initial fuel: 100 units
- [ ] Fuel consumption formula: `consumption = 2.0 + (scroll_speed / 800) * 3.0` units/second. At 200 px/s = 2.75 u/s. At 500 px/s = 3.875 u/s. At 800 px/s = 5.0 u/s. Continuous, no step functions.
- [ ] When slowed by collision, fuel consumption drops proportionally to speed reduction (death spiral mitigation — hidden mercy)
- [ ] Fuel item: green circle (`#43A047`) with subtle glow, 24px diameter
- [ ] Fuel spawns every 900–1400 px traveled (interval increases with time: +5px per second elapsed)
- [ ] Collecting fuel: +20 units at 0–59s, +18 at 60–89s, +15 at 90s+. Capped at 100 max
- [ ] Fuel items placed randomly within road bounds, with 60% chance of being in a lane adjacent to traffic (risky positioning)
- [ ] HUD: fuel bar at top, full canvas width, 4px tall, gradient green (>50%) → yellow (20–50%) → red (<20%)
- [ ] Fuel bar flashes (blink on/off every 0.3s) when below 20%
- [ ] Game over when fuel reaches 0 (cause_of_death: "fuel_empty")

#### US-009a: Scoring & Game Over Screen
**Description:** As a player, I want to earn points for distance and see my best score so that I have motivation to improve.

**Acceptance Criteria:**
- [ ] Distance score: 1 point per 10 px traveled (accumulated continuously)
- [ ] Clean overtake: +25 points when a traffic vehicle exits the bottom of the screen and the player never collided with it
- [ ] Survival bonus: +300 points every 30 seconds without collision (notification text flashes briefly)
- [ ] Score displayed at top-right: large white text with subtle drop shadow
- [ ] Game over screen shows: final score, best score, survival time, cause of death ("Fuel Empty" or "Fatal Crash")
- [ ] Best score persisted in localStorage (key: `roadrush_best_score`)
- [ ] New best score: highlight with golden flash on game over screen
- [ ] Retry on Enter key, < 300ms transition
- [ ] Explosion VFX on fatal crash: 3 concentric circles expanding + fading over 0.5s

#### US-010a: Difficulty Scaling
**Description:** As a player, I want difficulty to ramp smoothly so that each run has a dramatic arc.

**Acceptance Criteria:**
- [ ] Scroll speed: per US-002 (200 base, +5/s, soft cap 600, hard cap 800)
- [ ] Traffic density: per US-004b spawn table
- [ ] Aggressive types percentage: per US-004b
- [ ] Fuel scarcity: per US-008a (interval grows, pickup shrinks, consumption rises)
- [ ] All scaling values driven by `elapsed_seconds` — a single source of truth for difficulty
- [ ] Death spiral mitigation: collision slowdown reduces fuel consumption proportionally (US-008a)
- [ ] After collision: 1.5s local spawn pause (no new traffic spawns within 200px of player Y)

---

### Phase MVP-2: Juice & Depth

#### US-008b: Near Miss & Combo System
**Description:** As a player, I want to earn bonus points for narrowly dodging traffic so that I'm rewarded for risky play.

**Acceptance Criteria:**
- [ ] Near miss detection: when a traffic vehicle's **sprite bounding box** bottom edge passes below the player's sprite top edge (vehicle fully overtaken), calculate the minimum horizontal distance (sprite edge to sprite edge) recorded during the entire overlap period
- [ ] If minimum distance was < 20px AND no collision occurred → near miss triggered
- [ ] One near miss per vehicle, maximum (tracked per vehicle instance)
- [ ] Near miss: +50 × combo_multiplier points
- [ ] Combo multiplier starts at 1, increments by 1 for each consecutive near miss
- [ ] Combo resets to 0 on collision OR 3 seconds without a near miss
- [ ] Combo counter: appears at center-top only when combo >= 2, shows "×N" with scale-in animation, fades out 3s after last near miss (never shows "×0" or "×1")
- [ ] Near miss visual: brief white flash on the side of the near-missed vehicle

#### US-011a: Dynamic Difficulty Adjustment (DDA)
**Description:** As a designer, I want the game to subtly pressure skilled players so that every run eventually ends, but never becomes literally impossible.

**Acceptance Criteria:**
- [ ] Every 10 seconds without collision: +5% traffic spawn rate (multiplicative)
- [ ] Active near miss combo (>= 3): enemies spawn 10% closer together
- [ ] Fuel above 70%: next fuel spawns 20% further away
- [ ] **DDA cap: maximum +50% total adjustment** to any single parameter (prevents runaway)
- [ ] **DDA partial reset on collision:** reduce accumulated DDA bonuses by 50% (not full reset — player still feels pressure, but gets breathing room)
- [ ] DDA fully resets on game over
- [ ] DDA adjustments must still respect the fairness constraint (US-007a) — if DDA would create an impossible spawn, fairness wins

#### US-007b: Collectible Items (Nitro, Coins, Shield)
**Description:** As a player, I want to collect power-ups that add variety and micro-decisions to each run.

**Acceptance Criteria:**
- [ ] Nitro (yellow triangle `#FFD600`, 20px, pulsing scale animation): +30% scroll speed for 3s + invulnerability during boost. Rare spawn: every 2500–4000 px traveled
- [ ] Coins (golden circle `#FFD700`, 16px): +100 points each. Frequent: spawn in arc/cluster of 3–5 every 600–1000 px
- [ ] Shield (blue hexagon `#42A5F5`, 22px): absorbs 1 collision (any type, including fatal), then disappears. Very rare: every 5000+ px
- [ ] Item collection: player hitbox (80%) overlaps item hitbox (100%)
- [ ] Collect feedback: item scales to 120% → fades out in 0.2s, score popup (+100, +50, etc.) floats upward and fades
- [ ] Shield active indicator: subtle blue glow/border around player car sprite
- [ ] Nitro active: blue particle trail behind car (4–6 particles per frame, 0.3s life, drift downward)

#### US-012a: Visual Effects (VFX)
**Description:** As a player, I want visual feedback that makes the game feel impactful and fast so that it's satisfying without audio.

**Acceptance Criteria:**
- [ ] Speed lines: white semi-transparent vertical lines on left/right road margins when scroll speed > 500 px/s. More lines and faster at higher speeds
- [ ] Spark particles on lateral collision: 4–8 yellow/orange particles, random velocity, 0.2s life
- [ ] Red flash overlay on frontal collision: full-screen red at 20% opacity, fades over 0.15s
- [ ] Screen shake budget: lateral 2px/0.15s, frontal 6px/0.3s, fatal 10px/0.5s (decay, not constant)
- [ ] Fuel low warning: red vignette at screen edges when fuel < 20%

---

## Functional Requirements

- FR-1: Initialize Vite + vanilla JS project with HTML5 Canvas renderer at 400×700 logical resolution
- FR-2: Implement game loop with `requestAnimationFrame` and fixed timestep accumulator (1/60s step)
- FR-3: Implement FSM with states: Title, Playing, GameOver
- FR-4: Render vertically scrolling 4-lane road with lane markers, borders, and rumble strips
- FR-5: Render and control player car with keyboard (Left/Right arrows), progressive acceleration/deceleration
- FR-6: Spawn traffic vehicles (4 types) with time-based density and type weighting
- FR-7: Enforce fairness constraint: within any 96px vertical band, guarantee a 60px horizontal corridor free of current and projected obstacles
- FR-8: Classify collisions by approach direction (lateral vs frontal) and apply graded effects
- FR-9: Implement fuel with continuous consumption formula: `2.0 + (scroll_speed / 800) * 3.0` u/s
- FR-10: Spawn fuel items with time-increasing scarcity and risk-weighted positioning
- FR-11: Implement scoring: distance + clean overtake + survival bonus + near miss combo + coins
- FR-12: Render minimal HUD: score (top-right), fuel bar (top, full width), combo counter (center-top, conditional)
- FR-13: Implement game over screen with score, best score, cause of death, and instant retry
- FR-14: Persist best score in localStorage under key `roadrush_best_score`
- FR-15: Implement multi-axis difficulty scaling driven by `elapsed_seconds`
- FR-16: Implement capped unidirectional DDA with partial reset on collision
- FR-17: Implement VFX: screen shake, sparks, speed lines, red flash, fuel warning vignette
- FR-18: Fatal collision threshold: scroll speed > 600 px/s AND frontal collision type
- FR-19: Near miss detection based on minimum sprite-edge distance during full vehicle overtake
- FR-20: Collectible items: nitro (boost + invuln), coins (points), shield (absorb hit)
- FR-21: Debug mode (D key): draw fairness corridors, show hitboxes, display DDA multipliers

## Non-Goals

- No audio/SFX in this phase (added later)
- No music/soundtrack
- No touch/mobile controls (desktop keyboard only for MVP)
- No gamepad support
- No leaderboard/API integration (added in later phase)
- No PWA/service worker
- No spawn patterns library (algorithmic spawn with fairness constraint; patterns come in Difficulty phase)
- No player name input (no leaderboard yet)
- No daily challenges, skins, or post-launch features
- No ranking position hint in HUD (requires leaderboard)
- No squash/stretch car deformation (polish phase)
- No hitstop/freeze frames (polish phase)

## Technical Considerations

- **Renderer:** HTML5 Canvas 2D API — sufficient for flat 2D
- **Game Loop:** `requestAnimationFrame` with fixed timestep accumulator. Physics updates at 1/60s regardless of display refresh rate. Render interpolates between physics states for smoothness on high-refresh displays
- **Collision:** Custom AABB with 80% hitbox reduction. Classification by velocity vector direction, not overlap
- **Near Miss:** Track minimum edge-to-edge distance per vehicle during overtake window. Trigger on vehicle exit
- **State:** Simple FSM (Title → Playing → GameOver → Playing)
- **Build:** Vite + vanilla JavaScript (no TypeScript, no framework)
- **Canvas:** 400×700 logical pixels, scaled with `canvas.style` to fill viewport while preserving aspect ratio (letterbox). All game math uses logical pixels
- **Performance:** Target 60 FPS, < 16ms input latency, < 200KB bundle
- **Debug Mode:** Toggle with D key. Shows hitboxes (red outlines), fairness corridors (green fill), DDA values (text overlay), fuel consumption rate

## Success Metrics

- Core loop is playable and fun after MVP-0 (before adding fuel or scoring)
- Average session length between 45–120 seconds (measured after MVP-1)
- Retry rate > 80% (players play 3+ runs)
- Near miss accounts for > 40% of total score for skilled players (measured after MVP-2)
- Time from game over to next run < 300ms
- Stable 60 FPS on Chrome/Firefox/Safari desktop
- Zero "unfair" deaths verified via debug mode fairness corridor visualization
- DDA never pushes difficulty beyond fairness constraint

## Open Questions

- Should the 4 Acts (GDD Section 6.2) have explicit visual cues (e.g., background color darkening with time)?
- Coin cluster shape: straight line, arc, or zigzag?
- Should the debug mode be available in production builds (hidden) or dev-only?
