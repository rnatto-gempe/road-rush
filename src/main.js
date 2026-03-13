// Road Rush - Main Game Entry Point

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 700;
const FIXED_DT = 1 / 60; // Fixed timestep: 60 FPS

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
    // Window is wider than canvas aspect - fit to height
    displayHeight = windowHeight;
    displayWidth = windowHeight * targetAspect;
  } else {
    // Window is taller than canvas aspect - fit to width
    displayWidth = windowWidth;
    displayHeight = windowWidth / targetAspect;
  }

  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Demo: moving rectangle to verify game loop works
let rectX = 180;
let rectY = 300;
let rectVX = 120; // px/s
let rectVY = 80;  // px/s

function update(dt) {
  rectX += rectVX * dt;
  rectY += rectVY * dt;

  // Bounce off walls
  if (rectX < 0 || rectX + 40 > CANVAS_WIDTH) {
    rectVX = -rectVX;
    rectX = Math.max(0, Math.min(rectX, CANVAS_WIDTH - 40));
  }
  if (rectY < 0 || rectY + 40 > CANVAS_HEIGHT) {
    rectVY = -rectVY;
    rectY = Math.max(0, Math.min(rectY, CANVAS_HEIGHT - 40));
  }
}

function render() {
  // Clear canvas
  ctx.fillStyle = '#1A1A2E';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw bouncing rectangle
  ctx.fillStyle = '#E53935';
  ctx.fillRect(rectX, rectY, 40, 40);

  // Draw info text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Road Rush - Game Loop Active', CANVAS_WIDTH / 2, 30);
}

// Game loop with fixed timestep accumulator
let accumulator = 0;
let lastTime = 0;

function gameLoop(timestamp) {
  if (lastTime === 0) {
    lastTime = timestamp;
  }

  const frameTime = Math.min((timestamp - lastTime) / 1000, 0.1); // Cap at 100ms to prevent spiral
  lastTime = timestamp;

  accumulator += frameTime;

  while (accumulator >= FIXED_DT) {
    update(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  render();
  requestAnimationFrame(gameLoop);
}

// Start the game loop
requestAnimationFrame(gameLoop);
