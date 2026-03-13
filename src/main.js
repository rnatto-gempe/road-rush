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

// Scroll speed ramp constants
const SPEED_RAMP_PHASE1_CAP = 600; // px/s — phase 1 ramp cap
const SPEED_RAMP_PHASE1_RATE = 5;  // px/s per second in phase 1
const SPEED_RAMP_PHASE2_RATE = 1.5; // px/s per second in phase 2
const SPEED_MAX = 800; // px/s hard cap

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
const shake = { time: 0 };

function triggerShake() {
  shake.time = SHAKE_DURATION;
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

  // Constrain within road borders
  if (player.x < ROAD_LEFT) {
    player.x = ROAD_LEFT;
    player.vx = 0;
  }
  if (player.x + PLAYER_WIDTH > ROAD_RIGHT) {
    player.x = ROAD_RIGHT - PLAYER_WIDTH;
    player.vx = 0;
  }
}

function renderPlayer(ctx, player) {
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

// Returns spawn config based on elapsed time
function getSpawnConfig(elapsed) {
  if (elapsed < 20) return { maxCount: 2, spawnMin: 1200, spawnMax: 1600 };
  if (elapsed < 40) return { maxCount: 3, spawnMin: 800, spawnMax: 1200 };
  if (elapsed < 70) return { maxCount: 4, spawnMin: 600, spawnMax: 900 };
  return { maxCount: 5, spawnMin: 400, spawnMax: 700 };
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
  });
}

function updateTraffic(dt) {
  const elapsed = gameState.elapsedTime;
  const { maxCount, spawnMin, spawnMax } = getSpawnConfig(elapsed);

  // Try spawning — only if fairness constraint is satisfied
  if (
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
    const visualSpeed = gameState.scrollSpeed - v.ownSpeed;
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

  // Remove vehicles that have scrolled past the bottom
  gameState.traffic = gameState.traffic.filter((v) => v.y <= 760);
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
    gameState.scrollOffset += gameState.scrollSpeed * dt;
    gameState.distanceTraveled += gameState.scrollSpeed * dt;

    if (consumeKey('d') || consumeKey('D')) debugMode = !debugMode;

    updatePlayer(dt);
    updateTraffic(dt);

    // AABB collision detection
    const ph = getPlayerHitbox(gameState.player);
    for (const v of gameState.traffic) {
      if (aabbOverlap(ph, getVehicleHitbox(v))) {
        triggerShake();
        fsm.transition(gameOverState);
        return;
      }
    }
  },

  render(ctx) {
    renderRoad(ctx, gameState.scrollOffset);
    renderTraffic(ctx);
    renderPlayer(ctx, gameState.player);

    // Show elapsed time overlay
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Time: ${gameState.elapsedTime.toFixed(1)}s`, 8, 8);

    // Debug overlay (toggle with D key)
    if (debugMode) {
      renderFairnessDebug(ctx);
      ctx.fillStyle = 'rgba(255,255,0,0.85)';
      ctx.font = '12px monospace';
      ctx.fillText(`Speed: ${gameState.scrollSpeed.toFixed(0)} px/s`, 8, 26);
      ctx.fillText(`Dist: ${(gameState.distanceTraveled / 100).toFixed(0)}m`, 8, 42);
      ctx.fillText(`Traffic: ${gameState.traffic.length}`, 8, 58);
      // Type breakdown
      const counts = {};
      for (const v of gameState.traffic) counts[v.type] = (counts[v.type] || 0) + 1;
      let y = 74;
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

  onEnter() {
    this.pulseTime = 0;
    this.finalTime = gameState.elapsedTime;
    this.finalDistance = gameState.distanceTraveled;
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

    // Stats
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '18px monospace';
    const meters = (this.finalDistance / 100).toFixed(0);
    ctx.fillText(`Time: ${this.finalTime.toFixed(1)}s`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
    ctx.fillText(`Distance: ${meters}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 14);

    // Pulsing retry text
    const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.pulseTime * 3));
    ctx.globalAlpha = alpha;
    ctx.font = '20px monospace';
    ctx.fillText('Press Enter to Retry', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 75);
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
    const amount = SHAKE_INTENSITY * progress;
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
