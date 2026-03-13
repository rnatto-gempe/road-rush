// Road Rush - Main Game Entry Point

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 700;
const FIXED_DT = 1 / 60; // Fixed timestep: 60 FPS

// Road constants
const ROAD_LEFT = 40;
const ROAD_RIGHT = 360;
const ROAD_WIDTH = 320;
const LANE_WIDTH = 80;
const LANE_COUNT = 4;

const INITIAL_SCROLL_SPEED = 200; // px/s

// Player constants
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 64;
const PLAYER_Y = 560;
const PLAYER_ACCEL = 1200; // px/s²
const PLAYER_DECEL = 1800; // px/s²
const PLAYER_MAX_SPEED = 400; // px/s

// Screen shake constants
const SHAKE_DURATION = 0.5; // seconds
const SHAKE_INTENSITY = 10; // max px offset

// Graded collision constants
const INVULN_DURATION = 1.5; // seconds of invulnerability after any collision
const BLINK_INTERVAL = 0.1; // seconds per blink toggle during invulnerability

// ─── Difficulty Config (single source of truth for all tunable difficulty params) ───
const DIFFICULTY = {
  speed: {
    initial: 200,          // px/s starting scroll speed
    phase1Cap: 600,        // px/s cap before phase 2 kicks in
    phase1Rate: 5,         // px/s gained per elapsed second (phase 1)
    phase2Rate: 1.5,       // px/s gained per fixed-dt tick (phase 2)
    max: 800,              // px/s hard cap
  },
  traffic: {
    // Each tier active until untilTime; last tier is the 70s+ tier
    tiers: [
      { untilTime: 20,       maxCount: 2, spawnMin: 1200, spawnMax: 1600 },
      { untilTime: 40,       maxCount: 3, spawnMin: 800,  spawnMax: 1200 },
      { untilTime: 70,       maxCount: 4, spawnMin: 600,  spawnMax: 900  },
      { untilTime: Infinity, maxCount: 5, spawnMin: 400,  spawnMax: 700  },
    ],
    // Aggressive-type weight curve (interpolated between these knots)
    aggressiveWeights: [
      { time: 0,  weight: 0.00 },
      { time: 30, weight: 0.15 },
      { time: 60, weight: 0.35 },
      { time: 90, weight: 0.60 },
    ],
    spawnPauseDuration: 1.5, // seconds after any collision with no new spawns
    spawnPauseZone: 200,     // px above/below player Y counted as "close"
  },
  fuel: {
    initial: 100,
    drainBase: 2.0,          // units/s base drain
    drainSpeed: 3.0,         // extra units/s at max speed (800 px/s)
    spawnBaseMin: 900,        // px traveled min spawn interval
    spawnBaseMax: 1400,       // px traveled max spawn interval
    spawnIntervalGrowth: 5,   // extra px per elapsed second (scarcity ramp)
    // Pickup amount decreases as run progresses
    collectTiers: [
      { untilTime: 60,       amount: 20 },
      { untilTime: 90,       amount: 18 },
      { untilTime: Infinity, amount: 15 },
    ],
  },
};

// Scroll speed ramp constants (aliases to DIFFICULTY for backward compat)
const SPEED_RAMP_PHASE1_CAP  = DIFFICULTY.speed.phase1Cap;
const SPEED_RAMP_PHASE1_RATE = DIFFICULTY.speed.phase1Rate;
const SPEED_RAMP_PHASE2_RATE = DIFFICULTY.speed.phase2Rate;
const SPEED_MAX              = DIFFICULTY.speed.max;

// Fuel system constants (aliases to DIFFICULTY where applicable)
const FUEL_INITIAL              = DIFFICULTY.fuel.initial;
const FUEL_DRAIN_BASE           = DIFFICULTY.fuel.drainBase;
const FUEL_DRAIN_SPEED          = DIFFICULTY.fuel.drainSpeed;
const FUEL_ITEM_RADIUS          = 12;   // 24px diameter fuel circle
const FUEL_SPAWN_BASE_MIN       = DIFFICULTY.fuel.spawnBaseMin;
const FUEL_SPAWN_BASE_MAX       = DIFFICULTY.fuel.spawnBaseMax;
const FUEL_SPAWN_INTERVAL_GROWTH = DIFFICULTY.fuel.spawnIntervalGrowth;
const FUEL_COLLECT_ANIM_DURATION = 0.2;

// Scoring constants
const SCORE_PER_PX = 0.1;       // 1 point per 10 px traveled
const OVERTAKE_BONUS = 25;       // points for clean overtake
const SURVIVOR_BONUS = 300;      // points every 30s without collision
const SURVIVOR_INTERVAL = 30;    // seconds between survivor bonuses
const SCORE_LERP_RATE = 8;       // display score lerp speed

// Lane change duration (seconds) for lane-changing vehicles
const LANE_CHANGE_DURATION = 0.8;

// Vehicle type definitions
const VEHICLE_TYPES = {
  sedan: {
    color: '#1E88E5',
    width: 40,
    height: 60,
    speedRatio: 0.6,
    minTime: 0,
    behavior: 'none',
  },
  truck: {
    color: '#616161',
    width: 60,
    height: 72,
    speedRatio: 0.4,
    minTime: 0,
    behavior: 'none',
  },
  sports: {
    color: '#B71C1C',
    width: 36,
    height: 58,
    speedRatio: 0.85,
    minTime: 40,
    behavior: 'laneChange',
    laneChangeMin: 2,
    laneChangeMax: 4,
  },
  moto: {
    color: '#FFC107',
    width: 20,
    height: 48,
    speedRatio: 0.7,
    minTime: 60,
    behavior: 'weave',
    laneChangeMin: 1,
    laneChangeMax: 2,
  },
};

