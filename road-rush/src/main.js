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
};

function resetGameState() {
  gameState.elapsedTime = 0;
  gameState.distanceTraveled = 0;
  gameState.scrollSpeed = INITIAL_SCROLL_SPEED;
  gameState.scrollOffset = 0;
  gameState.player.x = ROAD_LEFT + ROAD_WIDTH / 2 - PLAYER_WIDTH / 2;
  gameState.player.y = PLAYER_Y;
  gameState.player.vx = 0;
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
    gameState.scrollOffset += gameState.scrollSpeed * dt;
    gameState.distanceTraveled += gameState.scrollSpeed * dt;

    updatePlayer(dt);

    // Escape to simulate game over (for testing until collision is implemented)
    if (consumeKey('Escape')) {
      fsm.transition(gameOverState);
    }
  },

  render(ctx) {
    renderRoad(ctx, gameState.scrollOffset);
    renderPlayer(ctx, gameState.player);

    // Show elapsed time overlay
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Time: ${gameState.elapsedTime.toFixed(1)}s`, 8, 8);
  },
};

// --- GameOver State ---
const gameOverState = {
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
    // Dark background
    ctx.fillStyle = '#0A0A1A';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // GAME OVER text
    ctx.fillStyle = '#E53935';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);

    // Stats
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '18px monospace';
    ctx.fillText(`Time: ${gameState.elapsedTime.toFixed(1)}s`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    // Pulsing retry text
    const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.pulseTime * 3));
    ctx.globalAlpha = alpha;
    ctx.font = '20px monospace';
    ctx.fillText('Press Enter to Retry', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
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
    fsm.update(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  fsm.render(ctx);
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