// Debug mode
let debugMode = false;

// Survivor flash text state
let survivorFlash = null; // {timer: 2.0} when active

// Graded collision state
let speedPenaltyMultiplier = 1.0; // multiplicative speed reduction factor (1.0 = no penalty)
let speedPenaltyTimer = 0;        // remaining seconds for speed penalty
let invulnTimer = 0;              // remaining invulnerability seconds after collision
let redFlash = { alpha: 0 };      // frontal hit red flash overlay state
const particles = [];             // spark particles

// Post-collision spawn pause (US-014)
let spawnPauseTimer = 0; // seconds remaining in spawn suppression window

// Dash pattern constants
const DASH_LENGTH = 30;
const DASH_GAP = 20;
const DASH_PERIOD = DASH_LENGTH + DASH_GAP;

// Rumble strip constants
const RUMBLE_SEGMENT = 20; // each color block height
const RUMBLE_PERIOD = RUMBLE_SEGMENT * 2; // red + white

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Set logical resolution
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Letterbox scaling - preserves aspect ratio
function resizeCanvas() {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const targetAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
  const windowAspect = windowWidth / windowHeight;

  let displayWidth, displayHeight;

  if (windowAspect > targetAspect) {
    displayHeight = windowHeight;
    displayWidth = windowHeight * targetAspect;
  } else {
    displayWidth = windowWidth;
    displayHeight = windowWidth / targetAspect;
  }

  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Input tracking ---
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

// Track single key presses (consumed on read)
const justPressed = {};
window.addEventListener('keydown', (e) => {
  if (!e.repeat) justPressed[e.key] = true;
});

function consumeKey(key) {
  if (justPressed[key]) {
    justPressed[key] = false;
    return true;
  }
  return false;
}

// --- FSM ---
const fsm = {
  currentState: null,

  transition(newState) {
    if (this.currentState && this.currentState.onExit) {
      this.currentState.onExit();
    }
    this.currentState = newState;
    if (this.currentState.onEnter) {
      this.currentState.onEnter();
    }
  },

  update(dt) {
    if (this.currentState && this.currentState.update) {
      this.currentState.update(dt);
    }
  },

  render(ctx) {
    if (this.currentState && this.currentState.render) {
      this.currentState.render(ctx);
    }
  },
};

// --- Screen Shake ---
const shake = { time: 0, intensity: SHAKE_INTENSITY };

function triggerShake(duration, intensity) {
  if (duration !== undefined) {
    // Custom shake: borrow the shake object but track separately
    shake.time = duration;
    shake.intensity = intensity !== undefined ? intensity : SHAKE_INTENSITY;
  } else {
    shake.time = SHAKE_DURATION;
    shake.intensity = SHAKE_INTENSITY;
  }
}

// Returns scroll speed with active penalty applied
function getEffectiveScrollSpeed() {
  return gameState.scrollSpeed * speedPenaltyMultiplier;
}

// Apply a multiplicative speed penalty; overwrites if the new penalty is stronger
function applySpeedPenalty(factor, duration) {
  if (factor < speedPenaltyMultiplier || speedPenaltyTimer <= 0) {
    speedPenaltyMultiplier = factor;
    speedPenaltyTimer = duration;
  }
}

// Spawn spark particles at (x, y), count 4-8
function spawnSparks(x, y, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() * 2 - 1) * 180,
      vy: (Math.random() * 2 - 1) * 120,
      life: 0.2,
      maxLife: 0.2,
      color: Math.random() < 0.5 ? '#FFC107' : '#FF6F00',
      size: 2 + Math.random() * 3,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function renderParticles(ctx) {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Handle a vehicle collision — classify lateral vs frontal, apply graded effects
function handleVehicleCollision(v) {
  const player = gameState.player;
  const relativeVy = getEffectiveScrollSpeed() - v.ownSpeed; // approach speed on screen
  const isLateral = Math.abs(player.vx) > Math.abs(relativeVy) * 0.5;

  // Spark position: center of the overlap area
  const sparkX = player.x + PLAYER_WIDTH / 2;
  const sparkY = player.y + PLAYER_HEIGHT / 2;

  // Tag vehicle as collided (disqualifies from clean overtake bonus)
  v.collided = true;
  // Any collision resets survivor timer
  gameState.survivorTimer = 0;

  if (isLateral) {
    // Glancing blow: 20% speed reduction 0.8s + yellow sparks
    applySpeedPenalty(0.8, 0.8);
    spawnSparks(sparkX, sparkY, 4 + Math.floor(Math.random() * 5));
  } else {
    // Frontal: fatal at speed > 600, else 40% reduction 1.5s + red flash + shake
    if (gameState.scrollSpeed > 600) {
      triggerShake();
      gameOverState.causeOfDeath = '';
      fsm.transition(gameOverState);
      return;
    }
    applySpeedPenalty(0.6, 1.5);
    redFlash.alpha = 0.2;
    triggerShake(0.3, 6);
  }

  // Start invulnerability window + spawn pause
  invulnTimer = INVULN_DURATION;
  spawnPauseTimer = DIFFICULTY.traffic.spawnPauseDuration;
}

// --- Game State (shared) ---
const gameState = {
  elapsedTime: 0,
  distanceTraveled: 0,
  scrollSpeed: INITIAL_SCROLL_SPEED,
  scrollOffset: 0,
  player: {
    x: ROAD_LEFT + ROAD_WIDTH / 2 - PLAYER_WIDTH / 2,
    y: PLAYER_Y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    vx: 0,
  },
  traffic: [],
  nextSpawnDistance: 1200,
  // Fuel system
  fuel: FUEL_INITIAL,
  fuelItems: [],
  nextFuelSpawnDistance: FUEL_SPAWN_BASE_MIN,
  // Scoring
  score: 0,
  displayedScore: 0,
  survivorTimer: 0,
};

function resetGameState() {
  gameState.elapsedTime = 0;
  gameState.distanceTraveled = 0;
  gameState.scrollSpeed = INITIAL_SCROLL_SPEED;
  gameState.scrollOffset = 0;
  gameState.player.x = ROAD_LEFT + ROAD_WIDTH / 2 - PLAYER_WIDTH / 2;
  gameState.player.y = PLAYER_Y;
  gameState.player.vx = 0;
  gameState.traffic = [];
  // Use t=0 spawn config: min=1200, max=1600
  gameState.nextSpawnDistance = 1200 + Math.random() * 400;
  // Reset collision state
  speedPenaltyMultiplier = 1.0;
  speedPenaltyTimer = 0;
  invulnTimer = 0;
  redFlash.alpha = 0;
  particles.length = 0;
  spawnPauseTimer = 0;
  // Reset fuel state
  gameState.fuel = FUEL_INITIAL;
  gameState.fuelItems = [];
  gameState.nextFuelSpawnDistance = FUEL_SPAWN_BASE_MIN + Math.random() * (FUEL_SPAWN_BASE_MAX - FUEL_SPAWN_BASE_MIN);
  // Reset scoring
  gameState.score = 0;
  gameState.displayedScore = 0;
  gameState.survivorTimer = 0;
  survivorFlash = null;
}

// --- Scroll Speed Ramp ---
function updateScrollSpeed(dt) {
  if (gameState.scrollSpeed < SPEED_RAMP_PHASE1_CAP) {
    // Phase 1: formula-driven from elapsed time
    gameState.scrollSpeed = Math.min(
      INITIAL_SCROLL_SPEED + gameState.elapsedTime * SPEED_RAMP_PHASE1_RATE,
      SPEED_RAMP_PHASE1_CAP
    );
  } else {
    // Phase 2: incremental ramp
    gameState.scrollSpeed = Math.min(gameState.scrollSpeed + SPEED_RAMP_PHASE2_RATE * dt, SPEED_MAX);
  }

  // Tick speed penalty timer
  if (speedPenaltyTimer > 0) {
    speedPenaltyTimer = Math.max(0, speedPenaltyTimer - dt);
    if (speedPenaltyTimer === 0) speedPenaltyMultiplier = 1.0;
  }
}

// --- Road Rendering ---
function renderRoad(ctx, scrollOffset) {
  // Asphalt background with vertical gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#1A1A2E');
  gradient.addColorStop(1, '#16213E');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Rumble strips (left and right margins)
  const rumbleOffset = scrollOffset % RUMBLE_PERIOD;
  for (let side = 0; side < 2; side++) {
    const stripX = side === 0 ? 0 : ROAD_RIGHT;
    const stripW = ROAD_LEFT; // 40px

    // Draw segments from above screen to below
    let y = -rumbleOffset;
    let colorIndex = 0;
    while (y < CANVAS_HEIGHT) {
      ctx.fillStyle = colorIndex % 2 === 0 ? '#E53935' : '#FFFFFF';
      ctx.fillRect(stripX, y, stripW, RUMBLE_SEGMENT);
      y += RUMBLE_SEGMENT;
      colorIndex++;
    }
  }

  // Road surface (asphalt, re-drawn on top of rumble edges)
  const roadGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  roadGradient.addColorStop(0, '#2A2A3E');
  roadGradient.addColorStop(1, '#26314E');
  ctx.fillStyle = roadGradient;
  ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, CANVAS_HEIGHT);

  // White border lines
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ROAD_LEFT, 0);
  ctx.lineTo(ROAD_LEFT, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ROAD_RIGHT, 0);
  ctx.lineTo(ROAD_RIGHT, CANVAS_HEIGHT);
  ctx.stroke();

  // Dashed lane markers between 4 lanes (3 markers)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([DASH_LENGTH, DASH_GAP]);
  const dashScrollOffset = scrollOffset % DASH_PERIOD;

  for (let i = 1; i < LANE_COUNT; i++) {
    const laneX = ROAD_LEFT + i * LANE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(laneX, -dashScrollOffset);
    ctx.lineTo(laneX, CANVAS_HEIGHT + DASH_PERIOD);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

// --- Player ---
function getPlayerHitbox(player) {
  return {
    x: player.x + 4,
    y: player.y + 6.5,
    w: 32,
    h: 51,
  };
}

function updatePlayer(dt) {
  const player = gameState.player;
  const left = keys['ArrowLeft'];
  const right = keys['ArrowRight'];

  if (left && !right) {
    player.vx -= PLAYER_ACCEL * dt;
    if (player.vx < -PLAYER_MAX_SPEED) player.vx = -PLAYER_MAX_SPEED;
  } else if (right && !left) {
    player.vx += PLAYER_ACCEL * dt;
    if (player.vx > PLAYER_MAX_SPEED) player.vx = PLAYER_MAX_SPEED;
  } else {
    if (player.vx > 0) {
      player.vx -= PLAYER_DECEL * dt;
      if (player.vx < 0) player.vx = 0;
    } else if (player.vx < 0) {
      player.vx += PLAYER_DECEL * dt;
      if (player.vx > 0) player.vx = 0;
    }
  }

  player.x += player.vx * dt;

  // Constrain within road borders — detect border collision
  let borderHit = false;
  if (player.x < ROAD_LEFT) {
    player.x = ROAD_LEFT;
    if (player.vx < 0) { player.vx = 0; borderHit = true; }
  }
  if (player.x + PLAYER_WIDTH > ROAD_RIGHT) {
    player.x = ROAD_RIGHT - PLAYER_WIDTH;
    if (player.vx > 0) { player.vx = 0; borderHit = true; }
  }

  if (borderHit && invulnTimer <= 0) {
    applySpeedPenalty(0.7, 1.0); // 30% speed reduction for 1s
    invulnTimer = INVULN_DURATION;
    spawnPauseTimer = DIFFICULTY.traffic.spawnPauseDuration;
    gameState.survivorTimer = 0;
  }
}

function renderPlayer(ctx, player) {
  // Blink every BLINK_INTERVAL seconds during invulnerability
  if (invulnTimer > 0) {
    const blinkPhase = Math.floor(invulnTimer / BLINK_INTERVAL) % 2;
    if (blinkPhase === 1) return; // skip rendering this blink frame
  }

  const { x, y, width, height } = player;

  // Car body
  ctx.fillStyle = '#E53935';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.fill();

  // Windshield
  ctx.fillStyle = 'rgba(100, 180, 255, 0.6)';
  ctx.fillRect(x + 6, y + 8, width - 12, 16);

  // Rear window
  ctx.fillRect(x + 6, y + height - 22, width - 12, 12);
}

// --- Traffic System ---
function getVehicleHitbox(v) {
  const hbW = v.width * 0.8;
  const hbH = v.height * 0.8;
  return {
    x: v.x + (v.width - hbW) / 2,
    y: v.y + (v.height - hbH) / 2,
    w: hbW,
    h: hbH,
  };
}

function aabbOverlap(a, b) {
  return !(
    a.x + a.w < b.x ||
    a.x > b.x + b.w ||
    a.y + a.h < b.y ||
    a.y > b.y + b.h
  );
}

// --- Fairness constraint (US-009) ---

// Returns {minX, maxX} X extent of vehicle, accounting for projected lane changes over lookAheadS seconds
function getVehicleXExtent(v, lookAheadS) {
  let minX = v.x;
  let maxX = v.x + v.width;

  if (v.laneChanging) {
    minX = Math.min(minX, v.laneChanging.targetX);
    maxX = Math.max(maxX, v.laneChanging.targetX + v.width);
  }

  const type = VEHICLE_TYPES[v.type];
  if (type.behavior !== 'none' && v.laneChangeTimer !== Infinity && v.laneChangeTimer <= lookAheadS) {
    if (type.behavior === 'laneChange') {
      for (const adj of [v.lane - 1, v.lane + 1]) {
        if (adj >= 0 && adj < LANE_COUNT) {
          const tx = ROAD_LEFT + adj * LANE_WIDTH + (LANE_WIDTH - v.width) / 2;
          minX = Math.min(minX, tx);
          maxX = Math.max(maxX, tx + v.width);
        }
      }
    } else {
      // Weave (moto) — can reach any lane
      minX = ROAD_LEFT;
      maxX = ROAD_RIGHT;
    }
  }

  return { minX, maxX };
}

// Find the largest free horizontal gap in [roadLeft, roadRight] given occupied segments
function findLargestGap(occupied, roadLeft, roadRight) {
  if (occupied.length === 0) return roadRight - roadLeft;
  const sorted = [...occupied].sort((a, b) => a.left - b.left);
  let maxGap = 0;
  let cursor = roadLeft;
  for (const seg of sorted) {
    if (seg.left > cursor) maxGap = Math.max(maxGap, seg.left - cursor);
    if (seg.right > cursor) cursor = seg.right;
  }
  if (roadRight > cursor) maxGap = Math.max(maxGap, roadRight - cursor);
  return maxGap;
}

// Check if spawning candidate would violate fairness constraint.
// Returns true if safe to spawn (60px corridor exists in every 96px vertical band).
function isFairToSpawn(candidate) {
  const CORRIDOR_MIN = 60;
  const BAND_HEIGHT = 96;
  const LOOK_AHEAD = 1.0;

  for (let bandTop = -BAND_HEIGHT; bandTop < CANVAS_HEIGHT; bandTop += BAND_HEIGHT / 2) {
    const bandBottom = bandTop + BAND_HEIGHT;
    const occupied = [];

    for (const v of gameState.traffic) {
      if (v.y < bandBottom && v.y + v.height > bandTop) {
        const { minX, maxX } = getVehicleXExtent(v, LOOK_AHEAD);
        occupied.push({
          left: Math.max(ROAD_LEFT, minX),
          right: Math.min(ROAD_RIGHT, maxX),
        });
      }
    }

    if (candidate.y < bandBottom && candidate.y + candidate.height > bandTop) {
      occupied.push({ left: candidate.x, right: candidate.x + candidate.width });
    }

    if (findLargestGap(occupied, ROAD_LEFT, ROAD_RIGHT) < CORRIDOR_MIN) return false;
  }

  return true;
}

// Draw free corridor overlays for debug mode
function renderFairnessDebug(ctx) {
  const BAND_HEIGHT = 96;
  const CORRIDOR_MIN = 60;
  const LOOK_AHEAD = 1.0;

  for (let bandTop = 0; bandTop < CANVAS_HEIGHT; bandTop += BAND_HEIGHT) {
    const bandBottom = bandTop + BAND_HEIGHT;
    const occupied = [];

    for (const v of gameState.traffic) {
      if (v.y < bandBottom && v.y + v.height > bandTop) {
        const { minX, maxX } = getVehicleXExtent(v, LOOK_AHEAD);
        occupied.push({ left: Math.max(ROAD_LEFT, minX), right: Math.min(ROAD_RIGHT, maxX) });
      }
    }

    const sorted = [...occupied].sort((a, b) => a.left - b.left);
    let cursor = ROAD_LEFT;

    const drawGap = (gapLeft, gapRight) => {
      const w = gapRight - gapLeft;
      if (w > 0) {
        ctx.fillStyle = w >= CORRIDOR_MIN ? 'rgba(0, 255, 0, 0.25)' : 'rgba(255, 0, 0, 0.25)';
        ctx.fillRect(gapLeft, bandTop + 2, w, BAND_HEIGHT - 4);
      }
    };

    for (const seg of sorted) {
      if (seg.left > cursor) drawGap(cursor, seg.left);
      if (seg.right > cursor) cursor = seg.right;
    }
    if (cursor < ROAD_RIGHT) drawGap(cursor, ROAD_RIGHT);
  }
}

// Returns spawn config based on elapsed time (reads from DIFFICULTY config)
function getSpawnConfig(elapsed) {
  for (const tier of DIFFICULTY.traffic.tiers) {
    if (elapsed < tier.untilTime) {
      return { maxCount: tier.maxCount, spawnMin: tier.spawnMin, spawnMax: tier.spawnMax };
    }
  }
  const last = DIFFICULTY.traffic.tiers[DIFFICULTY.traffic.tiers.length - 1];
  return { maxCount: last.maxCount, spawnMin: last.spawnMin, spawnMax: last.spawnMax };
}

// Returns probability of picking an aggressive (lane-changing) vehicle type
function getAggressiveWeight(elapsed) {
  if (elapsed <= 0) return 0;
  if (elapsed <= 30) return 0.15 * (elapsed / 30);
  if (elapsed <= 60) return 0.15 + 0.20 * ((elapsed - 30) / 30);
  if (elapsed <= 90) return 0.35 + 0.25 * ((elapsed - 60) / 30);
  return 0.60;
}

function chooseVehicleType(elapsed) {
  const available = Object.entries(VEHICLE_TYPES).filter(([, t]) => elapsed >= t.minTime);
  const aggressive = available.filter(([, t]) => t.behavior !== 'none');
  const passive = available.filter(([, t]) => t.behavior === 'none');

  let pool;
  if (aggressive.length > 0 && Math.random() < getAggressiveWeight(elapsed)) {
    pool = aggressive;
  } else {
    pool = passive;
  }

  const [typeName] = pool[Math.floor(Math.random() * pool.length)];
  return typeName;
}

function buildVehicleCandidate() {
  const elapsed = gameState.elapsedTime;
  const typeName = chooseVehicleType(elapsed);
  const type = VEHICLE_TYPES[typeName];
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const x = ROAD_LEFT + lane * LANE_WIDTH + (LANE_WIDTH - type.width) / 2;
  return { typeName, type, lane, x, y: -type.height, width: type.width, height: type.height };
}

function spawnVehicle(candidate) {
  gameState.traffic.push({
    type: candidate.typeName,
    x: candidate.x,
    y: candidate.y,
    lane: candidate.lane,
    width: candidate.width,
    height: candidate.height,
    ownSpeed: gameState.scrollSpeed * candidate.type.speedRatio,
    // Timer until next lane change (Infinity for non-changers)
    laneChangeTimer: candidate.type.behavior !== 'none'
      ? candidate.type.laneChangeMin + Math.random() * (candidate.type.laneChangeMax - candidate.type.laneChangeMin)
      : Infinity,
    laneChanging: null, // {startX, targetX, progress} while changing
    collided: false, // true if player hit this vehicle (tracks overtake bonus)
  });
}

function updateTraffic(dt) {
  const elapsed = gameState.elapsedTime;
  const { maxCount, spawnMin, spawnMax } = getSpawnConfig(elapsed);

  // Tick spawn pause timer
  if (spawnPauseTimer > 0) spawnPauseTimer = Math.max(0, spawnPauseTimer - dt);

  // Try spawning — only if fairness constraint is satisfied and not in spawn pause
  if (
    spawnPauseTimer <= 0 &&
    gameState.traffic.length < maxCount &&
    gameState.distanceTraveled >= gameState.nextSpawnDistance
  ) {
    const candidate = buildVehicleCandidate();
    if (isFairToSpawn(candidate)) {
      spawnVehicle(candidate);
      gameState.nextSpawnDistance =
        gameState.distanceTraveled + spawnMin + Math.random() * (spawnMax - spawnMin);
    }
    // If not fair, skip this frame — will retry next frame with a fresh candidate
  }

  // Update each vehicle
  for (const v of gameState.traffic) {
    const type = VEHICLE_TYPES[v.type];
    const visualSpeed = getEffectiveScrollSpeed() - v.ownSpeed;
    v.y += visualSpeed * dt;

    // Lane-change behavior for sports car and motorcycle
    if (type.behavior !== 'none') {
      if (v.laneChanging) {
        // Continue active lane change using smoothstep
        v.laneChanging.progress += dt / LANE_CHANGE_DURATION;
        if (v.laneChanging.progress >= 1) {
          v.x = v.laneChanging.targetX;
          v.laneChanging = null;
          v.laneChangeTimer =
            type.laneChangeMin + Math.random() * (type.laneChangeMax - type.laneChangeMin);
        } else {
          const t = v.laneChanging.progress;
          const smooth = t * t * (3 - 2 * t); // smoothstep
          v.x = v.laneChanging.startX + (v.laneChanging.targetX - v.laneChanging.startX) * smooth;
        }
      } else {
        v.laneChangeTimer -= dt;
        if (v.laneChangeTimer <= 0) {
          let newLane;
          if (type.behavior === 'laneChange') {
            // Sports car: adjacent lane only
            const candidates = [];
            if (v.lane > 0) candidates.push(v.lane - 1);
            if (v.lane < LANE_COUNT - 1) candidates.push(v.lane + 1);
            newLane = candidates[Math.floor(Math.random() * candidates.length)];
          } else {
            // Motorcycle: any other lane
            const candidates = [];
            for (let i = 0; i < LANE_COUNT; i++) {
              if (i !== v.lane) candidates.push(i);
            }
            newLane = candidates[Math.floor(Math.random() * candidates.length)];
          }

          const targetX = ROAD_LEFT + newLane * LANE_WIDTH + (LANE_WIDTH - v.width) / 2;
          v.laneChanging = { startX: v.x, targetX, progress: 0 };
          v.lane = newLane;
        }
      }
    }
  }

  // Remove vehicles that have scrolled past the bottom; award clean overtake bonus
  gameState.traffic = gameState.traffic.filter((v) => {
    if (v.y > 760) {
      if (!v.collided) gameState.score += OVERTAKE_BONUS;
      return false;
    }
    return true;
  });
}

function renderTraffic(ctx) {
  for (const v of gameState.traffic) {
    if (v.type === 'truck') {
      ctx.fillStyle = '#616161';
      ctx.beginPath();
      ctx.roundRect(v.x, v.y, v.width, v.height, 4);
      ctx.fill();
      // Cab windows
      ctx.fillStyle = 'rgba(100, 180, 255, 0.5)';
      ctx.fillRect(v.x + 8, v.y + 8, v.width - 16, 18);
      ctx.fillRect(v.x + 8, v.y + v.height - 22, v.width - 16, 12);
    } else if (v.type === 'sedan') {
      ctx.fillStyle = '#1E88E5';
      ctx.fillRect(v.x, v.y, v.width, v.height);
      ctx.fillStyle = 'rgba(100, 180, 255, 0.6)';
      ctx.fillRect(v.x + 5, v.y + 6, v.width - 10, 14);
      ctx.fillRect(v.x + 5, v.y + v.height - 18, v.width - 10, 10);
    } else if (v.type === 'sports') {
      // Sleek dark-red with large windows
      ctx.fillStyle = '#B71C1C';
      ctx.beginPath();
      ctx.roundRect(v.x, v.y, v.width, v.height, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(100, 180, 255, 0.5)';
      ctx.fillRect(v.x + 4, v.y + 7, v.width - 8, 12);
      ctx.fillRect(v.x + 4, v.y + v.height - 17, v.width - 8, 10);
    } else if (v.type === 'moto') {
      // Narrow yellow motorcycle
      ctx.fillStyle = '#FFC107';
      ctx.fillRect(v.x, v.y, v.width, v.height);
      // Rider silhouette
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(v.x + 3, v.y + 12, v.width - 6, 20);
    }
  }
}

// --- Fuel System ---

// Fuel pickup amount decreases over time (reads from DIFFICULTY config)
function getFuelCollectAmount(elapsed) {
  for (const tier of DIFFICULTY.fuel.collectTiers) {
    if (elapsed < tier.untilTime) return tier.amount;
  }
  return DIFFICULTY.fuel.collectTiers[DIFFICULTY.fuel.collectTiers.length - 1].amount;
}

// Spawn a fuel item; 60% chance in a lane adjacent to an existing traffic vehicle
function spawnFuelItem() {
  const elapsed = gameState.elapsedTime;
  let lane;
  if (gameState.traffic.length > 0 && Math.random() < 0.6) {
    const v = gameState.traffic[Math.floor(Math.random() * gameState.traffic.length)];
    const adj = [];
    if (v.lane > 0) adj.push(v.lane - 1);
    if (v.lane < LANE_COUNT - 1) adj.push(v.lane + 1);
    lane = adj.length > 0
      ? adj[Math.floor(Math.random() * adj.length)]
      : Math.floor(Math.random() * LANE_COUNT);
  } else {
    lane = Math.floor(Math.random() * LANE_COUNT);
  }

  const x = ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
  gameState.fuelItems.push({ x, y: -FUEL_ITEM_RADIUS, collectAnim: null });

  // Spawn interval grows with elapsed (scarcity ramp)
  const intervalMin = FUEL_SPAWN_BASE_MIN + elapsed * FUEL_SPAWN_INTERVAL_GROWTH;
  const intervalMax = FUEL_SPAWN_BASE_MAX + elapsed * FUEL_SPAWN_INTERVAL_GROWTH;
  gameState.nextFuelSpawnDistance = gameState.distanceTraveled + intervalMin + Math.random() * (intervalMax - intervalMin);
}

function updateFuelItems(dt) {
  const elapsed = gameState.elapsedTime;
  const effSpeed = getEffectiveScrollSpeed();

  // Spawn when threshold reached
  if (gameState.distanceTraveled >= gameState.nextFuelSpawnDistance) {
    spawnFuelItem();
  }

  const ph = getPlayerHitbox(gameState.player);

  for (let i = gameState.fuelItems.length - 1; i >= 0; i--) {
    const item = gameState.fuelItems[i];

    if (item.collectAnim !== null) {
      item.collectAnim.timer -= dt;
      if (item.collectAnim.timer <= 0) gameState.fuelItems.splice(i, 1);
      continue;
    }

    // Fuel items are road-fixed: scroll at effective scroll speed (own speed = 0)
    item.y += effSpeed * dt;

    if (item.y > CANVAS_HEIGHT + FUEL_ITEM_RADIUS) {
      gameState.fuelItems.splice(i, 1);
      continue;
    }

    // Collection check: 100% hitbox (full diameter square)
    const itemHb = {
      x: item.x - FUEL_ITEM_RADIUS,
      y: item.y - FUEL_ITEM_RADIUS,
      w: FUEL_ITEM_RADIUS * 2,
      h: FUEL_ITEM_RADIUS * 2,
    };
    if (aabbOverlap(ph, itemHb)) {
      const fuelAdd = getFuelCollectAmount(elapsed);
      gameState.fuel = Math.min(FUEL_INITIAL, gameState.fuel + fuelAdd);
      item.collectAnim = { timer: FUEL_COLLECT_ANIM_DURATION };
    }
  }
}

function renderFuelItems(ctx) {
  for (const item of gameState.fuelItems) {
    let scale = 1;
    let alpha = 1;
    if (item.collectAnim !== null) {
      const progress = 1 - item.collectAnim.timer / FUEL_COLLECT_ANIM_DURATION;
      scale = 1 + 0.2 * progress;
      alpha = 1 - progress;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(item.x, item.y);
    ctx.scale(scale, scale);

    // Glow aura
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, FUEL_ITEM_RADIUS * 2);
    glow.addColorStop(0, 'rgba(67, 160, 71, 0.5)');
    glow.addColorStop(1, 'rgba(67, 160, 71, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, FUEL_ITEM_RADIUS * 2, 0, Math.PI * 2);
    ctx.fill();

    // Main circle
    ctx.fillStyle = '#43A047';
    ctx.beginPath();
    ctx.arc(0, 0, FUEL_ITEM_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // "F" label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', 0, 0);

    ctx.restore();
  }
}

// --- Fuel HUD ---
function renderFuelHUD(ctx) {
  const fuelPct = gameState.fuel / FUEL_INITIAL;
  const lowFuel = fuelPct < 0.2;

  // Blink bar on/off every 0.3s when below 20%
  const blinkOff = lowFuel && Math.floor(gameState.elapsedTime / 0.3) % 2 === 1;

  if (!blinkOff) {
    const barColor = fuelPct > 0.5 ? '#43A047' : fuelPct > 0.2 ? '#FFC107' : '#E53935';
    ctx.fillStyle = barColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH * fuelPct, 4);
  }

  // Red vignette at screen edges when fuel < 20%
  if (lowFuel) {
    const vignette = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.3,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.9
    );
    vignette.addColorStop(0, 'rgba(229, 57, 53, 0)');
    vignette.addColorStop(1, 'rgba(229, 57, 53, 0.25)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
}

// --- Score HUD ---
function renderScoreHUD(ctx) {
  const scoreStr = Math.floor(gameState.displayedScore).toString();

  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(scoreStr, CANVAS_WIDTH - 6, 10);
  // Main score
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(scoreStr, CANVAS_WIDTH - 8, 8);

  // Survivor flash
  if (survivorFlash !== null) {
    ctx.globalAlpha = Math.min(1, survivorFlash.timer) * Math.min(1, survivorFlash.timer / 0.3);
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFC107';
    ctx.fillText('SURVIVOR +300', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);
    ctx.globalAlpha = 1;
  }
}

// --- Title State ---
const titleState = {
  pulseTime: 0,

  onEnter() {
    this.pulseTime = 0;
  },

  update(dt) {
    this.pulseTime += dt;
    if (consumeKey('Enter')) {
      resetGameState();
      fsm.transition(playingState);
    }
  },

  render(ctx) {
    // Background
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Title text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Road Rush', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);

    // Pulsing "Press Enter to Start"
    const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.pulseTime * 3));
    ctx.globalAlpha = alpha;
    ctx.font = '20px monospace';
    ctx.fillText('Press Enter to Start', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
    ctx.globalAlpha = 1;
  },
};

// --- Playing State ---
const playingState = {
  onEnter() {
    // Future stories will initialize game objects here
  },

  update(dt) {
    gameState.elapsedTime += dt;
    updateScrollSpeed(dt);
    const effSpeed = getEffectiveScrollSpeed();
    gameState.scrollOffset += effSpeed * dt;
    gameState.distanceTraveled += effSpeed * dt;

    if (consumeKey('d') || consumeKey('D')) debugMode = !debugMode;

    updatePlayer(dt);
    updateTraffic(dt);
    updateFuelItems(dt);
    updateParticles(dt);

    // Distance score: 1 pt per 10 px traveled
    gameState.score += effSpeed * dt * SCORE_PER_PX;

    // Survivor bonus: +300 every 30s without collision
    gameState.survivorTimer += dt;
    if (gameState.survivorTimer >= SURVIVOR_INTERVAL) {
      gameState.score += SURVIVOR_BONUS;
      gameState.survivorTimer -= SURVIVOR_INTERVAL;
      survivorFlash = { timer: 2.0 };
    }

    // Tick survivor flash
    if (survivorFlash !== null) {
      survivorFlash.timer -= dt;
      if (survivorFlash.timer <= 0) survivorFlash = null;
    }

    // Lerp displayed score toward actual score
    gameState.displayedScore += (gameState.score - gameState.displayedScore) * Math.min(1, SCORE_LERP_RATE * dt);

    // Drain fuel proportional to effective speed
    const fuelDrain = (FUEL_DRAIN_BASE + (getEffectiveScrollSpeed() / SPEED_MAX) * FUEL_DRAIN_SPEED) * dt;
    gameState.fuel = Math.max(0, gameState.fuel - fuelDrain);
    if (gameState.fuel <= 0) {
      gameOverState.causeOfDeath = 'Fuel Empty';
      fsm.transition(gameOverState);
      return;
    }

    // Tick invulnerability timer
    if (invulnTimer > 0) invulnTimer = Math.max(0, invulnTimer - dt);

    // Fade red flash
    if (redFlash.alpha > 0) redFlash.alpha = Math.max(0, redFlash.alpha - dt / 0.15);

    // AABB collision detection — only when not invulnerable
    if (invulnTimer <= 0) {
      const ph = getPlayerHitbox(gameState.player);
      for (const v of gameState.traffic) {
        if (aabbOverlap(ph, getVehicleHitbox(v))) {
          handleVehicleCollision(v);
          return;
        }
      }
    }
  },

  render(ctx) {
    renderRoad(ctx, gameState.scrollOffset);
    renderTraffic(ctx);
    renderFuelItems(ctx);
    renderPlayer(ctx, gameState.player);
    renderParticles(ctx);

    // Red flash overlay on frontal collision
    if (redFlash.alpha > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${redFlash.alpha})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Fuel bar HUD (full-width bar at top + low-fuel vignette)
    renderFuelHUD(ctx);

    // Score HUD (top-right)
    renderScoreHUD(ctx);

    // Show elapsed time overlay
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`Time: ${gameState.elapsedTime.toFixed(1)}s`, 8, 8);

    // Debug overlay (toggle with D key)
    if (debugMode) {
      renderFairnessDebug(ctx);
      ctx.fillStyle = 'rgba(255,255,0,0.85)';
      ctx.font = '12px monospace';
      ctx.fillText(`Speed: ${gameState.scrollSpeed.toFixed(0)} px/s (eff: ${getEffectiveScrollSpeed().toFixed(0)})`, 8, 44);
      ctx.fillText(`Dist: ${(gameState.distanceTraveled / 100).toFixed(0)}m`, 8, 58);
      ctx.fillText(`Traffic: ${gameState.traffic.length}`, 8, 72);
      ctx.fillText(`Invuln: ${invulnTimer.toFixed(1)}s`, 8, 86);
      ctx.fillText(`Fuel: ${gameState.fuel.toFixed(1)}`, 8, 100);
      if (spawnPauseTimer > 0) ctx.fillText(`SpawnPause: ${spawnPauseTimer.toFixed(1)}s`, 8, 114);
      // Type breakdown
      const counts = {};
      for (const v of gameState.traffic) counts[v.type] = (counts[v.type] || 0) + 1;
      let y = 128;
      for (const [type, count] of Object.entries(counts)) {
        ctx.fillText(`  ${type}: ${count}`, 8, y);
        y += 14;
      }
    }
  },
};

// --- GameOver State ---
const gameOverState = {
  pulseTime: 0,
  finalTime: 0,
  finalDistance: 0,
  finalScore: 0,
  bestScore: 0,
  isNewBest: false,
  causeOfDeath: '', // set by caller before transition; '' = collision

  onEnter() {
    this.pulseTime = 0;
    this.finalTime = gameState.elapsedTime;
    this.finalDistance = gameState.distanceTraveled;
    this.finalScore = Math.floor(gameState.score);
    const stored = parseInt(localStorage.getItem('roadrush_best_score') || '0', 10);
    this.isNewBest = this.finalScore > stored;
    this.bestScore = this.isNewBest ? this.finalScore : stored;
    if (this.isNewBest) localStorage.setItem('roadrush_best_score', this.finalScore);
  },

  update(dt) {
    this.pulseTime += dt;
    if (consumeKey('Enter')) {
      resetGameState();
      fsm.transition(playingState);
    }
  },

  render(ctx) {
    // Dark background
    ctx.fillStyle = '#0A0A1A';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // GAME OVER text
    ctx.fillStyle = '#E53935';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);

    // Cause of death (if known)
    if (this.causeOfDeath) {
      ctx.fillStyle = '#FFC107';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(this.causeOfDeath, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 46);
    }

    // Stats
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '18px monospace';
    const meters = (this.finalDistance / 100).toFixed(0);
    ctx.fillText(`Time: ${this.finalTime.toFixed(1)}s`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
    ctx.fillText(`Distance: ${meters}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 14);

    // Final score
    ctx.fillStyle = this.isNewBest ? '#FFD700' : '#FFFFFF';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`Score: ${this.finalScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 48);

    // Best score
    if (this.isNewBest) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('NEW BEST!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 72);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '14px monospace';
      ctx.fillText(`Best: ${this.bestScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 72);
    }

    // Pulsing retry text
    const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.pulseTime * 3));
    ctx.globalAlpha = alpha;
    ctx.font = '20px monospace';
    ctx.fillText('Press Enter to Retry', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
    ctx.globalAlpha = 1;
  },
};

// --- Start with Title state ---
fsm.transition(titleState);

// --- Game loop with fixed timestep accumulator ---
let accumulator = 0;
let lastTime = 0;

function gameLoop(timestamp) {
  if (lastTime === 0) {
    lastTime = timestamp;
  }

  const frameTime = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  accumulator += frameTime;

  while (accumulator >= FIXED_DT) {
    if (shake.time > 0) shake.time = Math.max(0, shake.time - FIXED_DT);
    fsm.update(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  ctx.save();
  if (shake.time > 0) {
    const progress = shake.time / SHAKE_DURATION;
    const amount = shake.intensity * progress;
    ctx.translate(
      (Math.random() * 2 - 1) * amount,
      (Math.random() * 2 - 1) * amount
    );
  }
  fsm.render(ctx);
  ctx.restore();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
