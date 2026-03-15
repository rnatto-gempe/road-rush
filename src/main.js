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
      { untilTime: 20, maxCount: 2, spawnMin: 1200, spawnMax: 1600 },
      { untilTime: 40, maxCount: 3, spawnMin: 800, spawnMax: 1200 },
      { untilTime: 70, maxCount: 4, spawnMin: 600, spawnMax: 900 },
      { untilTime: Infinity, maxCount: 5, spawnMin: 400, spawnMax: 700 },
    ],
    // Aggressive-type weight curve (interpolated between these knots)
    aggressiveWeights: [
      { time: 0, weight: 0.00 },
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
      { untilTime: 60, amount: 20 },
      { untilTime: 90, amount: 18 },
      { untilTime: Infinity, amount: 15 },
    ],
  },
};

// Scroll speed ramp constants (aliases to DIFFICULTY for backward compat)
const SPEED_RAMP_PHASE1_CAP = DIFFICULTY.speed.phase1Cap;
const SPEED_RAMP_PHASE1_RATE = DIFFICULTY.speed.phase1Rate;
const SPEED_RAMP_PHASE2_RATE = DIFFICULTY.speed.phase2Rate;
const SPEED_MAX = DIFFICULTY.speed.max;

// Fuel system constants (aliases to DIFFICULTY where applicable)
const FUEL_INITIAL = DIFFICULTY.fuel.initial;
const FUEL_DRAIN_BASE = DIFFICULTY.fuel.drainBase;
const FUEL_DRAIN_SPEED = DIFFICULTY.fuel.drainSpeed;
const FUEL_ITEM_RADIUS = 12;   // 24px diameter fuel circle
const FUEL_SPAWN_BASE_MIN = DIFFICULTY.fuel.spawnBaseMin;
const FUEL_SPAWN_BASE_MAX = DIFFICULTY.fuel.spawnBaseMax;
const FUEL_SPAWN_INTERVAL_GROWTH = DIFFICULTY.fuel.spawnIntervalGrowth;
const FUEL_COLLECT_ANIM_DURATION = 0.2;

// Scoring constants
const SCORE_PER_PX = 0.1;       // 1 point per 10 px traveled
const OVERTAKE_BONUS = 25;       // points for clean overtake
const SURVIVOR_BONUS = 300;      // points every 30s without collision
const SURVIVOR_INTERVAL = 30;    // seconds between survivor bonuses
const SCORE_LERP_RATE = 8;       // display score lerp speed

// Near miss / combo constants
const NEAR_MISS_DIST = 20;           // px sprite-edge to sprite-edge threshold
const NEAR_MISS_BASE_POINTS = 50;    // base points per near miss (× combo multiplier)
const NEAR_MISS_FLASH_DURATION = 0.3; // seconds for vehicle side flash
const DANGER_FLASH_PROXIMITY = 120;  // px center-to-center vertical dist for danger flash (US-010)
const DANGER_FLASH_DECAY = 0.3;      // seconds for danger flash to decay to zero (US-010)
const COMBO_RESET_TIME = 3.0;        // seconds without near miss before combo resets
const COMBO_SCALE_DURATION = 0.2;    // scale-in animation duration

// Coin constants
const COIN_RADIUS = 8;                 // 16px diameter
const COIN_POINTS = 100;               // points per coin collected
const COIN_SPAWN_MIN = 600;            // px traveled min between cluster spawns
const COIN_SPAWN_MAX = 1000;           // px traveled max between cluster spawns
const COIN_COLLECT_ANIM_DURATION = 0.2;
const FLOAT_TEXT_DURATION = 0.9;       // float pickup text duration (US-009)

// Nitro boost constants
const NITRO_ITEM_HALF = 10;            // half-size (so sprite is ~20px)
const NITRO_SPAWN_MIN = 2500;          // px traveled min between spawns
const NITRO_SPAWN_MAX = 4000;          // px traveled max between spawns
const NITRO_BOOST_FACTOR = 1.3;        // +30% scroll speed during boost
const NITRO_BOOST_DURATION = 3.0;      // seconds of active boost
const NITRO_EASE_DURATION = 0.5;       // seconds to ease speed back to normal after boost
const NITRO_COLLECT_ANIM_DURATION = 0.2;

// Shield item constants
const SHIELD_ITEM_RADIUS = 11;          // 22px bounding circle (hexagon)
const SHIELD_SPAWN_MIN = 5000;          // px traveled min between spawns (very rare)
const SHIELD_SPAWN_MAX = 7500;          // px traveled max between spawns
const SHIELD_COLLECT_ANIM_DURATION = 0.2;
const SHIELD_BREAK_FLASH_DURATION = 0.3; // bright flash when shield absorbs a hit

// Weapon (shooting) item constants — 2-3x rarer than shield
const WEAPON_ITEM_RADIUS = 10;           // 20px bounding circle
const WEAPON_SPAWN_MIN = 12000;          // px traveled min between spawns
const WEAPON_SPAWN_MAX = 20000;          // px traveled max between spawns
const WEAPON_COLLECT_ANIM_DURATION = 0.2;
const WEAPON_DURATION = 3.0;             // seconds of active shooting

// Bullet (projectile) constants — US-002
const BULLET_FIRE_INTERVAL = 0.2;        // seconds between automatic shots
const BULLET_SPEED = 600;                // px/s upward
const BULLET_WIDTH = 4;                  // px
const BULLET_HEIGHT = 12;                // px
const BULLET_MAX = 10;                   // max simultaneous bullets on screen
const BULLET_KILL_POINTS = 50;           // bonus points per vehicle destroyed

// Speed lines: drawn in rumble-strip margins when scrollSpeed > 500
const SPEED_LINE_PERIOD = CANVAS_HEIGHT + 80; // vertical wrap period
const speedLineData = (() => {
  const data = [];
  for (let i = 0; i < 8; i++) {
    // Left margin (x: 3–37), right margin (x: 363–397), random y phase
    data.push({ x: 3 + Math.random() * 34, yPhase: Math.random() * SPEED_LINE_PERIOD });
    data.push({ x: ROAD_RIGHT + 3 + Math.random() * 34, yPhase: Math.random() * SPEED_LINE_PERIOD });
  }
  return data;
})();

// Sky clouds: pre-generated array of 6 clouds for sky phase background
const SKY_CLOUD_PERIOD = CANVAS_HEIGHT + 100; // vertical wrap period
const skyCloudData = (() => {
  const data = [];
  for (let i = 0; i < 6; i++) {
    data.push({
      x: ROAD_LEFT + Math.random() * ROAD_WIDTH,
      yPhase: Math.random() * SKY_CLOUD_PERIOD,
    });
  }
  return data;
})();

// Space starfield: pre-generated array of 40 stars for space phase background
const SPACE_STAR_PERIOD = CANVAS_HEIGHT + 100; // vertical wrap period
const spaceStarData = (() => {
  const data = [];
  for (let i = 0; i < 40; i++) {
    data.push({
      x: Math.random() * CANVAS_WIDTH,
      yPhase: Math.random() * SPACE_STAR_PERIOD,
      size: 1 + Math.random(), // 1-2px
      brightness: 0.3 + Math.random() * 0.7, // 0.3-1.0
      layer: Math.random() < 0.5 ? 1 : 2,
    });
  }
  return data;
})();

// Explosion effects (deprecated — kept for array cleanup in resetGameState)
const explosions = []; // no longer used; shockwaveRings replaces this

// Shockwave ring system for cinematic explosion
const shockwaveRings = []; // {x, y, elapsed, duration, maxRadius, startOffset}

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
    phase: 'road',
  },
  truck: {
    color: '#616161',
    width: 60,
    height: 72,
    speedRatio: 0.4,
    minTime: 0,
    behavior: 'none',
    phase: 'road',
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
    phase: 'road',
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
    phase: 'road',
  },
  bird: {
    color: '#5D4037',
    width: 24,
    height: 20,
    speedRatio: 0.75,
    minTime: 0,
    behavior: 'weave',
    laneChangeMin: 1.5,
    laneChangeMax: 3,
    phase: 'sky',
  },
  airplane: {
    color: '#B0BEC5',
    width: 50,
    height: 70,
    speedRatio: 0.35,
    minTime: 0,
    behavior: 'none',
    phase: 'sky',
  },
  helicopter: {
    color: '#78909C',
    width: 44,
    height: 50,
    speedRatio: 0.5,
    minTime: 0,
    behavior: 'laneChange',
    laneChangeMin: 2.5,
    laneChangeMax: 5,
    phase: 'sky',
  },
  asteroid: {
    color: '#795548',
    width: 36,
    height: 36,
    speedRatio: 0.3,
    minTime: 0,
    behavior: 'none',
    phase: 'space',
  },
  fighter: {
    color: '#F44336',
    width: 30,
    height: 48,
    speedRatio: 0.8,
    minTime: 0,
    behavior: 'laneChange',
    laneChangeMin: 1.5,
    laneChangeMax: 3,
    phase: 'space',
  },
  cruiser: {
    color: '#455A64',
    width: 48,
    height: 72,
    speedRatio: 0.25,
    minTime: 0,
    behavior: 'none',
    phase: 'space',
  },
};

// Debug mode
let debugMode = false;

// Easing utility
function easeInOutCubic (t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Color interpolation for phase transitions
function lerpColor (hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t), g = Math.round(g1 + (g2 - g1) * t), b = Math.round(b1 + (b2 - b1) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ─── Audio Manager (Web Audio API) ───
const AudioManager = {
  ctx: null,
  masterGain: null,
  muted: false,

  init () {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    // Limiter/compressor on the master bus to prevent clipping
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, this.ctx.currentTime);
    compressor.ratio.setValueAtTime(10, this.ctx.currentTime);
    compressor.knee.setValueAtTime(3, this.ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
    this.masterGain.connect(compressor);
    compressor.connect(this.ctx.destination);
  },

  resume () {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  toggleMute () {
    if (!this.ctx) return;
    this.muted = !this.muted;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.01);
  },

  // Play a tone with gain envelope to avoid clicks
  playTone (freq, duration, type, gainValue) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainValue || 0.3, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + duration - 0.01);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  // ─── Engine drone (long-lived nodes) ───
  engine: { osc: null, filter: null, gain: null },

  // ─── Road ambience (long-lived noise node) ───
  road: { source: null, filter: null, gain: null, buffer: null },

  // ─── Nitro boost harmonic ───
  nitro: { osc: null, gain: null, active: false },

  startEngine () {
    if (!this.ctx) return;
    this.stopEngine(); // clean up any existing
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(0.15, now, 0.05); // smooth ramp up
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    this.engine = { osc, filter, gain };
  },

  stopEngine () {
    if (!this.engine.osc) return;
    const now = this.ctx.currentTime;
    this.engine.gain.gain.setTargetAtTime(0, now, 0.05);
    const osc = this.engine.osc;
    const filter = this.engine.filter;
    const gain = this.engine.gain;
    // Stop after fade-out completes (~0.25s)
    setTimeout(() => {
      try { osc.stop(); } catch (_) { }
      osc.disconnect(); filter.disconnect(); gain.disconnect();
    }, 250);
    this.engine = { osc: null, filter: null, gain: null };
  },

  // Update engine pitch/volume based on scroll speed (call every frame)
  updateEngine (scrollSpeed) {
    if (!this.engine.osc) return;
    const now = this.ctx.currentTime;
    const phase = gameState.phase;

    if (phase === 'space') {
      // Space: electronic hum — sine wave 80Hz, low gain
      if (this.engine.osc.type !== 'sine') {
        this.engine.osc.type = 'sine';
      }
      this.engine.osc.frequency.setTargetAtTime(80, now, 0.1);
      this.engine.filter.frequency.setTargetAtTime(200, now, 0.1);
      this.engine.gain.gain.setTargetAtTime(0.05, now, 0.1);
      return;
    }

    // Map scrollSpeed 200→800 to frequency 60→180Hz
    const t = Math.max(0, Math.min(1, (scrollSpeed - 200) / 600));
    let freq = 60 + t * 120;
    // Sky phase: raise pitch by 50%
    if (phase === 'sky') freq *= 1.5;
    // Nitro boost: raise pitch by ~30%
    if (this.nitro.active) freq *= 1.3;
    // Restore sawtooth if coming back from space (e.g. after reset)
    if (this.engine.osc.type !== 'sawtooth') {
      this.engine.osc.type = 'sawtooth';
    }
    this.engine.osc.frequency.setTargetAtTime(freq, now, 0.05);
    // Filter cutoff maps 400→800Hz
    this.engine.filter.frequency.setTargetAtTime(400 + t * 400, now, 0.05);
    // Volume: reduced to ~0.1 when musical elements are active (pad/bass/arpeggio)
    const musicActive = this.pad.active || this.bass.running;
    const vol = musicActive ? 0.10 : (0.08 + t * 0.12);
    this.engine.gain.gain.setTargetAtTime(vol, now, 0.05);
  },

  // ─── Road ambience (long-lived looping noise) ───
  startRoad () {
    if (!this.ctx) return;
    this.stopRoad();
    const now = this.ctx.currentTime;
    // Create a long white noise buffer (2s, looped)
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 2);
    if (!this.road.buffer) {
      this.road.buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = this.road.buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.road.buffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, now);
    filter.Q.setValueAtTime(0.8, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(0.04, now, 0.05);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    this.road.source = source;
    this.road.filter = filter;
    this.road.gain = gain;
  },

  stopRoad () {
    if (!this.road.source) return;
    const now = this.ctx.currentTime;
    this.road.gain.gain.setTargetAtTime(0, now, 0.05);
    const source = this.road.source;
    const filter = this.road.filter;
    const gain = this.road.gain;
    setTimeout(() => {
      try { source.stop(); } catch (_) { }
      source.disconnect(); filter.disconnect(); gain.disconnect();
    }, 250);
    this.road.source = null;
    this.road.filter = null;
    this.road.gain = null;
  },

  updateRoad (scrollSpeed) {
    if (!this.road.source) return;
    const now = this.ctx.currentTime;
    const t = Math.max(0, Math.min(1, (scrollSpeed - 200) / 600));
    // Filter center 300→800Hz with speed
    this.road.filter.frequency.setTargetAtTime(300 + t * 500, now, 0.05);
    // Bandwidth widens with speed (Q decreases = wider)
    this.road.filter.Q.setTargetAtTime(0.8 - t * 0.4, now, 0.05);
    // Volume 0.03→0.10 with speed
    const vol = 0.03 + t * 0.07;
    this.road.gain.gain.setTargetAtTime(vol, now, 0.05);
  },

  // ─── Nitro boost audio effect ───
  startNitro () {
    if (!this.ctx || !this.engine.osc) return;
    if (this.nitro.active) return;
    const now = this.ctx.currentTime;
    // Add high-freq sawtooth harmonic at ~2x engine freq
    const engineFreq = this.engine.osc.frequency.value;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(engineFreq * 2, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(0.08, now, 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    this.nitro.osc = osc;
    this.nitro.gain = gain;
    this.nitro.active = true;
    // Engine pitch boost handled by updateEngine via nitro.active flag
  },

  stopNitro () {
    if (!this.nitro.active) return;
    const now = this.ctx.currentTime;
    if (this.nitro.gain) {
      this.nitro.gain.gain.setTargetAtTime(0, now, 0.05);
    }
    const osc = this.nitro.osc;
    const gain = this.nitro.gain;
    setTimeout(() => {
      try { if (osc) osc.stop(); } catch (_) { }
      if (osc) osc.disconnect();
      if (gain) gain.disconnect();
    }, 250);
    this.nitro.osc = null;
    this.nitro.gain = null;
    this.nitro.active = false;
  },

  updateNitro () {
    if (!this.nitro.active || !this.nitro.osc || !this.engine.osc) return;
    const now = this.ctx.currentTime;
    // Keep nitro harmonic tracking ~2x the boosted engine freq
    const engineFreq = this.engine.osc.frequency.value;
    this.nitro.osc.frequency.setTargetAtTime(engineFreq * 2, now, 0.05);
  },

  // Create filtered noise burst
  createNoise (duration, filterFreq, filterType) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.setValueAtTime(filterFreq || 1000, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + duration - 0.01);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  },

  // Duck all long-lived musical elements (pad, bass) to 0.3x for 0.5s on impact
  duckMusicElements () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const endTime = now + 0.5;
    if (this.pad.active && this.pad.gain) {
      const v = this.pad.gain.gain.value;
      this.pad.gain.gain.setValueAtTime(v * 0.3, now);
      this.pad.gain.gain.setTargetAtTime(v, endTime, 0.05);
    }
    if (this.bass.running && this.bass.gain) {
      this.bass.gain.gain.setValueAtTime(0.3, now);
      this.bass.gain.gain.setTargetAtTime(1.0, endTime, 0.05);
    }
  },

  // ─── Collision & Explosion SFX ───

  // Metallic crash: short noise burst (high-pass ~2kHz) + low-freq impact thump (sine ~60Hz)
  playCrash () {
    if (!this.ctx) return;
    this.duckMusicElements();
    const now = this.ctx.currentTime;

    // High-pass noise burst (metallic clang)
    const sampleRate = this.ctx.sampleRate;
    const noiseLen = Math.floor(sampleRate * 0.15);
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const hpFilter = this.ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(2000, now);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.5, now + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    noiseSrc.connect(hpFilter);
    hpFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.15);
    noiseSrc.onended = () => { noiseSrc.disconnect(); hpFilter.disconnect(); noiseGain.disconnect(); };

    // Low-freq impact thump
    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(60, now);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0, now);
    thumpGain.gain.linearRampToValueAtTime(0.5, now + 0.005);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    thump.connect(thumpGain);
    thumpGain.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.15);
    thump.onended = () => { thump.disconnect(); thumpGain.disconnect(); };
  },

  // Layered explosion boom: low sine sweep + noise burst + crackle
  playExplosion () {
    if (!this.ctx) return;
    this.duckMusicElements();
    const now = this.ctx.currentTime;

    // Low sine sweep 80→30Hz over 0.5s
    const boom = this.ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, now);
    boom.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    const boomGain = this.ctx.createGain();
    boomGain.gain.setValueAtTime(0, now);
    boomGain.gain.linearRampToValueAtTime(0.8, now + 0.01);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    boom.connect(boomGain);
    boomGain.connect(this.masterGain);
    boom.start(now);
    boom.stop(now + 0.5);
    boom.onended = () => { boom.disconnect(); boomGain.disconnect(); };

    // Noise burst with decaying low-pass filter
    const sampleRate = this.ctx.sampleRate;
    const noiseLen = Math.floor(sampleRate * 0.8);
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const lpFilter = this.ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(4000, now);
    lpFilter.frequency.exponentialRampToValueAtTime(200, now + 0.8);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.7, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    noiseSrc.connect(lpFilter);
    lpFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.8);
    noiseSrc.onended = () => { noiseSrc.disconnect(); lpFilter.disconnect(); noiseGain.disconnect(); };

    // Crackle: 4 random short noise bursts spaced over 1.5s
    for (let i = 0; i < 4; i++) {
      const delay = 0.2 + Math.random() * 1.3;
      const crackleLen = Math.floor(sampleRate * 0.06);
      const crackleBuf = this.ctx.createBuffer(1, crackleLen, sampleRate);
      const crackleData = crackleBuf.getChannelData(0);
      for (let j = 0; j < crackleLen; j++) crackleData[j] = Math.random() * 2 - 1;
      const crackleSrc = this.ctx.createBufferSource();
      crackleSrc.buffer = crackleBuf;
      const crackleFilter = this.ctx.createBiquadFilter();
      crackleFilter.type = 'highpass';
      crackleFilter.frequency.setValueAtTime(1500, now);
      const crackleGain = this.ctx.createGain();
      crackleGain.gain.setValueAtTime(0, now + delay);
      crackleGain.gain.linearRampToValueAtTime(0.3, now + delay + 0.005);
      crackleGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);
      crackleSrc.connect(crackleFilter);
      crackleFilter.connect(crackleGain);
      crackleGain.connect(this.masterGain);
      crackleSrc.start(now + delay);
      crackleSrc.stop(now + delay + 0.06);
      crackleSrc.onended = () => { crackleSrc.disconnect(); crackleFilter.disconnect(); crackleGain.disconnect(); };
    }
  },

  // Shield break: crystalline shatter — high-freq sine sweep 2kHz→500Hz + short noise burst
  playShieldBreak () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // High-freq sine sweep 2kHz→500Hz over 0.2s
    const sweep = this.ctx.createOscillator();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(2000, now);
    sweep.frequency.exponentialRampToValueAtTime(500, now + 0.2);
    const sweepGain = this.ctx.createGain();
    sweepGain.gain.setValueAtTime(0, now);
    sweepGain.gain.linearRampToValueAtTime(0.4, now + 0.01);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    sweep.connect(sweepGain);
    sweepGain.connect(this.masterGain);
    sweep.start(now);
    sweep.stop(now + 0.2);
    sweep.onended = () => { sweep.disconnect(); sweepGain.disconnect(); };

    // Short noise burst
    const sampleRate = this.ctx.sampleRate;
    const noiseLen = Math.floor(sampleRate * 0.1);
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const hpFilter = this.ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(3000, now);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.35, now + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noiseSrc.connect(hpFilter);
    hpFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.1);
    noiseSrc.onended = () => { noiseSrc.disconnect(); hpFilter.disconnect(); noiseGain.disconnect(); };
  },

  // ─── Collectible Pickup SFX ───

  // Coin cluster sequence counter (ascending pitch per rapid coin)
  coinSeq: { count: 0, resetTimer: 0 },

  // Fuel pickup: quick major triad chord (~0.15s) derived from current chord root
  playFuelPickup () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const chordIdx = this.pad.chordIdx < 0 ? 0 : this.pad.chordIdx;
    const root = this.PAD_CHORDS[chordIdx][0]; // root note of current chord
    // Major triad: root, major 3rd (+4 semitones), perfect 5th (+7 semitones)
    const triadFreqs = [root, root * Math.pow(2, 4 / 12), root * Math.pow(2, 7 / 12)];
    for (const freq of triadFreqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + 0.14);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.15);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  },

  // Coin pickup: note from A minor pentatonic (steps up one scale degree per consecutive coin)
  playCoinPickup () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Track rapid coin sequence
    this.coinSeq.count++;
    this.coinSeq.resetTimer = 0.4; // reset after 0.4s gap
    // Use arp notes for current chord; step up one note per coin in cluster
    const chordIdx = this.pad.chordIdx < 0 ? 0 : this.pad.chordIdx;
    const arpNotes = this.ARPS_BY_CHORD[chordIdx];
    const freq = arpNotes[(this.coinSeq.count - 1) % arpNotes.length];
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now); // sharp attack
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  // Nitro pickup: ascending sawtooth sweep ending on tonic A4 (440Hz) over 0.3s
  playNitroPickup () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now); // A3 — start an octave below tonic
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.3); // A4 — tonic
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  // Shield pickup: two notes a perfect 5th apart from current scale with tremolo (LFO ~8Hz), 0.4s
  playShieldPickup () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const chordIdx = this.pad.chordIdx < 0 ? 0 : this.pad.chordIdx;
    const root = this.PAD_CHORDS[chordIdx][0]; // root note of current chord
    const fifth = root * 1.5;                  // perfect 5th above

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.39);
    gain.connect(this.masterGain);

    // LFO tremolo at 8Hz: oscillates gain by ±0.08
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(8, now);
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.setValueAtTime(0.08, now);
    lfo.connect(lfoDepth);
    lfoDepth.connect(gain.gain);
    lfo.start(now);
    lfo.stop(now + 0.4);
    lfo.onended = () => { lfo.disconnect(); lfoDepth.disconnect(); };

    let endedCount = 0;
    for (const freq of [root, fifth]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.4);
      osc.onended = () => {
        osc.disconnect();
        endedCount++;
        if (endedCount === 2) gain.disconnect();
      };
    }
  },

  // Weapon pickup: rapid ascending sawtooth sweep with a punchy attack (~0.25s)
  playWeaponPickup () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.03);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
    gain.gain.linearRampToValueAtTime(0, now + 0.25);
    gain.connect(this.masterGain);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.25);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  // Short percussive bullet shot SFX — high-freq click (US-002)
  playBulletShoot () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  // Vehicle destruction boom — mid-range noise burst + low thump (US-002)
  playVehicleDestroy () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Noise burst
    const sampleRate = this.ctx.sampleRate;
    const noiseLen = Math.floor(sampleRate * 0.12);
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const bpFilter = this.ctx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.setValueAtTime(800, now);
    bpFilter.Q.setValueAtTime(1.5, now);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noiseSrc.connect(bpFilter);
    bpFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.12);
    noiseSrc.onended = () => { noiseSrc.disconnect(); bpFilter.disconnect(); noiseGain.disconnect(); };
    // Low thump
    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(80, now);
    thump.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0.25, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    thump.connect(thumpGain);
    thumpGain.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.1);
    thump.onended = () => { thump.disconnect(); thumpGain.disconnect(); };
  },

  // ─── Near Miss, Combo, and Bonus SFX ───

  // Near miss: short chromatic grace note — one semitone below tonic A4 (G#4 = 415.3Hz), 0.05s
  playNearMiss () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // G#4/Ab4 = 440 / 2^(1/12) ≈ 415.3Hz — one semitone below tonic A4
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(415.3, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  // Combo multiplier: power chord (root + 5th) where root rises with combo level, 0.15s
  playComboUp (combo) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Root steps up through arp notes of current chord with each combo level
    const chordIdx = this.pad.chordIdx < 0 ? 0 : this.pad.chordIdx;
    const arpNotes = this.ARPS_BY_CHORD[chordIdx];
    const root = arpNotes[(combo - 1) % arpNotes.length];
    const fifth = root * 1.5; // perfect 5th
    for (const freq of [root, fifth]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.15);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  },

  // Combo milestone SFX: bright ascending ding at x3/x5/x8 (US-008)
  playComboMilestone (level) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Higher pitch and more harmonics at higher milestones
    const baseFreq = level >= 8 ? 1200 : level >= 5 ? 900 : 700;
    const harmonics = level >= 8 ? [1, 1.5, 2, 2.5] : level >= 5 ? [1, 1.5, 2] : [1, 1.5];
    for (const h of harmonics) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * h, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * h * 1.2, now + 0.1);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2 / harmonics.length, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.2);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  },

  // Combo lost SFX: short descending deflation tone (US-008)
  playComboLost () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  // Survivor bonus: triumphant short major chord (400/500/600Hz sines, 0.3s)
  playSurvivorBonus () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [400, 500, 600];
    for (const freq of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  },

  // Overtake bonus: subtle low filtered sawtooth vroom, 0.15s
  playOvertake () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
    osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
  },

  // Update coin sequence timer (call from game update loop)
  updateCoinSeq (dt) {
    if (this.coinSeq.count > 0) {
      this.coinSeq.resetTimer -= dt;
      if (this.coinSeq.resetTimer <= 0) {
        this.coinSeq.count = 0;
      }
    }
  },

  // --- Title screen ambient drone ---
  titleDrone: { osc: null, lfo: null, lfoGain: null, noiseSource: null, noiseGain: null, gain: null },

  startTitleDrone () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Low sine drone (~55Hz) with LFO amplitude modulation (~0.3Hz)
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, now);

    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(0.15, now + 0.5); // slow fade-in

    // LFO for amplitude modulation
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.3, now);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.06, now); // modulation depth

    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain); // modulates the drone gain

    osc.connect(droneGain);
    droneGain.connect(this.masterGain);

    osc.start(now);
    lfo.start(now);

    // Soft filtered noise pad (low-pass ~200Hz, very low gain)
    const noiseDur = 60; // long buffer
    const bufferSize = this.ctx.sampleRate * noiseDur;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(200, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.04, now + 0.5);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSource.start(now);

    this.titleDrone.osc = osc;
    this.titleDrone.lfo = lfo;
    this.titleDrone.lfoGain = lfoGain;
    this.titleDrone.noiseSource = noiseSource;
    this.titleDrone.noiseGain = noiseGain;
    this.titleDrone.gain = droneGain;
  },

  stopTitleDrone () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const d = this.titleDrone;

    if (d.gain) {
      d.gain.gain.cancelScheduledValues(now);
      d.gain.gain.setTargetAtTime(0, now, 0.1); // ~0.3s crossfade
    }
    if (d.noiseGain) {
      d.noiseGain.gain.cancelScheduledValues(now);
      d.noiseGain.gain.setTargetAtTime(0, now, 0.1);
    }

    // Stop nodes after crossfade completes
    const stopTime = now + 0.4;
    if (d.osc) { try { d.osc.stop(stopTime); } catch (e) { } d.osc.onended = () => { d.osc.disconnect(); d.gain.disconnect(); }; }
    if (d.lfo) { try { d.lfo.stop(stopTime); } catch (e) { } d.lfo.onended = () => { d.lfo.disconnect(); d.lfoGain.disconnect(); }; }
    if (d.noiseSource) { try { d.noiseSource.stop(stopTime); } catch (e) { } d.noiseSource.onended = () => { d.noiseSource.disconnect(); d.noiseGain.disconnect(); }; }

    this.titleDrone = { osc: null, lfo: null, lfoGain: null, noiseSource: null, noiseGain: null, gain: null };
  },

  // ─── Rhythmic beat scheduler ───
  beat: { running: false, nextBeatTime: 0, beatIndex: 0, scheduledUpTo: 0, pendingBeats: [] },

  startBeat () {
    if (!this.ctx) return;
    this.beat.running = true;
    this.beat.nextBeatTime = this.ctx.currentTime + 0.1; // slight delay to sync
    this.beat.beatIndex = 0;
    this.beat.scheduledUpTo = this.beat.nextBeatTime;
    this.beat.pendingBeats = [];
  },

  stopBeat () {
    this.beat.running = false;
    this.beat.beatIndex = 0;
    this.beat.scheduledUpTo = 0;
    this.beat.pendingBeats = [];
  },

  // Schedule individual beat sounds at precise times
  _scheduleKick (time) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.11);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  _scheduleHiHat (time) {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.05);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(time);
    source.stop(time + 0.06);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  },

  _scheduleSubBass (time) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(45, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.21);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  // Called every frame from playingState.update — schedules beats ahead using AudioContext timing
  updateBeat (scrollSpeed) {
    if (!this.ctx || !this.beat.running) return;
    const now = this.ctx.currentTime;
    // Map scrollSpeed 200→800 to BPM 90→150
    const t = Math.max(0, Math.min(1, (scrollSpeed - 200) / 600));
    const bpm = 90 + t * 60;
    const beatInterval = 60 / bpm; // seconds per beat (quarter note)
    const halfBeat = beatInterval / 2; // for off-beat hi-hat

    // Schedule ~4 beats ahead
    const lookAhead = beatInterval * 4;
    while (this.beat.scheduledUpTo < now + lookAhead) {
      const beatTime = this.beat.scheduledUpTo;
      const idx = this.beat.beatIndex;

      // Kick on every beat
      this._scheduleKick(beatTime);
      // Queue beat time for visual HUD pulse (US-008)
      this.beat.pendingBeats.push(beatTime);
      if (this.beat.pendingBeats.length > 24) this.beat.pendingBeats.shift();

      // Sidechain-like duck: briefly reduce bass gain when kick fires
      if (this.bass.running && this.bass.gain) {
        this.bass.gain.gain.setValueAtTime(0.3, beatTime);
        this.bass.gain.gain.setTargetAtTime(1.0, beatTime + 0.05, 0.02);
      }

      // Hi-hat on off-beats (halfway between beats)
      this._scheduleHiHat(beatTime + halfBeat);

      // Sub bass on every 4th beat
      if (idx % 4 === 0) {
        this._scheduleSubBass(beatTime);
        // DnB bass pattern: root + syncopated ghosts at 2.5 and 3.5
        if (this.bass.running) {
          const bassChordIdx = Math.floor(idx / 4) % 4;
          this._scheduleBassBeat(beatTime, beatInterval, bassChordIdx);
        }
      }

      this.beat.scheduledUpTo += beatInterval;
      this.beat.beatIndex++;
      // Update chord pad on each newly scheduled beat
      this.updatePadChord(this.beat.beatIndex);
    }
  },

  // Fuel warning beep state
  fuelWarning: { timer: 0 },

  // Play a single fuel warning beep: square wave ~800Hz, 0.08s
  playFuelBeep () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + 0.07);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },

  // Update fuel warning beep timer — call from playingState.update after fuel drain
  updateFuelWarning (dt, fuelPct) {
    if (fuelPct >= 0.25) {
      // Above threshold — reset timer so next beep is immediate when fuel drops
      this.fuelWarning.timer = 0;
      return;
    }
    // Determine beep interval based on fuel level
    let interval;
    if (fuelPct < 0.05) {
      interval = 0.08 + 0.12; // 0.2s cycle (rapid)
    } else if (fuelPct < 0.15) {
      interval = 0.08 + 0.25; // 0.33s cycle (fast)
    } else {
      interval = 0.08 + 0.4;  // 0.48s cycle (normal)
    }
    this.fuelWarning.timer -= dt;
    if (this.fuelWarning.timer <= 0) {
      this.playFuelBeep();
      this.fuelWarning.timer = interval;
    }
  },

  // ─── Explosion rumble (low ominous filtered noise during explosionState) ───
  explosionRumble: { source: null, filter: null, gain: null },

  startExplosionRumble () {
    if (!this.ctx) return;
    this.stopExplosionRumble();
    const now = this.ctx.currentTime;
    // Reuse or create noise buffer
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 2);
    if (!this._rumbleBuffer) {
      this._rumbleBuffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = this._rumbleBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this._rumbleBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(80, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 1.0); // slow fade-in over 1s
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    this.explosionRumble = { source, filter, gain };
  },

  stopExplosionRumble () {
    const r = this.explosionRumble;
    if (!r.source) return;
    const now = this.ctx.currentTime;
    r.gain.gain.cancelScheduledValues(now);
    r.gain.gain.setTargetAtTime(0, now, 0.1); // ~0.3s fade
    const { source, filter, gain } = r;
    setTimeout(() => {
      try { source.stop(); } catch (_) { }
      source.disconnect(); filter.disconnect(); gain.disconnect();
    }, 400);
    this.explosionRumble = { source: null, filter: null, gain: null };
  },

  // ─── Title→Playing riser (1s white noise ascending sweep + crescendo) ───
  playRiser () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = 1.0;

    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.exponentialRampToValueAtTime(8000, now + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + dur * 0.8);
    gain.gain.linearRampToValueAtTime(0, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + dur);
    src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
  },

  // ─── Collision tape-stop effect (pitch drops to 20% over 0.3s then silence) ───
  playTapeStop () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = 0.3;

    // Tape-stop the pad: ramp all oscillator frequencies to 20% over dur
    if (this.pad.active) {
      for (const grp of this.pad.noteGroups) {
        for (const osc of grp.oscs) {
          const curFreq = osc.frequency.value;
          osc.frequency.cancelScheduledValues(now);
          osc.frequency.setValueAtTime(curFreq, now);
          osc.frequency.exponentialRampToValueAtTime(Math.max(1, curFreq * 0.2), now + dur);
        }
      }
      this.pad.gain.gain.cancelScheduledValues(now);
      this.pad.gain.gain.setValueAtTime(this.pad.gain.gain.value, now);
      this.pad.gain.gain.setTargetAtTime(0, now + dur * 0.7, 0.02);

      // Schedule cleanup; mark inactive so stopPad() in onExit is a no-op
      const { noteGroups, filter, gain } = this.pad;
      setTimeout(() => {
        for (const grp of noteGroups) {
          for (const osc of grp.oscs) { try { osc.stop(); } catch (_) { } osc.disconnect(); }
          grp.noteGain.disconnect();
        }
        if (filter) filter.disconnect();
        if (gain) gain.disconnect();
      }, 500);
      this.pad.noteGroups = [];
      this.pad.filter = null;
      this.pad.gain = null;
      this.pad.active = false;
      this.pad.chordIdx = -1;
    }

    // Stop beat, arp, bass immediately (their short-lived notes just cut off)
    this.stopBeat();
    this.stopArp();
    this.stopBass();
  },

  // ─── Retry drum roll fill (4 rapid kicks over 0.3s) ───
  playDrumRoll () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const interval = 0.075; // 4 kicks → 0.3s total
    for (let i = 0; i < 4; i++) {
      this._scheduleKick(now + i * interval);
    }
  },

  // ─── Phase transition sound effects ───
  playPhaseTransition (fromPhase, toPhase) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (fromPhase === 'road' && toPhase === 'sky') {
      // Ascending sweep — sawtooth 200Hz→600Hz over 2s
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 2);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
      gain.gain.setValueAtTime(0.15, now + 1.5);
      gain.gain.linearRampToValueAtTime(0, now + 2);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 2);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    if (fromPhase === 'sky' && toPhase === 'space') {
      // Bass drop — sine 120Hz→40Hz over 1.5s
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 1.5);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.setValueAtTime(0.2, now + 1.0);
      gain.gain.linearRampToValueAtTime(0, now + 1.5);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.5);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };

      // Ethereal tone — sine 800Hz, gain 0.05, 1.5s (starts after bass drop)
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(800, now + 0.5);
      const gain2 = this.ctx.createGain();
      gain2.gain.setValueAtTime(0, now + 0.5);
      gain2.gain.linearRampToValueAtTime(0.05, now + 0.8);
      gain2.gain.setValueAtTime(0.05, now + 1.5);
      gain2.gain.linearRampToValueAtTime(0, now + 2.0);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(now + 0.5);
      osc2.stop(now + 2.0);
      osc2.onended = () => { osc2.disconnect(); gain2.disconnect(); };
    }
  },

  // ─── Game over somber drone (two detuned low sines + filtered noise tail) ───
  gameOverDrone: { osc1: null, osc2: null, oscGain: null, noiseSource: null, noiseGain: null, dimOsc1: null, dimOsc2: null, dimOsc3: null, dimGain: null },

  startGameOverDrone () {
    if (!this.ctx) return;
    this.stopGameOverDrone();
    const now = this.ctx.currentTime;

    // Two detuned low sines creating dissonance (~48Hz and ~51Hz)
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(48, now);
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(51, now);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(0.15, now + 0.8); // fade in

    osc1.connect(oscGain);
    osc2.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc1.start(now);
    osc2.start(now);

    // Very soft filtered noise tail
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 2);
    if (!this._rumbleBuffer) {
      this._rumbleBuffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = this._rumbleBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this._rumbleBuffer;
    noiseSource.loop = true;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(150, now);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.04, now + 1.0);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSource.start(now);

    // Diminished minor chord (A dim: A2=110Hz, C3=130.8Hz, Eb3=155.6Hz)
    // Fades in 0.3s, then resolves (fades out) over 2s for cinematic tension
    const dimFreqs = [110, 130.8, 155.6];
    const dimGain = this.ctx.createGain();
    dimGain.gain.setValueAtTime(0, now);
    dimGain.gain.linearRampToValueAtTime(0.10, now + 0.3);
    dimGain.gain.setTargetAtTime(0, now + 0.3, 0.7); // slow resolve over ~2s
    dimGain.connect(this.masterGain);

    const dimOscs = dimFreqs.map(freq => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, now);
      o.connect(dimGain);
      o.start(now);
      return o;
    });

    this.gameOverDrone = { osc1, osc2, oscGain, noiseSource, noiseGain, dimOscs, dimGain };
  },

  stopGameOverDrone () {
    const d = this.gameOverDrone;
    if (!d.osc1) return;
    const now = this.ctx.currentTime;

    d.oscGain.gain.cancelScheduledValues(now);
    d.oscGain.gain.setTargetAtTime(0, now, 0.05);
    if (d.noiseGain) {
      d.noiseGain.gain.cancelScheduledValues(now);
      d.noiseGain.gain.setTargetAtTime(0, now, 0.05);
    }
    if (d.dimGain) {
      d.dimGain.gain.cancelScheduledValues(now);
      d.dimGain.gain.setTargetAtTime(0, now, 0.05);
    }

    const { osc1, osc2, oscGain, noiseSource, noiseGain, dimOscs, dimGain } = d;
    setTimeout(() => {
      try { osc1.stop(); } catch (_) { }
      try { osc2.stop(); } catch (_) { }
      try { if (noiseSource) noiseSource.stop(); } catch (_) { }
      osc1.disconnect(); osc2.disconnect(); oscGain.disconnect();
      if (noiseSource) noiseSource.disconnect();
      if (noiseGain) noiseGain.disconnect();
      if (dimOscs) { for (const o of dimOscs) { try { o.stop(); } catch (_) { } o.disconnect(); } }
      if (dimGain) dimGain.disconnect();
    }, 300);
    this.gameOverDrone = { osc1: null, osc2: null, oscGain: null, noiseSource: null, noiseGain: null, dimOsc1: null, dimOsc2: null, dimOsc3: null, dimGain: null };
  },

  // ─── Harmonic chord pad (supersaw) ───
  // Am → F → C → G progression, chord changes every 4 beats (1 bar), 4-bar loop
  PAD_CHORDS: [
    [440.0, 523.3, 659.3],  // Am: A4, C5, E5
    [349.2, 440.0, 523.3],  // F:  F4, A4, C5
    [261.6, 329.6, 392.0],  // C:  C4, E4, G4
    [392.0, 493.9, 587.3],  // G:  G4, B4, D5
  ],
  PAD_DETUNE: [-15, 0, 15], // cents detune per oscillator (supersaw width)
  pad: { noteGroups: [], filter: null, gain: null, active: false, chordIdx: -1 },

  startPad () {
    if (!this.ctx) return;
    this.stopPad();
    const now = this.ctx.currentTime;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.Q.setValueAtTime(0.5, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(0.12, now, 0.1); // fade-in ~0.3s

    filter.connect(gain);
    gain.connect(this.masterGain);

    const chordFreqs = this.PAD_CHORDS[0]; // start with Am
    const noteGroups = [];
    for (let n = 0; n < 3; n++) {
      const noteGain = this.ctx.createGain();
      noteGain.gain.setValueAtTime(0.33, now); // equal weight per note
      noteGain.connect(filter);

      const oscs = [];
      for (let d = 0; d < 3; d++) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(chordFreqs[n], now);
        osc.detune.setValueAtTime(this.PAD_DETUNE[d], now);
        osc.connect(noteGain);
        osc.start(now);
        oscs.push(osc);
      }
      noteGroups.push({ oscs, noteGain });
    }

    this.pad.noteGroups = noteGroups;
    this.pad.filter = filter;
    this.pad.gain = gain;
    this.pad.active = true;
    this.pad.chordIdx = 0;
  },

  stopPad () {
    if (!this.pad.active) return;
    const now = this.ctx.currentTime;
    this.pad.gain.gain.cancelScheduledValues(now);
    this.pad.gain.gain.setTargetAtTime(0, now, 0.1); // fade out ~0.3s

    const { noteGroups, filter, gain } = this.pad;
    setTimeout(() => {
      for (const grp of noteGroups) {
        for (const osc of grp.oscs) {
          try { osc.stop(); } catch (_) { }
          osc.disconnect();
        }
        grp.noteGain.disconnect();
      }
      filter.disconnect();
      gain.disconnect();
    }, 400);

    this.pad.noteGroups = [];
    this.pad.filter = null;
    this.pad.gain = null;
    this.pad.active = false;
    this.pad.chordIdx = -1;
  },

  updatePad (scrollSpeed) {
    if (!this.pad.active || !this.pad.gain) return;
    const now = this.ctx.currentTime;
    const t = Math.max(0, Math.min(1, (scrollSpeed - 200) / 600));
    // Filter cutoff 400→1200Hz with speed
    this.pad.filter.frequency.setTargetAtTime(400 + t * 800, now, 0.1);
    // Volume 0.12→0.20 with speed
    this.pad.gain.gain.setTargetAtTime(0.12 + t * 0.08, now, 0.1);
  },

  // Call from updateBeat — advances chord when beat index crosses a 4-beat bar boundary
  updatePadChord (beatIndex) {
    if (!this.pad.active || this.pad.noteGroups.length === 0) return;
    const chordIdx = Math.floor(beatIndex / 4) % 4;
    if (chordIdx === this.pad.chordIdx) return;

    this.pad.chordIdx = chordIdx;
    const now = this.ctx.currentTime;
    const chordFreqs = this.PAD_CHORDS[chordIdx];
    for (let n = 0; n < 3; n++) {
      for (const osc of this.pad.noteGroups[n].oscs) {
        osc.frequency.setTargetAtTime(chordFreqs[n], now, 0.05);
      }
    }
  },

  // ─── Synchronized DnB bass line ───
  // Root notes for Am→F→C→G progression, 40–100 Hz range
  BASS_ROOTS: [55.0, 87.3, 65.4, 98.0], // A1, F2, C2, G2 (Hz)
  bass: { running: false, gain: null },

  startBass () {
    if (!this.ctx) return;
    this.stopBass();
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(1.0, now, 0.1); // fade-in ~0.3s
    gain.connect(this.masterGain);
    this.bass.gain = gain;
    this.bass.running = true;
  },

  stopBass () {
    if (!this.bass.running) return;
    const now = this.ctx.currentTime;
    this.bass.gain.gain.cancelScheduledValues(now);
    this.bass.gain.gain.setTargetAtTime(0, now, 0.1); // fade-out ~0.3s
    const gain = this.bass.gain;
    setTimeout(() => { gain.disconnect(); }, 400);
    this.bass.gain = null;
    this.bass.running = false;
  },

  // Schedule a single bass note: sawtooth → lowpass ~200 Hz → per-note envelope
  _scheduleBassNote (time, freq, vel) {
    if (!this.ctx || !this.bass.gain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, time);
    filter.Q.setValueAtTime(0.5, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vel * 0.3, time + 0.008); // attack <0.01s
    gain.gain.setTargetAtTime(0, time + 0.02, 0.05);            // decay ~0.15s
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bass.gain);
    osc.start(time);
    osc.stop(time + 0.5);
    osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
  },

  // Schedule DnB bass pattern for one bar: beat-1 root + syncopated ghost notes at 2.5 and 3.5
  _scheduleBassBeat (beatTime, beatInterval, chordIdx) {
    const root = this.BASS_ROOTS[chordIdx];
    this._scheduleBassNote(beatTime, root, 1.0);  // beat 1: full
    this._scheduleBassNote(beatTime + 1.5 * beatInterval, root, 0.5);  // beat 2.5: ghost
    this._scheduleBassNote(beatTime + 2.5 * beatInterval, root, 0.5);  // beat 3.5: ghost
  },

  // ─── Procedural arpeggio melody ───
  // Notes from A minor pentatonic (A, C, D, E, G) by chord for harmonic match
  ARPS_BY_CHORD: [
    [440.0, 523.3, 659.3, 880.0],  // Am: A4, C5, E5, A5
    [440.0, 523.3, 587.3, 784.0],  // F:  A4, C5, D5, G5
    [392.0, 523.3, 659.3, 784.0],  // C:  G4, C5, E5, G5
    [392.0, 440.0, 587.3, 784.0],  // G:  G4, A4, D5, G5
  ],
  arp: { running: false, scheduledUpTo: 0, noteIndex: 0 },

  startArp () {
    if (!this.ctx) return;
    this.arp.running = true;
    // Sync start time with beat scheduler (or now + small offset)
    this.arp.scheduledUpTo = this.beat.scheduledUpTo > 0
      ? this.beat.scheduledUpTo
      : this.ctx.currentTime + 0.1;
    this.arp.noteIndex = 0;
  },

  stopArp () {
    this.arp.running = false;
    this.arp.scheduledUpTo = 0;
    this.arp.noteIndex = 0;
  },

  // Schedule a single arpeggio note: square wave + bandpass filter
  _scheduleArpNote (time, freq, duration) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    osc.detune.setValueAtTime(5, time); // slight detune
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * 1.5, time);
    filter.Q.setValueAtTime(3, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.15, time + 0.01);
    gain.gain.linearRampToValueAtTime(0, time + duration * 0.85);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + duration);
    osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
  },

  // Called every frame — schedules arp notes ahead using AudioContext timing
  updateArp (scrollSpeed) {
    if (!this.ctx || !this.arp.running) return;
    const now = this.ctx.currentTime;
    const t = Math.max(0, Math.min(1, (scrollSpeed - 200) / 600));
    const bpm = 90 + t * 60; // matches beat BPM
    const beatInterval = 60 / bpm;

    // Sub-division: quarter notes at slow, sixteenth at fast
    // t < 0.33 → 1 note/beat, t < 0.67 → 2 notes/beat, else 4 notes/beat
    const subDiv = t < 0.33 ? 1 : t < 0.67 ? 2 : 4;
    const noteInterval = beatInterval / subDiv;
    const noteDuration = noteInterval * 0.75; // 75% gate for crispness

    const lookAhead = beatInterval * 4;
    while (this.arp.scheduledUpTo < now + lookAhead) {
      const time = this.arp.scheduledUpTo;
      const ni = this.arp.noteIndex;

      // Get notes from current chord (A minor pentatonic, chord-matched)
      const chordIdx = this.pad.chordIdx < 0 ? 0 : this.pad.chordIdx;
      const notes = this.ARPS_BY_CHORD[chordIdx];

      // Pattern type changes every 8 bars (32 beats)
      const barIdx = Math.floor(this.beat.beatIndex / 4);
      const patternType = Math.floor(barIdx / 8) % 3;

      let noteArrayIdx;
      if (patternType === 0) {
        // Ascending
        noteArrayIdx = ni % notes.length;
      } else if (patternType === 1) {
        // Descending (inversion)
        noteArrayIdx = (notes.length - 1) - (ni % notes.length);
      } else {
        // Offset inversion: start from index 1
        noteArrayIdx = (ni + 1) % notes.length;
      }

      this._scheduleArpNote(time, notes[noteArrayIdx], noteDuration);
      this.arp.scheduledUpTo += noteInterval;
      this.arp.noteIndex++;
    }
  },
};

// Survivor flash text state
let survivorFlash = null; // {timer: 2.0} when active

// Graded collision state
let speedPenaltyMultiplier = 1.0; // multiplicative speed reduction factor (1.0 = no penalty)
let speedPenaltyTimer = 0;        // remaining seconds for speed penalty
let invulnTimer = 0;              // remaining invulnerability seconds after collision
let redFlash = { alpha: 0 };      // frontal hit red flash overlay state
let dangerFlashAlpha = 0;         // screen-edge red flash when traffic is nearby (US-010)
let hitStopFrames = 0;            // frames remaining in hit-stop freeze (US-011); update() skipped while > 0
const particles = [];             // spark particles
let playerVisible = true;         // set to false during explosion sequence

// Post-collision spawn pause (US-014)
let spawnPauseTimer = 0; // seconds remaining in spawn suppression window

// Phase transition flags — ensure each transition triggers exactly once
let phaseTriggered = { sky: false, space: false };

// Near miss / combo state
let comboMultiplier = 1;  // 1 = base (no active combo), 2+ = active combo
let comboResetTimer = 0;  // seconds until combo resets to 1
let comboScaleTimer = 0;  // countdown for scale-in animation on new near miss
let comboExpireShakeTimer = 0; // brief shake when combo expires (0.15s)
let comboExpireFadeTimer = 0;  // fade-out after combo expires (0.3s)
let comboMilestoneFlash = 0;   // white flash at milestone levels (0.1s)
let comboGlowAlpha = 0;        // combo edge glow intensity (fades in/out)
let scorePunchScale = 0;       // score punch animation (0 = none, decays to 0)
let scorePunchColor = null;    // score punch color from combo tier
let comboZoom = 1.0;           // camera zoom level (lerps toward target)

// Near miss tracking for game over stats
let nearMissCount = 0;
let bestCombo = 0;
let nearMissBonusTotal = 0;
let nearMissHintShown = false; // first-time discoverability hint (US-011)

// DDA (Dynamic Difficulty Adjustment) state
let ddaCleanTimer = 0;   // seconds since last collision (resets on any hit)
let ddaSpawnRate = 1.0;  // traffic spawn rate multiplier; +5% per 10s clean, cap 1.5; halves on collision

// Floating pickup text state (US-009): all item collects + near-miss, rendered above world below HUD
const floatTexts = []; // {x, y, timer, text, color}

// Nitro state
let nitroTimer = 0;      // countdown during active boost (3s → 0)
let nitroEaseTimer = 0;  // countdown during ease-out (0.5s → 0)

// Chromatic aberration state (US-002)
let chromaTimer = 0;        // countdown (s); 0 = inactive
let chromaDuration = 0.4;   // total duration of current trigger (for decay calc)
let chromaIntensity = 1.0;  // peak intensity: 1.0 = full (collision), 0.6 = nitro

// Shield state
let shieldBreakFlash = 0; // countdown for bright border flash after shield absorbs a hit

// Weapon (shooting) state
let shootingTimer = 0; // countdown during active shooting power-up
let bulletFireTimer = 0; // cooldown between automatic shots (US-002)

// Pause state (US-003)
let gamePaused = false;
let pauseAudioWasMuted = false; // track if audio was already muted before pause

// Camera roll state (US-006)
let cameraRoll = 0; // current roll in degrees; positive = tilt left, negative = tilt right

// Beat-pulse HUD state (US-008)
// Each pulse value decays from 1→0 exponentially; drives scale/alpha in HUD render functions
let beatPulse = 0;    // fires on every kick beat → animates score + speed indicator
let nitroPulse = 0;   // fires on beat when nitro is active → animates nitro meter glow
let coinPulse = 0;    // fires on coin collect (not beat-driven) → animates score scale
// Precompute per-frame decay factors: reach ~0.1% of initial value by target duration at 60 fps
const BEAT_PULSE_DECAY = Math.pow(0.001, (1 / 60) / 0.08); // ~0 by 80 ms
const COIN_PULSE_DECAY = Math.pow(0.001, (1 / 60) / 0.06); // ~0 by 60 ms

// Adaptive HUD opacity constants (US-012)
const HUD_OPACITY_STEADY = 0.65; // base opacity during steady state
const HUD_OPACITY_RAMP_IN = 0.1;  // seconds to ramp to 1.0 on change
const HUD_OPACITY_HOLD = 1.5;  // seconds to hold at 1.0 after last change
const HUD_OPACITY_RAMP_OUT = 0.5;  // seconds to fade back to STEADY
// Per-element trackers: {trackedValue, lastChanged, currentAlpha}
const hudOpacity = {
  score: { trackedValue: -1, lastChanged: -9999, currentAlpha: HUD_OPACITY_STEADY },
  fuel: { trackedValue: -1, lastChanged: -9999, currentAlpha: HUD_OPACITY_STEADY },
};

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

// Offscreen canvases for chromatic aberration (US-002) — initialized once
const chromaCanvasR = document.createElement('canvas');
chromaCanvasR.width = CANVAS_WIDTH;
chromaCanvasR.height = CANVAS_HEIGHT;
const chromaCtxR = chromaCanvasR.getContext('2d');

const chromaCanvasB = document.createElement('canvas');
chromaCanvasB.width = CANVAS_WIDTH;
chromaCanvasB.height = CANVAS_HEIGHT;
const chromaCtxB = chromaCanvasB.getContext('2d');

// Offscreen canvas for motion blur / frame ghosting (US-003) — initialized once
const ghostCanvas = document.createElement('canvas');
ghostCanvas.width = CANVAS_WIDTH;
ghostCanvas.height = CANVAS_HEIGHT;
const ghostCtx = ghostCanvas.getContext('2d');
let ghostValid = false; // true once first capture has been taken above 600 px/s

// Offscreen canvas for bloom / glow effects (US-004) — initialized once
const bloomCanvas = document.createElement('canvas');
bloomCanvas.width = CANVAS_WIDTH;
bloomCanvas.height = CANVAS_HEIGHT;
const bloomCtx = bloomCanvas.getContext('2d');

// Offscreen canvas for heat haze / road shimmer (US-007) — initialized once
const hazeCanvas = document.createElement('canvas');
hazeCanvas.width = CANVAS_WIDTH;
hazeCanvas.height = CANVAS_HEIGHT;
const hazeCtx = hazeCanvas.getContext('2d');

// --- Mobile Touch Controls (US-001 / US-002) ---
// Only show touch controls on actual mobile/touch devices
const _isTouchDevice = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
const _isMobileViewport = () => Math.min(window.innerWidth, window.innerHeight) <= 900;
const isMobileDevice = _isTouchDevice && _isMobileViewport();

const touchBtnStyle = document.createElement('style');
touchBtnStyle.textContent = `
  .touch-left, .touch-right {
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .touch-btn-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(52px, 14vw, 72px);
    height: clamp(52px, 14vw, 72px);
    border-radius: 50%;
    background: linear-gradient(145deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 100%);
    border: 1.5px solid rgba(255,255,255,0.22);
    box-shadow:
      0 4px 24px rgba(0,0,0,0.35),
      inset 0 1px 0 rgba(255,255,255,0.18),
      inset 0 -1px 0 rgba(0,0,0,0.25);
    transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.08s ease, border-color 0.08s ease;
  }
  .touch-btn-inner svg {
    width: clamp(22px, 6vw, 32px);
    height: clamp(22px, 6vw, 32px);
    fill: none;
    stroke: rgba(255,255,255,0.80);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 1px 4px rgba(0,0,0,0.6));
    transition: stroke 0.08s ease;
  }
  .touch-left.active .touch-btn-inner,
  .touch-right.active .touch-btn-inner {
    transform: scale(0.88);
    background: linear-gradient(145deg, rgba(255,200,50,0.35) 0%, rgba(255,100,0,0.20) 100%);
    border-color: rgba(255,210,60,0.60);
    box-shadow:
      0 2px 12px rgba(0,0,0,0.35),
      0 0 22px rgba(255,180,0,0.45),
      inset 0 1px 0 rgba(255,255,180,0.25);
  }
  .touch-left.active .touch-btn-inner svg,
  .touch-right.active .touch-btn-inner svg {
    stroke: rgba(255,225,80,1);
    filter: drop-shadow(0 0 6px rgba(255,200,0,0.8));
  }
`;
document.head.appendChild(touchBtnStyle);

const _svgLeft = `<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>`;
const _svgRight = `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;

const touchLeft = document.createElement('div');
touchLeft.className = 'touch-left';
touchLeft.innerHTML = `<div class="touch-btn-inner">${_svgLeft}</div>`;
touchLeft.style.cssText = [
  'position:fixed',
  'display:none',
  'touch-action:none',
  'z-index:100',
  'box-sizing:border-box',
].join(';') + ';';

const touchRight = document.createElement('div');
touchRight.className = 'touch-right';
touchRight.innerHTML = `<div class="touch-btn-inner">${_svgRight}</div>`;
touchRight.style.cssText = [
  'position:fixed',
  'display:none',
  'touch-action:none',
  'z-index:100',
  'box-sizing:border-box',
].join(';') + ';';

document.body.appendChild(touchLeft);
document.body.appendChild(touchRight);

function setupTouchBtn (el, key) {
  el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; el.classList.add('active'); }, { passive: false });
  el.addEventListener('touchmove', (e) => { e.preventDefault(); keys[key] = true; el.classList.add('active'); }, { passive: false });
  el.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; el.classList.remove('active'); }, { passive: false });
  el.addEventListener('touchcancel', (e) => { e.preventDefault(); keys[key] = false; el.classList.remove('active'); }, { passive: false });
}
setupTouchBtn(touchLeft, 'ArrowLeft');
setupTouchBtn(touchRight, 'ArrowRight');

// --- Gyroscope Controls (US-004) ---
let gyroEnabled = false;        // Whether gyroscope control is currently active
let gyroSupported = false;      // Whether device supports DeviceOrientation
let gyroPermissionGranted = false; // iOS 13+ permission state
let gyroGamma = 0;              // Raw gamma reading (left/right tilt, -90 to +90)
const GYRO_DEAD_ZONE = 5;       // ±5° dead zone
const GYRO_MAX_ANGLE = 35;      // Max tilt angle for full speed
const GYRO_SENSITIVITY = 1.0;   // Base sensitivity multiplier (adjustable in US-005)

// Detect gyroscope support
if (window.DeviceOrientationEvent) {
  gyroSupported = true;
}

function onDeviceOrientation (e) {
  if (e.gamma !== null && e.gamma !== undefined) {
    gyroGamma = e.gamma; // -90 (left) to +90 (right)
  }
}

function startGyroscope () {
  window.addEventListener('deviceorientation', onDeviceOrientation, true);
  gyroEnabled = true;
  // Hide arrow buttons when gyroscope active
  if (isMobileDevice) {
    touchLeft.style.display = 'none';
    touchRight.style.display = 'none';
    // Clear any stuck key states from touch buttons
    keys['ArrowLeft'] = false;
    keys['ArrowRight'] = false;
  }
}

function stopGyroscope () {
  window.removeEventListener('deviceorientation', onDeviceOrientation, true);
  gyroEnabled = false;
  gyroGamma = 0;
  // Restore arrow buttons if in playingState
  if (isMobileDevice && fsm.currentState === playingState) {
    touchLeft.style.display = 'flex';
    touchRight.style.display = 'flex';
  }
}

async function requestGyroPermissionAndStart () {
  // iOS 13+ requires explicit permission request from a user gesture
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission === 'granted') {
        gyroPermissionGranted = true;
        startGyroscope();
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  } else {
    // Non-iOS or older iOS — no permission needed
    gyroPermissionGranted = true;
    startGyroscope();
    return true;
  }
}

function toggleGyroscope () {
  if (gyroEnabled) {
    stopGyroscope();
  } else {
    if (gyroPermissionGranted) {
      startGyroscope();
    } else {
      requestGyroPermissionAndStart();
    }
  }
}

// Letterbox scaling - preserves aspect ratio
function resizeCanvas () {
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
  positionNameForm();
  positionTouchButtons(displayWidth, displayHeight);
  positionRankingBtn();
  positionRankingBackBtn();
  positionFeedbackBtn();
  positionGameOverRanking();
}

function positionTouchButtons (displayWidth, displayHeight) {
  // Center the canvas display area
  const left = (window.innerWidth - displayWidth) / 2;
  const top = (window.innerHeight - displayHeight) / 2;
  const btnHeight = displayHeight * 0.20;
  const btnWidth = displayWidth / 2;
  const btnTop = top + displayHeight - btnHeight;

  touchLeft.style.left = `${left}px`;
  touchLeft.style.top = `${btnTop}px`;
  touchLeft.style.width = `${btnWidth}px`;
  touchLeft.style.height = `${btnHeight}px`;

  touchRight.style.left = `${left + btnWidth}px`;
  touchRight.style.top = `${btnTop}px`;
  touchRight.style.width = `${btnWidth}px`;
  touchRight.style.height = `${btnHeight}px`;
}

// Declared early so positionNameForm() guard works when resizeCanvas() is called below
let nameFormEl = null;
// Declared early so positionRankingBtn/positionRankingBackBtn guard works when resizeCanvas() is called below
let rankingBtnEl = null;
let rankingBackBtnEl = null;
// Declared early so positionFeedbackBtn() guard works when resizeCanvas() is called below
let feedbackBtnEl = null;
// DOM ranking container for game over screen
let gameOverRankingEl = null;

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Name Input Overlay (US-006) ---
nameFormEl = document.createElement('div');
nameFormEl.style.cssText = [
  'display:none',
  'position:fixed',
  'flex-direction:column',
  'align-items:stretch',
  'gap:6px',
  'width:260px',
  'transform:translateX(-50%)',
  'z-index:30',
].join(';') + ';';

const nameInputEl = document.createElement('input');
nameInputEl.type = 'text';
nameInputEl.placeholder = 'Seu nome';
nameInputEl.maxLength = 15;
nameInputEl.style.cssText = [
  'font:14px monospace',
  'padding:9px 12px',
  'background:rgba(255,255,255,0.07)',
  'color:#fff',
  'border:1px solid rgba(255,255,255,0.25)',
  'border-radius:10px',
  'text-align:center',
  'outline:none',
  'box-sizing:border-box',
].join(';') + ';';

const nameErrorEl = document.createElement('span');
nameErrorEl.style.cssText = 'color:#EF5350;font:11px monospace;visibility:hidden;text-align:center;';
nameErrorEl.textContent = 'Nome muito curto';

const nameSubmitEl = document.createElement('button');
nameSubmitEl.textContent = 'Enviar Score ↑';
nameSubmitEl.style.cssText = [
  'font:bold 13px monospace',
  'padding:9px 0',
  'background:rgba(229,57,53,0.25)',
  'color:#FF5252',
  'border:1.5px solid rgba(229,57,53,0.55)',
  'border-radius:10px',
  'cursor:pointer',
  'box-sizing:border-box',
].join(';') + ';';

nameFormEl.append(nameInputEl, nameErrorEl, nameSubmitEl);
document.body.appendChild(nameFormEl);

// Restore saved name
nameInputEl.value = localStorage.getItem('roadRushPlayerName') || '';

function positionNameForm () {
  if (!nameFormEl || nameFormEl.style.display === 'none') return;
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_WIDTH;
  const centerX = rect.left + rect.width / 2;
  // Position below stats block — canvas logical y ≈ 195
  nameFormEl.style.left = `${centerX}px`;
  nameFormEl.style.top = `${rect.top + 195 * scale}px`;
}

function showNameForm () {
  nameInputEl.value = localStorage.getItem('roadRushPlayerName') || '';
  nameErrorEl.style.visibility = 'hidden';
  nameSubmitEl.textContent = 'Enviar Score';
  nameSubmitEl.disabled = false;
  nameFormEl.style.display = 'flex';
  positionNameForm();
  nameInputEl.focus();
}

function hideNameForm () {
  nameFormEl.style.display = 'none';
}

// Prevent game controls when typing in name input
nameInputEl.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    e.preventDefault();
    handleNameSubmit();
  }
});

const SCORE_WEBHOOK_URL = 'https://n8n.ai-solutions.startse.com/webhook/e6c46e71-f564-4e8b-b6bd-041ca8f012e0';
const FEEDBACK_WEBHOOK_URL = 'https://n8n.ai-solutions.startse.com/webhook/e6c46e71-f564-4e8b-b6bd-041ca8f012e0/feedback';

function handleNameSubmit () {
  const name = nameInputEl.value.trim();
  if (name.length < 2) {
    nameErrorEl.style.visibility = 'visible';
    return;
  }
  nameErrorEl.style.visibility = 'hidden';
  localStorage.setItem('roadRushPlayerName', name);

  nameSubmitEl.textContent = 'Enviando...';
  nameSubmitEl.disabled = true;

  const payload = {
    name,
    score: gameOverState.finalScore,
    distance: Math.floor(gameOverState.finalDistance / 100), // meters
    time: parseFloat(gameOverState.finalTime.toFixed(1)),
    causeOfDeath: gameOverState.causeOfDeath || 'collision',
    coinsCollected: gameOverState.coinsCollected,
  };

  fetch(SCORE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      nameSubmitEl.textContent = 'Score enviado! ✓';
      nameSubmitEl.disabled = true;
      setTimeout(fetchRanking, 2000);
    })
    .catch(() => {
      nameSubmitEl.textContent = 'Falha ao enviar. Tente novamente';
      nameSubmitEl.disabled = false;
    });
}

nameSubmitEl.addEventListener('click', handleNameSubmit);

function fetchRanking () {
  gameOverState.rankingStatus = 'loading';
  gameOverState.rankingData = [];
  gameOverState._rankingBuilt = false;
  fetch(SCORE_WEBHOOK_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const entries = Array.isArray(data) ? data : [];
      gameOverState.rankingData = entries
        .filter((e) => e && typeof e.name === 'string' && typeof e.score === 'number')
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);
      gameOverState.rankingStatus = 'loaded';
    })
    .catch(() => {
      gameOverState.rankingStatus = 'error';
    });
}

// --- Ranking Button (title screen) ---
rankingBtnEl = document.createElement('button');
rankingBtnEl.id = 'ranking-btn';
rankingBtnEl.textContent = '🏆 RANKING';
rankingBtnEl.style.cssText = [
  'display:none',
  'position:fixed',
  'z-index:20',
  'background:rgba(0,0,0,0.55)',
  'color:#fff',
  'border:1.5px solid rgba(255,255,255,0.35)',
  'border-radius:22px',
  'height:40px',
  'font:14px monospace',
  'padding:0 20px',
  'cursor:pointer',
  'white-space:nowrap',
  'transform:translateX(-50%)',
  'backdrop-filter:blur(4px)',
  '-webkit-backdrop-filter:blur(4px)',
].join(';') + ';';
document.body.appendChild(rankingBtnEl);

rankingBtnEl.addEventListener('click', () => {
  if (fsm.currentState === titleState) {
    fsm.transition(titleRankingState);
  }
});

function positionRankingBtn () {
  if (!rankingBtnEl) return;
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_WIDTH;
  rankingBtnEl.style.left = `${rect.left + rect.width / 2}px`;
  rankingBtnEl.style.top = `${rect.top + 440 * scale}px`;
}

// --- Ranking Back Button (titleRanking screen) ---
rankingBackBtnEl = document.createElement('button');
rankingBackBtnEl.id = 'ranking-back-btn';
rankingBackBtnEl.textContent = 'VOLTAR';
rankingBackBtnEl.style.cssText = [
  'display:none',
  'position:fixed',
  'z-index:20',
  'background:rgba(0,0,0,0.55)',
  'color:#fff',
  'border:1.5px solid rgba(255,255,255,0.35)',
  'border-radius:20px',
  'min-height:44px',
  'min-width:120px',
  'font:16px monospace',
  'padding:0 18px',
  'cursor:pointer',
].join(';') + ';';
document.body.appendChild(rankingBackBtnEl);

rankingBackBtnEl.addEventListener('click', () => {
  if (fsm.currentState === titleRankingState) {
    fsm.transition(titleState);
  }
});

function positionRankingBackBtn () {
  if (!rankingBackBtnEl) return;
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_WIDTH;
  rankingBackBtnEl.style.left = `${rect.left + rect.width / 2 - 60}px`;
  rankingBackBtnEl.style.top = `${rect.top + 660 * scale}px`;
}

// --- DOM Ranking Container for Game Over ---
gameOverRankingEl = document.createElement('div');
gameOverRankingEl.id = 'gameover-ranking';
gameOverRankingEl.style.cssText = [
  'display:none',
  'position:fixed',
  'z-index:20',
  'overflow-y:auto',
  'overflow-x:hidden',
  '-webkit-overflow-scrolling:touch',
  'scrollbar-width:thin',
  'scrollbar-color:rgba(255,255,255,0.2) transparent',
].join(';') + ';';
document.body.appendChild(gameOverRankingEl);

// Prevent touch events on ranking from reaching canvas
gameOverRankingEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
gameOverRankingEl.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
gameOverRankingEl.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });

function positionGameOverRanking () {
  if (!gameOverRankingEl || gameOverRankingEl.style.display === 'none') return;
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_WIDTH;
  const topY = 268 * scale + rect.top;
  const bottomY = 640 * scale + rect.top;
  const pad = 12 * scale;
  gameOverRankingEl.style.left = `${rect.left + pad}px`;
  gameOverRankingEl.style.top = `${topY}px`;
  gameOverRankingEl.style.width = `${rect.width - pad * 2}px`;
  gameOverRankingEl.style.height = `${bottomY - topY}px`;
}

function buildRankingDOM (rankingData, highlightName) {
  gameOverRankingEl.innerHTML = '';
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_WIDTH;
  const baseFontSize = Math.max(10, Math.round(11 * scale));
  const MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

  // Header
  const header = document.createElement('div');
  header.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:4px 4px 6px;border-bottom:1px solid rgba(255,255,255,0.15);margin-bottom:4px;`;
  const headerLeft = document.createElement('span');
  headerLeft.textContent = '\u{1F3C6}  TOP RANKING';
  headerLeft.style.cssText = `color:rgba(255,255,255,0.70);font:bold ${baseFontSize}px monospace;`;
  const headerRight = document.createElement('span');
  headerRight.textContent = `${rankingData.length} jogadores`;
  headerRight.style.cssText = `color:rgba(255,255,255,0.30);font:${baseFontSize - 2}px monospace;`;
  header.append(headerLeft, headerRight);
  gameOverRankingEl.appendChild(header);

  if (rankingData.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'Nenhum score ainda';
    empty.style.cssText = `color:rgba(255,255,255,0.5);font:${baseFontSize}px monospace;text-align:center;padding:16px 0;`;
    gameOverRankingEl.appendChild(empty);
    return;
  }

  rankingData.forEach((entry, i) => {
    const rank = i + 1;
    const isPlayer = highlightName && highlightName.length >= 2 && entry.name === highlightName;
    const row = document.createElement('div');
    const rowH = Math.max(28, Math.round(32 * scale));
    let bgColor;
    if (isPlayer) bgColor = 'rgba(255,215,0,0.18)';
    else if (rank <= 3) bgColor = 'rgba(255,255,255,0.07)';
    else bgColor = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.12)';

    const borderLeft = (isPlayer || rank <= 3)
      ? `3px solid ${isPlayer ? '#FFD700' : rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : '#CD7F32'}`
      : '3px solid transparent';

    row.style.cssText = `display:flex;align-items:center;height:${rowH}px;background:${bgColor};border-left:${borderLeft};border-radius:4px;margin-bottom:2px;padding:0 6px;`;

    // Rank
    const rankEl = document.createElement('span');
    rankEl.style.cssText = `width:24px;text-align:center;flex-shrink:0;font:${rank <= 3 ? baseFontSize + 1 : baseFontSize - 1}px monospace;`;
    if (rank <= 3) {
      rankEl.textContent = MEDALS[rank - 1];
    } else {
      rankEl.textContent = String(rank);
      rankEl.style.color = 'rgba(255,255,255,0.35)';
    }

    // Name
    const nameEl = document.createElement('span');
    nameEl.textContent = String(entry.name || '').substring(0, 14);
    nameEl.style.cssText = `flex:1;font:bold ${baseFontSize}px monospace;color:${isPlayer ? '#FFD700' : 'rgba(255,255,255,0.92)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:4px;`;

    // Score
    const scoreEl = document.createElement('span');
    scoreEl.textContent = entry.score.toLocaleString();
    scoreEl.style.cssText = `font:bold ${baseFontSize}px monospace;color:${isPlayer ? '#FFE066' : '#7EC8E3'};margin-left:8px;flex-shrink:0;`;

    // Distance
    const distEl = document.createElement('span');
    const dist = typeof entry.distance === 'number' ? entry.distance : 0;
    distEl.textContent = `${dist}m`;
    distEl.style.cssText = `font:${baseFontSize - 2}px monospace;color:rgba(255,255,255,0.45);margin-left:6px;width:38px;text-align:right;flex-shrink:0;`;

    row.append(rankEl, nameEl, scoreEl, distEl);
    gameOverRankingEl.appendChild(row);
  });
}

function showGameOverRanking () {
  gameOverRankingEl.style.display = 'block';
  positionGameOverRanking();
}

function hideGameOverRanking () {
  gameOverRankingEl.style.display = 'none';
  gameOverRankingEl.innerHTML = '';
}

// --- Feedback Button & Modal (US-006) ---
feedbackBtnEl = document.createElement('button');
feedbackBtnEl.id = 'feedback-btn';
feedbackBtnEl.textContent = '💡 Sugerir Melhoria';
feedbackBtnEl.style.cssText = [
  'display:none',
  'position:fixed',
  'z-index:20',
  'background:rgba(255,193,7,0.13)',
  'color:#FFC107',
  'border:1.5px solid rgba(255,193,7,0.40)',
  'border-radius:22px',
  'height:40px',
  'font:14px monospace',
  'padding:0 20px',
  'cursor:pointer',
  'white-space:nowrap',
  'transform:translateX(-50%)',
  'backdrop-filter:blur(4px)',
  '-webkit-backdrop-filter:blur(4px)',
].join(';') + ';';
document.body.appendChild(feedbackBtnEl);

function positionFeedbackBtn () {
  if (!feedbackBtnEl) return;
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_WIDTH;
  feedbackBtnEl.style.left = `${rect.left + rect.width / 2}px`;
  feedbackBtnEl.style.top = `${rect.top + 655 * scale}px`;
}

// --- Feedback Modal ---
const feedbackModalEl = document.createElement('div');
feedbackModalEl.id = 'feedback-modal';
feedbackModalEl.style.cssText = [
  'display:none',
  'position:fixed',
  'inset:0',
  'z-index:100',
  'background:rgba(0,0,0,0.80)',
  'align-items:center',
  'justify-content:center',
  'padding:16px',
  'box-sizing:border-box',
].join(';') + ';';

const feedbackCardEl = document.createElement('div');
feedbackCardEl.style.cssText = [
  'background:linear-gradient(160deg,#1A1A2E 0%,#16213E 100%)',
  'border:1.5px solid rgba(255,193,7,0.40)',
  'border-radius:18px',
  'padding:28px 24px 24px',
  'width:100%',
  'max-width:360px',
  'max-height:calc(100vh - 32px)',
  'overflow-y:auto',
  'display:flex',
  'flex-direction:column',
  'gap:14px',
  'position:relative',
  'box-shadow:0 8px 40px rgba(0,0,0,0.6)',
  'box-sizing:border-box',
].join(';') + ';';

const feedbackTitleEl = document.createElement('h2');
feedbackTitleEl.textContent = '💡 Sugira uma Melhoria';
feedbackTitleEl.style.cssText = [
  'color:#FFC107',
  'font:bold 18px monospace',
  'margin:0',
  'padding-right:28px',
].join(';') + ';';

const feedbackSubtitleEl = document.createElement('p');
feedbackSubtitleEl.textContent = 'Sua sugestão será analisada pela equipe. Deixe seu nome para ser avisado quando for implementado!';
feedbackSubtitleEl.style.cssText = [
  'color:rgba(255,255,255,0.60)',
  'font:13px monospace',
  'margin:0',
  'line-height:1.5',
].join(';') + ';';

const feedbackTextEl = document.createElement('textarea');
feedbackTextEl.id = 'feedback-text';
feedbackTextEl.placeholder = 'O que você gostaria de ver no jogo?';
feedbackTextEl.maxLength = 500;
feedbackTextEl.rows = 4;
feedbackTextEl.style.cssText = [
  'font:14px monospace',
  'background:rgba(255,255,255,0.07)',
  'color:#fff',
  'border:1px solid rgba(255,255,255,0.20)',
  'border-radius:10px',
  'padding:12px',
  'resize:vertical',
  'width:100%',
  'box-sizing:border-box',
  'outline:none',
  'line-height:1.5',
].join(';') + ';';

const feedbackNameEl = document.createElement('input');
feedbackNameEl.id = 'feedback-name';
feedbackNameEl.type = 'text';
feedbackNameEl.placeholder = 'Seu nome (opcional)';
feedbackNameEl.maxLength = 40;
feedbackNameEl.style.cssText = [
  'font:14px monospace',
  'background:rgba(255,255,255,0.07)',
  'color:#fff',
  'border:1px solid rgba(255,255,255,0.20)',
  'border-radius:10px',
  'padding:12px',
  'width:100%',
  'box-sizing:border-box',
  'outline:none',
].join(';') + ';';

const feedbackErrorEl = document.createElement('span');
feedbackErrorEl.id = 'feedback-error';
feedbackErrorEl.style.cssText = 'color:#EF5350;font:12px monospace;min-height:14px;';

const feedbackSubmitEl = document.createElement('button');
feedbackSubmitEl.id = 'feedback-submit';
feedbackSubmitEl.textContent = '✉ Enviar Sugestão';
feedbackSubmitEl.style.cssText = [
  'font:bold 14px monospace',
  'background:rgba(255,193,7,0.18)',
  'color:#FFC107',
  'border:1.5px solid rgba(255,193,7,0.50)',
  'border-radius:22px',
  'height:44px',
  'padding:0 24px',
  'cursor:pointer',
  'align-self:stretch',
  'transition:background 0.15s',
].join(';') + ';';

const feedbackCloseEl = document.createElement('button');
feedbackCloseEl.textContent = '✕';
feedbackCloseEl.style.cssText = [
  'position:absolute',
  'top:14px',
  'right:16px',
  'background:rgba(255,255,255,0.08)',
  'border:none',
  'border-radius:50%',
  'color:rgba(255,255,255,0.70)',
  'font:16px monospace',
  'width:28px',
  'height:28px',
  'cursor:pointer',
  'line-height:28px',
  'text-align:center',
  'padding:0',
].join(';') + ';';

feedbackCardEl.append(feedbackTitleEl, feedbackSubtitleEl, feedbackTextEl, feedbackNameEl, feedbackErrorEl, feedbackSubmitEl, feedbackCloseEl);
feedbackModalEl.appendChild(feedbackCardEl);
document.body.appendChild(feedbackModalEl);

function openFeedbackModal () {
  feedbackTextEl.value = '';
  feedbackNameEl.value = localStorage.getItem('roadRushPlayerName') || '';
  feedbackErrorEl.textContent = '';
  feedbackSubmitEl.textContent = 'Enviar Sugestão';
  feedbackSubmitEl.disabled = false;
  feedbackModalEl.style.display = 'flex';
}

function closeFeedbackModal () {
  feedbackModalEl.style.display = 'none';
}

feedbackBtnEl.addEventListener('click', openFeedbackModal);
feedbackCloseEl.addEventListener('click', closeFeedbackModal);

// Close on backdrop click (not on card click)
feedbackModalEl.addEventListener('click', (e) => {
  if (e.target === feedbackModalEl) closeFeedbackModal();
});

// Prevent game key handling when typing
feedbackTextEl.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') closeFeedbackModal();
});
feedbackNameEl.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') closeFeedbackModal();
});

feedbackSubmitEl.addEventListener('click', async () => {
  const suggestion = feedbackTextEl.value.trim();
  const name = feedbackNameEl.value.trim();
  if (!suggestion || !name) {
    feedbackErrorEl.textContent = 'Preencha todos os campos antes de enviar.';
    return;
  }
  feedbackErrorEl.textContent = '';
  feedbackSubmitEl.textContent = 'Enviando...';
  feedbackSubmitEl.disabled = true;
  try {
    const res = await fetch(FEEDBACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, suggestion }),
    });
    if (!res.ok) throw new Error('server error');
    feedbackSubmitEl.textContent = 'Obrigado! ✓';
    setTimeout(() => closeFeedbackModal(), 1500);
  } catch {
    feedbackSubmitEl.textContent = 'Erro. Tentar novamente';
    feedbackSubmitEl.disabled = false;
  }
});

// Abort controller for title ranking fetch
let titleRankingAbortController = null;

// --- Tap to Start / Tap to Retry / Tap Mute Icon / Swipe Ranking ---
let touchStartY = 0; // canvas coords at touchstart

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  const scaleY = CANVAS_HEIGHT / rect.height;
  touchStartY = (touch.clientY - rect.top) * scaleY;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  const touch = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  const cx = (touch.clientX - rect.left) * scaleX;
  const cy = (touch.clientY - rect.top) * scaleY;

  // Check mute icon tap first (44×44 area centered on CANVAS_WIDTH-28, 54)
  const muteX = CANVAS_WIDTH - 28;
  const muteY = 54;
  if (cx >= muteX - 22 && cx <= muteX + 22 && cy >= muteY - 22 && cy <= muteY + 22) {
    AudioManager.toggleMute();
    return;
  }

  if (fsm.currentState === titleState) {
    AudioManager.init();
    AudioManager.resume();
    AudioManager.startTitleDrone();
    AudioManager.playRiser();
    resetGameState();
    fsm.transition(playingState);
  } else if (fsm.currentState === gameOverState) {
    const delta = touchStartY - cy;
    if (Math.abs(delta) < 10) {
      // Tap gesture: retry (only if tapping outside ranking area)
      // Ranking area is roughly canvas y 268-640; check if tap is above it or below
      if (cy < 268 || cy > 640) {
        AudioManager.playDrumRoll();
        resetGameState();
        fsm.transition(playingState);
      }
    }
  } else if (fsm.currentState === titleRankingState) {
    const delta = touchStartY - cy; // positive = swipe up = scroll down
    if (Math.abs(delta) >= 10) {
      // Swipe gesture: scroll ranking
      if (titleRankingState.rankingStatus === 'loaded' && titleRankingState.rankingData.length > 10) {
        const maxScroll = titleRankingState.rankingData.length - 10;
        const scrollDelta = Math.round(delta / 30);
        titleRankingState.rankingScroll = Math.max(0, Math.min(titleRankingState.rankingScroll + scrollDelta, maxScroll));
      }
    }
  }
  // No tap action during playingState
}, { passive: false });

// --- Prevent scroll/zoom when touching canvas or touch buttons ---
document.body.addEventListener('touchmove', (e) => {
  if (e.target === canvas || e.target === touchLeft || e.target === touchRight) {
    e.preventDefault();
  }
}, { passive: false });

// --- Mute icon + Pause button click detection ---
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  // Pause overlay "Continuar" button (US-003): centered at (200, CANVAS_HEIGHT/2+40), 180x44
  if (gamePaused) {
    const btnX = CANVAS_WIDTH / 2;
    const btnY = CANVAS_HEIGHT / 2 + 40;
    if (cx >= btnX - 90 && cx <= btnX + 90 && cy >= btnY - 22 && cy <= btnY + 22) {
      togglePause();
      return;
    }
    // Any click while paused that's not the button — also unpause
    togglePause();
    return;
  }

  // Pause button area: top-right, near mute but above it (US-003)
  // Icon centered at (CANVAS_WIDTH - 28, 20), hit area ~32x24
  if (cx >= CANVAS_WIDTH - 44 && cx <= CANVAS_WIDTH - 12 && cy >= 4 && cy <= 36) {
    togglePause();
    return;
  }

  // Mute icon area: top-right corner, 32x32 region
  if (cx >= CANVAS_WIDTH - 40 && cx <= CANVAS_WIDTH - 4 && cy >= 36 && cy <= 72) {
    AudioManager.toggleMute();
  }
});

// --- Input tracking ---
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

// Track single key presses (consumed on read)
const justPressed = {};
window.addEventListener('keydown', (e) => {
  if (!e.repeat) justPressed[e.key] = true;
});

function consumeKey (key) {
  if (justPressed[key]) {
    justPressed[key] = false;
    return true;
  }
  return false;
}

// --- FSM ---
const fsm = {
  currentState: null,

  transition (newState) {
    if (this.currentState && this.currentState.onExit) {
      this.currentState.onExit();
    }
    this.currentState = newState;
    if (this.currentState.onEnter) {
      this.currentState.onEnter();
    }
  },

  update (dt) {
    if (this.currentState && this.currentState.update) {
      this.currentState.update(dt);
    }
  },

  render (ctx) {
    if (this.currentState && this.currentState.render) {
      this.currentState.render(ctx);
    }
  },
};

// --- Screen Shake ---
const shake = { time: 0, maxTime: SHAKE_DURATION, intensity: SHAKE_INTENSITY };

function triggerShake (duration, intensity) {
  const dur = duration !== undefined ? duration : SHAKE_DURATION;
  const inten = intensity !== undefined ? intensity : SHAKE_INTENSITY;
  // Priority system: only apply if new intensity >= remaining intensity of current shake
  const remainingIntensity = shake.time > 0 ? shake.intensity * (shake.time / shake.maxTime) : 0;
  if (inten < remainingIntensity) return; // don't override stronger shake in progress
  shake.time = dur;
  shake.maxTime = dur;
  shake.intensity = inten;
}

// Returns the nitro speed multiplier (1.0 normally, 1.3 during boost, eases back to 1.0)
function getNitroMultiplier () {
  if (nitroTimer > 0) return NITRO_BOOST_FACTOR;
  if (nitroEaseTimer > 0) {
    const progress = nitroEaseTimer / NITRO_EASE_DURATION; // 1→0 as ease progresses
    return 1.0 + (NITRO_BOOST_FACTOR - 1.0) * progress;
  }
  return 1.0;
}

// Returns scroll speed with active penalty and nitro boost applied
function getEffectiveScrollSpeed () {
  return gameState.scrollSpeed * speedPenaltyMultiplier * getNitroMultiplier();
}

// Apply a multiplicative speed penalty; overwrites if the new penalty is stronger
function applySpeedPenalty (factor, duration) {
  if (factor < speedPenaltyMultiplier || speedPenaltyTimer <= 0) {
    speedPenaltyMultiplier = factor;
    speedPenaltyTimer = duration;
  }
}

// Spawn spark particles at (x, y), count 4-8
function spawnSparks (x, y, count) {
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

function spawnExplosion (x, y) { } // deprecated — replaced by shockwave ring system

function renderShockwaveRings (ctx) {
  if (shockwaveRings.length === 0) return;
  const ringColors = ['#FFFFFF', '#FFF176', '#FF7043', '#E53935'];
  ctx.save();
  for (const ring of shockwaveRings) {
    const rawProgress = (ring.elapsed - ring.startOffset) / ring.duration;
    if (rawProgress <= 0) continue;
    const p = Math.min(1, rawProgress);
    const radius = p * ring.maxRadius;
    const alpha = 1 - p;
    const lineWidth = Math.max(1, 4 * (1 - p));
    const colorIdx = Math.min(3, Math.floor(p * ringColors.length));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ringColors[colorIdx];
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Dynamic speed vignette — darkens screen edges progressively with speed (tunnel vision)
// US-001: distinct from the red fuel-warning vignette; uses black/dark-grey
function renderSpeedVignette (ctx) {
  const speed = gameState.scrollSpeed;
  let alpha;
  if (speed < 300) {
    return; // invisible below 300 px/s
  } else if (speed < 600) {
    alpha = ((speed - 300) / 300) * 0.25; // 0 → 0.25 over 300–600 px/s
  } else {
    alpha = 0.25 + ((speed - 600) / 200) * 0.30; // 0.25 → 0.55 over 600–800 px/s
    alpha = Math.min(alpha, 0.55);
  }
  const vignette = ctx.createRadialGradient(
    CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.25,
    CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.85
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// Screen-edge danger flash — red radial glow from edges when traffic is nearby (US-010)
// Zero cost when dangerFlashAlpha === 0; only active during playingState.
function renderDangerFlash (ctx) {
  if (dangerFlashAlpha <= 0) return;
  const grad = ctx.createRadialGradient(
    CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.2,
    CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.8
  );
  grad.addColorStop(0, 'rgba(255,0,0,0)');
  grad.addColorStop(1, `rgba(255,0,0,${dangerFlashAlpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// Combo edge glow — ambient glow on top/bottom borders during active combo (US-006)
function renderComboGlow (ctx) {
  if (comboGlowAlpha <= 0.001) return;
  const color = getComboColor(comboMultiplier >= 2 ? comboMultiplier : 2);
  // Breathing pulse: alpha oscillates at ~1Hz
  const pulse = 0.15 + 0.1 * Math.sin(gameState.elapsedTime * Math.PI * 2);
  const alpha = comboGlowAlpha * pulse;

  ctx.save();
  // Top edge glow
  const topGrad = ctx.createLinearGradient(0, 0, 0, 100);
  topGrad.addColorStop(0, color);
  topGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, 100);

  // Bottom edge glow
  const botGrad = ctx.createLinearGradient(0, CANVAS_HEIGHT, 0, CANVAS_HEIGHT - 100);
  botGrad.addColorStop(0, color);
  botGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, CANVAS_HEIGHT - 100, CANVAS_WIDTH, 100);
  ctx.restore();
}

// Chromatic aberration — RGB split overlay on impact and nitro (US-002)
// Snapshots the current canvas frame, extracts red/blue channels via multiply,
// and re-draws them offset by ±3px with 'screen' compositing.
// Zero cost when chromaTimer === 0.
function renderChromaticAberration () {
  if (chromaTimer <= 0) return;
  const t = chromaTimer / chromaDuration;        // 1.0 at start → 0.0 at end (linear decay)
  const intensity = chromaIntensity * t;
  if (intensity <= 0.005) return;

  const offset = 3 * intensity;
  const alpha = 0.4 * intensity;

  // Build red-channel snapshot
  chromaCtxR.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  chromaCtxR.drawImage(canvas, 0, 0);
  chromaCtxR.globalCompositeOperation = 'multiply';
  chromaCtxR.fillStyle = 'rgb(255, 0, 0)';
  chromaCtxR.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  chromaCtxR.globalCompositeOperation = 'source-over';

  // Build blue-channel snapshot
  chromaCtxB.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  chromaCtxB.drawImage(canvas, 0, 0);
  chromaCtxB.globalCompositeOperation = 'multiply';
  chromaCtxB.fillStyle = 'rgb(0, 0, 255)';
  chromaCtxB.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  chromaCtxB.globalCompositeOperation = 'source-over';

  // Composite onto main canvas with screen blending
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha;
  ctx.drawImage(chromaCanvasR, offset, 0);
  ctx.drawImage(chromaCanvasB, -offset, 0);
  ctx.restore();
}

// Motion blur: composite previous frame as ghost behind current frame (US-003)
// Called AFTER renderRoad() clears the background, BEFORE renderTraffic()/renderPlayer()
function renderMotionGhost () {
  const speed = gameState.scrollSpeed;
  if (speed <= 600 || !ghostValid) return;
  const alpha = speed > 700 ? 0.28 : 0.18;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(ghostCanvas, 0, 0);
  ctx.restore();
}

// Capture the road/traffic/player/particles layer to ghostCanvas for use next frame (US-003)
// Called AFTER renderParticles(), BEFORE overlays and HUD
function captureGhostFrame () {
  const speed = gameState.scrollSpeed;
  if (speed <= 600) {
    if (ghostValid) {
      ghostCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ghostValid = false;
    }
    return;
  }
  ghostCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ghostCtx.drawImage(canvas, 0, 0);
  ghostValid = true;
}

// Bloom / glow effect for collectibles and player headlights (US-004)
// Renders each target at 2× scale with blur onto bloomCanvas, then composites 'lighter' onto main canvas.
function renderBloom () {
  bloomCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  bloomCtx.filter = 'blur(8px)';

  // Coin halos (gold)
  bloomCtx.fillStyle = '#FFD700';
  for (const coin of gameState.coins) {
    if (coin.collectAnim !== null) continue;
    bloomCtx.save();
    bloomCtx.globalAlpha = 0.6;
    bloomCtx.translate(coin.x, coin.y);
    bloomCtx.scale(2, 2);
    bloomCtx.beginPath();
    bloomCtx.arc(0, 0, COIN_RADIUS, 0, Math.PI * 2);
    bloomCtx.fill();
    bloomCtx.restore();
  }

  // Fuel halos (green)
  bloomCtx.fillStyle = '#43A047';
  for (const item of gameState.fuelItems) {
    if (item.collectAnim !== null) continue;
    bloomCtx.save();
    bloomCtx.globalAlpha = 0.6;
    bloomCtx.translate(item.x, item.y);
    bloomCtx.scale(2, 2);
    bloomCtx.beginPath();
    bloomCtx.arc(0, 0, FUEL_ITEM_RADIUS, 0, Math.PI * 2);
    bloomCtx.fill();
    bloomCtx.restore();
  }

  // Nitro halos (yellow triangle)
  bloomCtx.fillStyle = '#FFD600';
  for (const item of gameState.nitroItems) {
    if (item.collectAnim !== null) continue;
    bloomCtx.save();
    bloomCtx.globalAlpha = 0.6;
    bloomCtx.translate(item.x, item.y);
    bloomCtx.scale(2, 2);
    const s = NITRO_ITEM_HALF;
    bloomCtx.beginPath();
    bloomCtx.moveTo(0, -s);
    bloomCtx.lineTo(s, s);
    bloomCtx.lineTo(-s, s);
    bloomCtx.closePath();
    bloomCtx.fill();
    bloomCtx.restore();
  }

  // Shield halos (blue circle)
  bloomCtx.fillStyle = '#42A5F5';
  for (const item of gameState.shieldItems) {
    if (item.collectAnim !== null) continue;
    bloomCtx.save();
    bloomCtx.globalAlpha = 0.6;
    bloomCtx.translate(item.x, item.y);
    bloomCtx.scale(2, 2);
    bloomCtx.beginPath();
    bloomCtx.arc(0, 0, SHIELD_ITEM_RADIUS, 0, Math.PI * 2);
    bloomCtx.fill();
    bloomCtx.restore();
  }

  // Weapon halos (red-orange)
  bloomCtx.fillStyle = '#FF5522';
  for (const item of gameState.weaponItems) {
    if (item.collectAnim !== null) continue;
    bloomCtx.save();
    bloomCtx.globalAlpha = 0.6;
    bloomCtx.translate(item.x, item.y);
    bloomCtx.scale(2, 2);
    bloomCtx.beginPath();
    bloomCtx.arc(0, 0, WEAPON_ITEM_RADIUS, 0, Math.PI * 2);
    bloomCtx.fill();
    bloomCtx.restore();
  }

  // Bullet halos (phase-dependent color) — US-002
  for (const b of gameState.bullets) {
    const phase = b.phase || gameState.phase;
    bloomCtx.fillStyle = phase === 'space' ? '#00FF66' : phase === 'sky' ? '#42A5F5' : '#FFCC00';
    bloomCtx.save();
    bloomCtx.globalAlpha = 0.5;
    bloomCtx.translate(b.x, b.y);
    bloomCtx.scale(2, 2);
    bloomCtx.beginPath();
    bloomCtx.arc(0, 0, BULLET_WIDTH, 0, Math.PI * 2);
    bloomCtx.fill();
    bloomCtx.restore();
  }

  // Player headlights (front two white circles) — skip during invulnerability blink frames
  const blinkHidden = invulnTimer > 0 && Math.floor(invulnTimer / BLINK_INTERVAL) % 2 === 1;
  if (!blinkHidden) {
    const p = gameState.player;
    bloomCtx.save();
    bloomCtx.globalAlpha = 0.7;
    bloomCtx.fillStyle = '#FFFFFF';
    bloomCtx.beginPath();
    bloomCtx.arc(p.x + 8, p.y + 5, 5, 0, Math.PI * 2);
    bloomCtx.fill();
    bloomCtx.beginPath();
    bloomCtx.arc(p.x + PLAYER_WIDTH - 8, p.y + 5, 5, 0, Math.PI * 2);
    bloomCtx.fill();
    bloomCtx.restore();
  }

  bloomCtx.filter = 'none';

  // Composite bloom canvas onto main canvas using 'lighter' for additive glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(bloomCanvas, 0, 0);
  ctx.restore();
}

// Heat haze / road shimmer at high speed (US-007)
// Renders road to hazeCanvas then draws it back with per-band horizontal offset for the lower 40%.
// Returns true if haze was rendered (caller should skip normal renderRoad call).
function renderHeatHaze (scrollOffset) {
  const speed = gameState.scrollSpeed;
  if (speed <= 500) return false;

  // Intensity: 0 at 500 px/s → 3px at 800 px/s
  const intensity = Math.min((speed - 500) / 300, 1) * 3;
  const time = gameState.elapsedTime;
  const hazeStartY = Math.floor(CANVAS_HEIGHT * 0.6); // lower 40% of canvas
  const bandH = 4; // horizontal band height in pixels

  // Render the road layer onto hazeCanvas (renderRoad accepts any ctx)
  renderRoad(hazeCtx, scrollOffset);

  // Draw hazeCanvas undistorted onto main canvas (fills entire road area)
  ctx.drawImage(hazeCanvas, 0, 0);

  // Overdraw the lower 40% with per-band x-offset shimmer
  for (let y = hazeStartY; y < CANVAS_HEIGHT; y += bandH) {
    const sinOffset = Math.sin(time * 3 + y * 0.08) * intensity;
    const sliceH = Math.min(bandH, CANVAS_HEIGHT - y);
    ctx.drawImage(hazeCanvas, 0, y, CANVAS_WIDTH, sliceH, sinOffset, y, CANVAS_WIDTH, sliceH);
  }

  return true;
}

// White speed lines in the 40px rumble-strip margins when scrollSpeed > 500
function renderSpeedLines (ctx) {
  const speed = gameState.scrollSpeed;
  if (speed <= 500) return;
  const intensityFrac = Math.min(1, (speed - 500) / 200); // 0 at 500, 1 at 700+
  const alpha = intensityFrac * 0.55;
  const lineLength = 12 + intensityFrac * 42; // 12px at 500, 54px at 700+
  // Lines scroll 2× faster than the road for a parallax blur effect
  const offset = (gameState.scrollOffset * 2) % SPEED_LINE_PERIOD;

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  ctx.globalAlpha = alpha;
  for (const line of speedLineData) {
    const y = ((line.yPhase + offset) % SPEED_LINE_PERIOD) - 80;
    ctx.beginPath();
    ctx.moveTo(line.x, y);
    ctx.lineTo(line.x, y + lineLength);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

// Spawn a floating pickup text at (x, y) (US-009); max 8 simultaneous, oldest removed if exceeded
function spawnFloatText (x, y, text, color, scale = 1.0, duration = FLOAT_TEXT_DURATION) {
  if (floatTexts.length >= 8) floatTexts.splice(0, 1);
  floatTexts.push({ x, y, timer: duration, maxTimer: duration, text, color, scale });
}

// Combo color palette: returns a color based on combo level
function getComboColor (level) {
  if (level <= 1) return '#FF8800'; // orange (base)
  if (level === 2) return '#FFD700'; // gold
  if (level === 3) return '#00FFDD'; // cyan
  return '#FF44FF'; // magenta (x4+)
}

// Trigger a near miss event for vehicle v (called when min distance < threshold)
function triggerNearMiss (v) {
  const preCombo = comboMultiplier; // capture level before increment for display
  const pts = NEAR_MISS_BASE_POINTS * preCombo;
  gameState.score += pts;
  comboMultiplier += 1;
  comboResetTimer = COMBO_RESET_TIME;
  comboScaleTimer = COMBO_SCALE_DURATION;

  // Track near miss stats
  nearMissCount++;
  nearMissBonusTotal += pts;
  bestCombo = Math.max(bestCombo, comboMultiplier);

  // Near miss whoosh + combo stinger
  AudioManager.playNearMiss();
  if (comboMultiplier >= 2) AudioManager.playComboUp(comboMultiplier);

  // Combo milestone flash + SFX (x3, x5, x8)
  if (comboMultiplier === 3 || comboMultiplier === 5 || comboMultiplier === 8) {
    comboMilestoneFlash = 0.1;
    AudioManager.playComboMilestone(comboMultiplier);
  }

  // Near miss screen shake — intensity scales with combo, won't override stronger collision shake
  triggerShake(0.12, Math.min(2 + comboMultiplier, 5));

  // Score punch animation (US-007)
  scorePunchScale = Math.min(0.4, 0.15 + comboMultiplier * 0.05);
  scorePunchColor = getComboColor(comboMultiplier);

  // White flash on the vehicle's side closest to the player
  const playerCenterX = gameState.player.x + PLAYER_WIDTH / 2;
  const vCenterX = v.x + v.width / 2;
  v.nearMissFlash = {
    side: playerCenterX < vCenterX ? 'left' : 'right',
    timer: NEAR_MISS_FLASH_DURATION,
  };

  // Floating near-miss text with points + multiplier (US-002)
  // Use pre-increment combo for display: '+50' at x1, 'x2 +100!' at x2, etc.
  const comboColor = getComboColor(preCombo);
  const floatScale = Math.min(1.5, 1.0 + (preCombo - 1) * 0.12);
  const floatLabel = preCombo <= 1
    ? '+' + pts
    : 'x' + preCombo + ' +' + pts + '!';
  spawnFloatText(playerCenterX, gameState.player.y + PLAYER_HEIGHT * 0.3, floatLabel, comboColor, floatScale);

  // Near miss spark particles from player's side closest to vehicle (US-005)
  const vehicleIsRight = vCenterX > playerCenterX;
  const sparkX = vehicleIsRight
    ? gameState.player.x + PLAYER_WIDTH
    : gameState.player.x;
  const sparkY = gameState.player.y + PLAYER_HEIGHT * 0.4;
  const sparkCount = Math.min(20, 8 + (comboMultiplier - 1) * 3);
  const sparkColor = comboColor;
  const lateralDir = vehicleIsRight ? 1 : -1;
  for (let i = 0; i < sparkCount; i++) {
    particles.push({
      x: sparkX,
      y: sparkY + (Math.random() - 0.5) * PLAYER_HEIGHT * 0.5,
      vx: lateralDir * (80 + Math.random() * 70),
      vy: (Math.random() - 0.5) * 100,
      life: 0.3 + Math.random() * 0.2,
      maxLife: 0.5,
      color: sparkColor,
      size: 1.5 + Math.random() * 2,
    });
  }
}

function updateParticles (dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function spawnTransitionParticles (fromPhase, toPhase) {
  const px = gameState.player.x + 20; // center of player
  const py = gameState.player.y + 32; // center of player
  if (toPhase === 'sky') {
    // 20 white particles rising upward
    const count = 20;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: px + (Math.random() - 0.5) * 300,
        y: py + Math.random() * 200,
        vx: (Math.random() - 0.5) * 100,
        vy: -(80 + Math.random() * 120),
        life: 2,
        maxLife: 2,
        color: '#FFFFFF',
        size: 2,
        isTransition: true,
      });
    }
  } else if (toPhase === 'space') {
    // 30 cyan particles streaking horizontally
    const count = 30;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * 400,
        y: Math.random() * 700,
        vx: (Math.random() - 0.5) * 400,
        vy: 0,
        life: 1.5,
        maxLife: 1.5,
        color: '#00E5FF',
        size: 2,
        isTransition: true,
      });
    }
  }
}

function renderParticles (ctx) {
  const highSpeed = gameState.scrollSpeed > 600;
  for (const p of particles) {
    const baseAlpha = Math.max(0, p.life / p.maxLife);
    if (p.isNitro) {
      // Nitro exhaust: additive 'lighter' compositing; boost size and alpha at high speed (US-004)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, baseAlpha + (highSpeed ? 0.15 : 0));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (highSpeed ? 1.3 : 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.isTransition) {
      // Transition particles: render as velocity-oriented lines
      ctx.globalAlpha = baseAlpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const len = Math.min(20, speed * 0.08);
      const nx = speed > 0 ? p.vx / speed : 0;
      const ny = speed > 0 ? p.vy / speed : 0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - nx * len, p.y - ny * len);
      ctx.stroke();
    } else {
      ctx.globalAlpha = baseAlpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Handle a vehicle collision — classify lateral vs frontal, apply graded effects
function handleVehicleCollision (v) {
  const player = gameState.player;

  // Shield absorbs any collision (including fatal), skipping all effects
  if (player.hasShield) {
    player.hasShield = false;
    shieldBreakFlash = SHIELD_BREAK_FLASH_DURATION;
    AudioManager.playShieldBreak();
    v.collided = true; // tag vehicle so overtake bonus is skipped
    invulnTimer = Math.max(invulnTimer, INVULN_DURATION);
    spawnPauseTimer = DIFFICULTY.traffic.spawnPauseDuration;
    return;
  }

  const relativeVy = getEffectiveScrollSpeed() * (1 - VEHICLE_TYPES[v.type].speedRatio); // approach speed on screen
  const isLateral = Math.abs(player.vx) > Math.abs(relativeVy) * 0.5;

  // Spark position: center of the overlap area
  const sparkX = player.x + PLAYER_WIDTH / 2;
  const sparkY = player.y + PLAYER_HEIGHT / 2;

  // Tag vehicle as collided (disqualifies from clean overtake bonus and near miss)
  v.collided = true;
  // Any collision resets survivor timer and combo
  gameState.survivorTimer = 0;
  comboMultiplier = 1;
  comboResetTimer = 0;
  // DDA: partial reset — accumulated spawn rate bonus halved, clean timer reset
  ddaSpawnRate = 1.0 + (ddaSpawnRate - 1.0) * 0.5;
  ddaCleanTimer = 0;

  // Any collision is fatal — trigger explosion immediately
  AudioManager.playTapeStop(); // pitch-drop all musical elements before explosion
  AudioManager.playCrash();
  triggerShake(0.5, 10);
  fsm.transition(explosionState);
  return;

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
    hasShield: false,
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
  // Coin collectibles
  coins: [],
  nextCoinSpawnDistance: COIN_SPAWN_MIN,
  coinsCollected: 0,
  // Nitro items
  nitroItems: [],
  nextNitroSpawnDistance: NITRO_SPAWN_MIN,
  // Shield items
  shieldItems: [],
  nextShieldSpawnDistance: SHIELD_SPAWN_MIN,
  // Weapon items
  weaponItems: [],
  nextWeaponSpawnDistance: WEAPON_SPAWN_MIN,
  // Bullets (projectiles from weapon power-up) — US-002
  bullets: [],
  // Phase system
  phase: 'road',
  phaseTransition: { progress: 0, active: false, from: '', to: '' },
};

function resetGameState () {
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
  dangerFlashAlpha = 0;
  particles.length = 0;
  spawnPauseTimer = 0;
  // Reset fuel state
  gameState.fuel = FUEL_INITIAL;
  gameState.fuelItems = [];
  AudioManager.fuelWarning.timer = 0;
  gameState.nextFuelSpawnDistance = FUEL_SPAWN_BASE_MIN + Math.random() * (FUEL_SPAWN_BASE_MAX - FUEL_SPAWN_BASE_MIN);
  // Reset scoring
  gameState.score = 0;
  gameState.displayedScore = 0;
  gameState.survivorTimer = 0;
  survivorFlash = null;
  // Reset near miss / combo
  comboMultiplier = 1;
  comboResetTimer = 0;
  comboScaleTimer = 0;
  comboExpireShakeTimer = 0;
  comboExpireFadeTimer = 0;
  comboMilestoneFlash = 0;
  comboGlowAlpha = 0;
  scorePunchScale = 0;
  scorePunchColor = null;
  comboZoom = 1.0;
  nearMissCount = 0;
  bestCombo = 0;
  nearMissBonusTotal = 0;
  nearMissHintShown = false;
  // Reset DDA fully on game over / retry
  ddaCleanTimer = 0;
  ddaSpawnRate = 1.0;
  // Reset coin state
  gameState.coins = [];
  gameState.nextCoinSpawnDistance = COIN_SPAWN_MIN + Math.random() * (COIN_SPAWN_MAX - COIN_SPAWN_MIN);
  floatTexts.length = 0; // US-009
  gameState.coinsCollected = 0;
  // Reset nitro state
  gameState.nitroItems = [];
  gameState.nextNitroSpawnDistance = NITRO_SPAWN_MIN + Math.random() * (NITRO_SPAWN_MAX - NITRO_SPAWN_MIN);
  nitroTimer = 0;
  nitroEaseTimer = 0;
  // Reset chromatic aberration
  chromaTimer = 0;
  // Reset hit stop (US-011)
  hitStopFrames = 0;
  // Reset adaptive HUD opacity (US-012)
  hudOpacity.score.trackedValue = -1;
  hudOpacity.score.lastChanged = -9999;
  hudOpacity.score.currentAlpha = HUD_OPACITY_STEADY;
  hudOpacity.fuel.trackedValue = -1;
  hudOpacity.fuel.lastChanged = -9999;
  hudOpacity.fuel.currentAlpha = HUD_OPACITY_STEADY;
  // Reset motion blur ghost (US-003)
  ghostValid = false;
  // Reset camera roll (US-006)
  cameraRoll = 0;
  // Reset beat-pulse HUD state (US-008)
  beatPulse = 0;
  nitroPulse = 0;
  coinPulse = 0;
  // Reset shield state
  gameState.player.hasShield = false;
  gameState.shieldItems = [];
  gameState.nextShieldSpawnDistance = SHIELD_SPAWN_MIN + Math.random() * (SHIELD_SPAWN_MAX - SHIELD_SPAWN_MIN);
  shieldBreakFlash = 0;
  // Reset weapon state
  gameState.player.shooting = false;
  shootingTimer = 0;
  bulletFireTimer = 0;
  gameState.bullets = [];
  gameState.weaponItems = [];
  gameState.nextWeaponSpawnDistance = WEAPON_SPAWN_MIN + Math.random() * (WEAPON_SPAWN_MAX - WEAPON_SPAWN_MIN);
  // Reset VFX
  explosions.length = 0;
  shockwaveRings.length = 0;
  playerVisible = true;
  explosionState.screenFlashAlpha = 0;
  explosionState.fadeInAlpha = 0;
  explosionState.textAlpha = 0;
  explosionState.timer = 0;
  // Reset phase system
  gameState.phase = 'road';
  gameState.phaseTransition = { progress: 0, active: false, from: '', to: '' };
  phaseTriggered = { sky: false, space: false };
}

// --- Scroll Speed Ramp ---
function updateScrollSpeed (dt) {
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
// Returns road perspective convergence factor [0..0.30] based on scroll speed (US-005)
// At 600 px/s: 15% top-width reduction; at 800 px/s: 30% (maximum)
function getRoadFovFactor () {
  const speed = gameState.scrollSpeed;
  if (speed <= 600) {
    return 0.15 * (speed / 600);
  }
  return 0.15 + 0.15 * Math.min(1, (speed - 600) / 200);
}

function renderRoad (ctx, scrollOffset) {
  const phase = gameState.phase;
  const pt = gameState.phaseTransition;

  // During active transition, blend between from and to phases
  if (pt.active) {
    renderRoadTransition(ctx, scrollOffset, pt);
    return;
  }

  if (phase === 'sky') {
    renderRoadSky(ctx, scrollOffset);
    return;
  }

  if (phase === 'space') {
    renderRoadSpace(ctx, scrollOffset);
    return;
  }

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

    // Draw segments from above screen to below (top→bottom scroll)
    let y = rumbleOffset - RUMBLE_PERIOD;
    let colorIndex = 0;
    while (y < CANVAS_HEIGHT) {
      ctx.fillStyle = colorIndex % 2 === 0 ? '#E53935' : '#FFFFFF';
      ctx.fillRect(stripX, y, stripW, RUMBLE_SEGMENT);
      y += RUMBLE_SEGMENT;
      colorIndex++;
    }
  }

  // Dynamic FOV: road top edge narrows at high speed (US-005)
  const fovFactor = getRoadFovFactor();
  const roadCenter = (ROAD_LEFT + ROAD_RIGHT) / 2; // 200
  const topHalfWidth = (ROAD_WIDTH / 2) * (1 - fovFactor);
  const fovTopLeft = roadCenter - topHalfWidth;  // > ROAD_LEFT at speed
  const fovTopRight = roadCenter + topHalfWidth; // < ROAD_RIGHT at speed

  // Road surface (asphalt) as perspective trapezoid
  const roadGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  roadGradient.addColorStop(0, '#2A2A3E');
  roadGradient.addColorStop(1, '#26314E');
  ctx.fillStyle = roadGradient;
  ctx.beginPath();
  ctx.moveTo(fovTopLeft, 0);
  ctx.lineTo(fovTopRight, 0);
  ctx.lineTo(ROAD_RIGHT, CANVAS_HEIGHT);
  ctx.lineTo(ROAD_LEFT, CANVAS_HEIGHT);
  ctx.closePath();
  ctx.fill();

  // White border lines — converging edges of the trapezoid
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fovTopLeft, 0);
  ctx.lineTo(ROAD_LEFT, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fovTopRight, 0);
  ctx.lineTo(ROAD_RIGHT, CANVAS_HEIGHT);
  ctx.stroke();

  // Dashed lane markers — converge toward vanishing point at top
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([DASH_LENGTH, DASH_GAP]);
  const dashScrollOffset = scrollOffset % DASH_PERIOD;

  for (let i = 1; i < LANE_COUNT; i++) {
    const laneXBottom = ROAD_LEFT + i * LANE_WIDTH;
    // Converge toward road center at the top of screen
    const laneXTop = roadCenter + (laneXBottom - roadCenter) * (1 - fovFactor);
    // Extend the line beyond canvas for smooth dash scrolling (mirrors original approach)
    const dx = laneXBottom - laneXTop; // horizontal shift per CANVAS_HEIGHT of vertical travel
    const xAtY = (y) => laneXTop + dx * (y / CANVAS_HEIGHT);
    ctx.beginPath();
    ctx.moveTo(xAtY(dashScrollOffset - DASH_PERIOD), dashScrollOffset - DASH_PERIOD);
    ctx.lineTo(xAtY(CANVAS_HEIGHT + DASH_PERIOD), CANVAS_HEIGHT + DASH_PERIOD);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function renderRoadSky (ctx, scrollOffset) {
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, PHASE_BG_COLORS.sky.top);
  gradient.addColorStop(1, PHASE_BG_COLORS.sky.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  renderSkyElements(ctx, scrollOffset);
}

function renderRoadSpace (ctx, scrollOffset) {
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#0A0A1A');
  gradient.addColorStop(1, '#0D1B2A');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  renderSpaceElements(ctx, scrollOffset);
}

// Phase background color definitions for transitions
const PHASE_BG_COLORS = {
  road:  { top: '#1A1A2E', bottom: '#16213E' },
  sky:   { top: '#1B3A5C', bottom: '#4A7FB5' },
  space: { top: '#0A0A1A', bottom: '#0D1B2A' }
};

function renderRoadTransition (ctx, scrollOffset, pt) {
  const progress = pt.progress;
  const fromPhase = pt.from;
  const toPhase = pt.to;

  // 1. Interpolated background gradient
  const fromColors = PHASE_BG_COLORS[fromPhase];
  const toColors = PHASE_BG_COLORS[toPhase];
  const blendTop = lerpColor(fromColors.top, toColors.top, progress);
  const blendBottom = lerpColor(fromColors.bottom, toColors.bottom, progress);
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, blendTop);
  gradient.addColorStop(1, blendBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 2. Fade out elements of the "from" phase
  const fadeOut = 1 - progress;
  const savedAlpha = ctx.globalAlpha;

  if (fromPhase === 'road') {
    // Fade out rumble strips
    ctx.globalAlpha = fadeOut;
    renderRoadRumbleStrips(ctx, scrollOffset);
    renderRoadSurface(ctx, scrollOffset);
    ctx.globalAlpha = savedAlpha;
  } else if (fromPhase === 'sky') {
    // Fade out clouds, sky corridor, wind borders, sky lanes
    ctx.globalAlpha = fadeOut;
    renderSkyElements(ctx, scrollOffset);
    ctx.globalAlpha = savedAlpha;
  }

  // 3. Fade in elements of the "to" phase
  if (toPhase === 'sky') {
    ctx.globalAlpha = progress;
    renderSkyElements(ctx, scrollOffset);
    ctx.globalAlpha = savedAlpha;
  } else if (toPhase === 'space') {
    ctx.globalAlpha = progress;
    renderSpaceElements(ctx, scrollOffset);
    ctx.globalAlpha = savedAlpha;
  }
}

// Extracted: road rumble strips
function renderRoadRumbleStrips (ctx, scrollOffset) {
  const rumbleOffset = scrollOffset % RUMBLE_PERIOD;
  for (let side = 0; side < 2; side++) {
    const stripX = side === 0 ? 0 : ROAD_RIGHT;
    const stripW = ROAD_LEFT;
    let y = rumbleOffset - RUMBLE_PERIOD;
    let colorIndex = 0;
    while (y < CANVAS_HEIGHT) {
      ctx.fillStyle = colorIndex % 2 === 0 ? '#E53935' : '#FFFFFF';
      ctx.fillRect(stripX, y, stripW, RUMBLE_SEGMENT);
      y += RUMBLE_SEGMENT;
      colorIndex++;
    }
  }
}

// Extracted: road surface (asphalt trapezoid + borders + lanes)
function renderRoadSurface (ctx, scrollOffset) {
  const fovFactor = getRoadFovFactor();
  const roadCenter = (ROAD_LEFT + ROAD_RIGHT) / 2;
  const topHalfWidth = (ROAD_WIDTH / 2) * (1 - fovFactor);
  const fovTopLeft = roadCenter - topHalfWidth;
  const fovTopRight = roadCenter + topHalfWidth;

  const roadGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  roadGradient.addColorStop(0, '#2A2A3E');
  roadGradient.addColorStop(1, '#26314E');
  ctx.fillStyle = roadGradient;
  ctx.beginPath();
  ctx.moveTo(fovTopLeft, 0);
  ctx.lineTo(fovTopRight, 0);
  ctx.lineTo(ROAD_RIGHT, CANVAS_HEIGHT);
  ctx.lineTo(ROAD_LEFT, CANVAS_HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fovTopLeft, 0);
  ctx.lineTo(ROAD_LEFT, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fovTopRight, 0);
  ctx.lineTo(ROAD_RIGHT, CANVAS_HEIGHT);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([DASH_LENGTH, DASH_GAP]);
  const dashScrollOffset = scrollOffset % DASH_PERIOD;
  for (let i = 1; i < LANE_COUNT; i++) {
    const laneXBottom = ROAD_LEFT + i * LANE_WIDTH;
    const laneXTop = roadCenter + (laneXBottom - roadCenter) * (1 - fovFactor);
    const dx = laneXBottom - laneXTop;
    const xAtY = (y) => laneXTop + dx * (y / CANVAS_HEIGHT);
    ctx.beginPath();
    ctx.moveTo(xAtY(dashScrollOffset - DASH_PERIOD), dashScrollOffset - DASH_PERIOD);
    ctx.lineTo(xAtY(CANVAS_HEIGHT + DASH_PERIOD), CANVAS_HEIGHT + DASH_PERIOD);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// Extracted: sky phase elements (clouds + corridor + borders + lanes)
function renderSkyElements (ctx, scrollOffset) {
  const cloudScrollY = (scrollOffset * 0.3) % SKY_CLOUD_PERIOD;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (const cloud of skyCloudData) {
    let cy = (cloud.yPhase + cloudScrollY) % SKY_CLOUD_PERIOD - 20;
    if (cy < -20) cy += SKY_CLOUD_PERIOD;
    const cx = cloud.x - 20;
    ctx.beginPath();
    ctx.roundRect(cx, cy, 40, 15, 7);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(107, 179, 224, 0.15)';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ROAD_LEFT, 0);
  ctx.lineTo(ROAD_LEFT, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ROAD_RIGHT, 0);
  ctx.lineTo(ROAD_RIGHT, CANVAS_HEIGHT);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.setLineDash([DASH_LENGTH, DASH_GAP]);
  const dashScrollOffset = scrollOffset % DASH_PERIOD;
  for (let i = 1; i < LANE_COUNT; i++) {
    const laneX = ROAD_LEFT + i * LANE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(laneX, dashScrollOffset - DASH_PERIOD);
    ctx.lineTo(laneX, CANVAS_HEIGHT + DASH_PERIOD);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// Extracted: space phase elements (stars + corridor + borders + lanes)
function renderSpaceElements (ctx, scrollOffset) {
  for (const star of spaceStarData) {
    const speed = star.layer === 1 ? 0.1 : 0.2;
    const starScrollY = (scrollOffset * speed) % SPACE_STAR_PERIOD;
    let sy = (star.yPhase + starScrollY) % SPACE_STAR_PERIOD;
    if (sy < 0) sy += SPACE_STAR_PERIOD;
    if (sy >= -2 && sy <= CANVAS_HEIGHT + 2) {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
      ctx.fillRect(star.x, sy, star.size, star.size);
    }
  }

  ctx.fillStyle = 'rgba(13, 27, 42, 0.3)';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ROAD_LEFT, 0);
  ctx.lineTo(ROAD_LEFT, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ROAD_RIGHT, 0);
  ctx.lineTo(ROAD_RIGHT, CANVAS_HEIGHT);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.1)';
  ctx.lineWidth = 2;
  ctx.setLineDash([DASH_LENGTH, DASH_GAP]);
  const dashScrollOffset = scrollOffset % DASH_PERIOD;
  for (let i = 1; i < LANE_COUNT; i++) {
    const laneX = ROAD_LEFT + i * LANE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(laneX, dashScrollOffset - DASH_PERIOD);
    ctx.lineTo(laneX, CANVAS_HEIGHT + DASH_PERIOD);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// --- Player ---
function getPlayerHitbox (player) {
  return {
    x: player.x + 4,
    y: player.y + 6.5,
    w: 32,
    h: 51,
  };
}

function updatePlayer (dt) {
  const player = gameState.player;
  const left = keys['ArrowLeft'];
  const right = keys['ArrowRight'];

  // Gyroscope control (US-004): overrides keyboard/touch left/right
  if (gyroEnabled) {
    let gamma = gyroGamma * GYRO_SENSITIVITY;
    // Apply dead zone
    if (Math.abs(gamma) < GYRO_DEAD_ZONE) {
      gamma = 0;
    } else {
      // Remove dead zone offset and normalize
      gamma = gamma > 0 ? gamma - GYRO_DEAD_ZONE : gamma + GYRO_DEAD_ZONE;
    }
    // Clamp to max angle (after dead zone removal)
    const effectiveMax = GYRO_MAX_ANGLE - GYRO_DEAD_ZONE;
    gamma = Math.max(-effectiveMax, Math.min(effectiveMax, gamma));
    // Map to target velocity: -1..+1 → -MAX_SPEED..+MAX_SPEED
    const targetVx = (gamma / effectiveMax) * PLAYER_MAX_SPEED;
    // Smooth lerp toward target velocity
    player.vx += (targetVx - player.vx) * 0.15;
    // Snap to zero if very small
    if (Math.abs(player.vx) < 2) player.vx = 0;
  } else if (left && !right) {
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
    // Shield absorbs border collision
    if (player.hasShield) {
      player.hasShield = false;
      shieldBreakFlash = SHIELD_BREAK_FLASH_DURATION;
      AudioManager.playShieldBreak();
      invulnTimer = INVULN_DURATION;
      spawnPauseTimer = DIFFICULTY.traffic.spawnPauseDuration;
    } else {
      applySpeedPenalty(0.7, 1.0); // 30% speed reduction for 1s
      invulnTimer = INVULN_DURATION;
      spawnPauseTimer = DIFFICULTY.traffic.spawnPauseDuration;
      gameState.survivorTimer = 0;
      // DDA partial reset on border hit
      ddaSpawnRate = 1.0 + (ddaSpawnRate - 1.0) * 0.5;
      ddaCleanTimer = 0;
    }
  }

  // Camera roll: ease toward target based on lateral input (US-004/006)
  let rollTarget;
  if (gyroEnabled) {
    // Map gyro gamma to camera roll (-2.5 to +2.5)
    const clampedGamma = Math.max(-GYRO_MAX_ANGLE, Math.min(GYRO_MAX_ANGLE, gyroGamma));
    rollTarget = -(clampedGamma / GYRO_MAX_ANGLE) * 2.5;
  } else {
    rollTarget = (left && !right) ? 2.5 : ((right && !left) ? -2.5 : 0);
  }
  cameraRoll += (rollTarget - cameraRoll) * 0.12;
  cameraRoll = Math.max(-3, Math.min(3, cameraRoll));
}

function renderPlayer (ctx, player) {
  // Shield break flash renders even when car is blinking (always visible)
  if (shieldBreakFlash > 0) {
    const flashProgress = shieldBreakFlash / SHIELD_BREAK_FLASH_DURATION;
    ctx.save();
    ctx.globalAlpha = flashProgress;
    ctx.strokeStyle = '#42A5F5';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(player.x - 5, player.y - 5, player.width + 10, player.height + 10, 9);
    ctx.stroke();
    // Outer soft glow
    ctx.globalAlpha = flashProgress * 0.4;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(player.x - 8, player.y - 8, player.width + 16, player.height + 16, 12);
    ctx.stroke();
    ctx.restore();
  }

  // Blink every BLINK_INTERVAL seconds during invulnerability
  if (invulnTimer > 0) {
    const blinkPhase = Math.floor(invulnTimer / BLINK_INTERVAL) % 2;
    if (blinkPhase === 1) return; // skip rendering this blink frame
  }

  const { x, y, width, height } = player;
  const phase = gameState.phase;
  const pt = gameState.phaseTransition;

  // Active shield: subtle blue border/glow around car
  if (player.hasShield) {
    // Inner border
    ctx.strokeStyle = 'rgba(66, 165, 245, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 4, width + 8, height + 8, 8);
    ctx.stroke();
    // Outer soft glow
    ctx.strokeStyle = 'rgba(66, 165, 245, 0.3)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(x - 7, y - 7, width + 14, height + 14, 11);
    ctx.stroke();
  }

  // --- Space phase: spaceship ---
  if (phase === 'space' || (pt.active && (pt.to === 'space' || pt.from === 'space'))) {
    // During sky→space transition, crossfade: draw sky sprite with alpha (1-progress), space sprite with alpha progress
    const isTransitioningToSpace = pt.active && pt.to === 'space';
    const isTransitioningFromSpace = pt.active && pt.from === 'space';
    const spaceAlpha = isTransitioningToSpace ? pt.progress : isTransitioningFromSpace ? 1 - pt.progress : 1;

    // Draw sky sprite (fading out) during sky→space transition
    if (isTransitioningToSpace && pt.progress < 1) {
      const skyAlpha = 1 - pt.progress;
      const skyWingScale = 1 - pt.progress; // wings shrink as we leave sky
      ctx.save();
      ctx.globalAlpha = skyAlpha;

      // Car body
      ctx.fillStyle = '#E53935';
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 6);
      ctx.fill();

      // Wings shrinking
      if (skyWingScale > 0.01) {
        const wingW = 12 * skyWingScale;
        const wingH = 20 * skyWingScale;
        const wingY = y + (height - wingH) / 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = skyAlpha * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, wingY);
        ctx.lineTo(x - wingW, wingY + wingH / 2);
        ctx.lineTo(x, wingY + wingH);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + width, wingY);
        ctx.lineTo(x + width + wingW, wingY + wingH / 2);
        ctx.lineTo(x + width, wingY + wingH);
        ctx.closePath();
        ctx.fill();
      }

      // Windshield
      ctx.globalAlpha = skyAlpha;
      ctx.fillStyle = 'rgba(100, 180, 255, 0.6)';
      ctx.fillRect(x + 6, y + 8, width - 12, 16);
      ctx.fillRect(x + 6, y + height - 22, width - 12, 12);

      // Headlights
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x + 8, y + 5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + width - 8, y + 5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw space ship sprite
    if (spaceAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = spaceAlpha;

      const cx = x + width / 2; // center x

      // Thruster flames (behind ship, draw first)
      const flameTime = gameState.elapsedTime * 10;
      const flameH1 = 8 + 6 * Math.abs(Math.sin(flameTime));
      const flameH2 = 8 + 6 * Math.abs(Math.sin(flameTime + 2));
      const flameLerp = 0.5 + 0.5 * Math.sin(flameTime * 1.3);
      // Interpolate between #FF6600 and #FFCC00
      const flameR = 255;
      const flameG = Math.round(102 + (204 - 102) * flameLerp);
      const flameB = Math.round(0 + (0 - 0) * flameLerp);
      const flameColor = `rgb(${flameR}, ${flameG}, ${flameB})`;

      ctx.fillStyle = flameColor;
      // Left thruster flame
      ctx.fillRect(cx - 10, y + height, 6, flameH1);
      // Right thruster flame
      ctx.fillRect(cx + 4, y + height, 6, flameH2);

      // Main body: triangular aerodynamic shape (cyan)
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.moveTo(cx, y); // nose (top center)
      ctx.lineTo(x + width - 4, y + height - 6); // right bottom
      ctx.lineTo(x + 4, y + height - 6); // left bottom
      ctx.closePath();
      ctx.fill();

      // Cockpit (dark, at the top portion)
      ctx.fillStyle = '#0A1628';
      ctx.beginPath();
      ctx.moveTo(cx, y + 6); // tip
      ctx.lineTo(cx + 7, y + 22); // right
      ctx.lineTo(cx - 7, y + 22); // left
      ctx.closePath();
      ctx.fill();

      // Cockpit glass highlight
      ctx.fillStyle = 'rgba(100, 200, 255, 0.4)';
      ctx.beginPath();
      ctx.moveTo(cx, y + 8);
      ctx.lineTo(cx + 5, y + 20);
      ctx.lineTo(cx - 5, y + 20);
      ctx.closePath();
      ctx.fill();

      // Hull detail lines (2 horizontal white lines)
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 10, y + 28);
      ctx.lineTo(cx + 10, y + 28);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 12, y + 34);
      ctx.lineTo(cx + 12, y + 34);
      ctx.stroke();
      ctx.globalAlpha = spaceAlpha;

      // Thruster housings (2 orange rectangles 6×10 at rear)
      ctx.fillStyle = '#FF6600';
      ctx.fillRect(cx - 10, y + height - 10, 6, 10);
      ctx.fillRect(cx + 4, y + height - 10, 6, 10);

      // Thruster glow (pulsing arc behind thrusters)
      const glowAlpha = 0.3 + 0.25 * Math.sin(gameState.elapsedTime * 6);
      ctx.globalAlpha = glowAlpha * spaceAlpha;
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.arc(cx - 7, y + height, 6, 0, Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 7, y + height, 6, 0, Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      ctx.restore();
    }
    return;
  }

  // --- Sky phase: car with wings ---
  if (phase === 'sky' || (pt.active && (pt.to === 'sky' || pt.from === 'sky'))) {
    // Determine wing scale: grow during transition to sky, shrink during transition from sky
    let wingScale = 1;
    if (pt.active && pt.to === 'sky') wingScale = pt.progress;
    else if (pt.active && pt.from === 'sky') wingScale = 1 - pt.progress;

    // Wind trail lines (behind car, drawn first) — sinusoidal undulation, higher alpha
    const trailAlpha = 0.25 * wingScale;
    if (trailAlpha > 0.01) {
      const scrollAnim = (gameState.scrollOffset * 0.5) % 20;
      ctx.strokeStyle = `rgba(255, 255, 255, ${trailAlpha})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const trailX = x + 8 + i * 12 + Math.sin(gameState.elapsedTime * 3 + i) * 2;
        const trailY = y + height + 2 + i * 3 + scrollAnim;
        ctx.beginPath();
        ctx.moveTo(trailX, trailY);
        ctx.lineTo(trailX, trailY + 20);
        ctx.stroke();
      }
    }

    // Car body (same red car) with outline
    ctx.fillStyle = '#E53935';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 6);
    ctx.fill();
    ctx.strokeStyle = '#B71C1C';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Wings (triangular, gradient, alpha 0.8, 12×20px each, centered vertically on body)
    if (wingScale > 0.01) {
      const wingW = 12 * wingScale;
      const wingH = 20 * wingScale;
      const wingY = y + (height - wingH) / 2;
      ctx.save();
      ctx.globalAlpha = 0.8;

      // Left wing with gradient
      const leftGrad = ctx.createLinearGradient(x - wingW, wingY, x, wingY);
      leftGrad.addColorStop(0, '#CFD8DC');
      leftGrad.addColorStop(1, '#FFFFFF');
      ctx.fillStyle = leftGrad;
      ctx.beginPath();
      ctx.moveTo(x, wingY);
      ctx.lineTo(x - wingW, wingY + wingH / 2);
      ctx.lineTo(x, wingY + wingH);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#37474F';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Right wing with gradient
      const rightGrad = ctx.createLinearGradient(x + width, wingY, x + width + wingW, wingY);
      rightGrad.addColorStop(0, '#FFFFFF');
      rightGrad.addColorStop(1, '#CFD8DC');
      ctx.fillStyle = rightGrad;
      ctx.beginPath();
      ctx.moveTo(x + width, wingY);
      ctx.lineTo(x + width + wingW, wingY + wingH / 2);
      ctx.lineTo(x + width, wingY + wingH);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#37474F';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Ailerons/flaps at wing tips
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#B0BEC5';
      // Left aileron
      ctx.beginPath();
      ctx.moveTo(x - wingW, wingY + wingH / 2);
      ctx.lineTo(x - wingW - 4 * wingScale, wingY + wingH / 2 - 3 * wingScale);
      ctx.lineTo(x - wingW - 4 * wingScale, wingY + wingH / 2 + 3 * wingScale);
      ctx.closePath();
      ctx.fill();
      // Right aileron
      ctx.beginPath();
      ctx.moveTo(x + width + wingW, wingY + wingH / 2);
      ctx.lineTo(x + width + wingW + 4 * wingScale, wingY + wingH / 2 - 3 * wingScale);
      ctx.lineTo(x + width + wingW + 4 * wingScale, wingY + wingH / 2 + 3 * wingScale);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // Windshield
    ctx.fillStyle = 'rgba(100, 180, 255, 0.6)';
    ctx.fillRect(x + 6, y + 8, width - 12, 16);

    // Rear window
    ctx.fillRect(x + 6, y + height - 22, width - 12, 12);

    // Headlights
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x + 8, y + 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + width - 8, y + 5, 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // --- Default road phase car ---
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

  // Headlights (front two white circles — bloom glow added in renderBloom)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x + 8, y + 5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + width - 8, y + 5, 4, 0, Math.PI * 2);
  ctx.fill();
}

// --- Traffic System ---
function getVehicleHitbox (v) {
  const hbW = v.width * 0.8;
  const hbH = v.height * 0.8;
  return {
    x: v.x + (v.width - hbW) / 2,
    y: v.y + (v.height - hbH) / 2,
    w: hbW,
    h: hbH,
  };
}

function aabbOverlap (a, b) {
  return !(
    a.x + a.w < b.x ||
    a.x > b.x + b.w ||
    a.y + a.h < b.y ||
    a.y > b.y + b.h
  );
}

// --- Fairness constraint (US-009) ---

// Returns {minX, maxX} X extent of vehicle, accounting for projected lane changes over lookAheadS seconds
function getVehicleXExtent (v, lookAheadS) {
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
function findLargestGap (occupied, roadLeft, roadRight) {
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
function isFairToSpawn (candidate) {
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
function renderFairnessDebug (ctx) {
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
function getSpawnConfig (elapsed) {
  for (const tier of DIFFICULTY.traffic.tiers) {
    if (elapsed < tier.untilTime) {
      return { maxCount: tier.maxCount, spawnMin: tier.spawnMin, spawnMax: tier.spawnMax };
    }
  }
  const last = DIFFICULTY.traffic.tiers[DIFFICULTY.traffic.tiers.length - 1];
  return { maxCount: last.maxCount, spawnMin: last.spawnMin, spawnMax: last.spawnMax };
}

// Returns probability of picking an aggressive (lane-changing) vehicle type
function getAggressiveWeight (elapsed) {
  if (elapsed <= 0) return 0;
  if (elapsed <= 30) return 0.15 * (elapsed / 30);
  if (elapsed <= 60) return 0.15 + 0.20 * ((elapsed - 30) / 30);
  if (elapsed <= 90) return 0.35 + 0.25 * ((elapsed - 60) / 30);
  return 0.60;
}

function chooseVehicleType (elapsed) {
  const currentPhase = gameState.phase;
  const available = Object.entries(VEHICLE_TYPES).filter(([, t]) => elapsed >= t.minTime && t.phase === currentPhase);
  const aggressive = available.filter(([, t]) => t.behavior !== 'none');
  const passive = available.filter(([, t]) => t.behavior === 'none');

  let pool;
  if (aggressive.length > 0 && Math.random() < getAggressiveWeight(elapsed)) {
    pool = aggressive;
  } else {
    pool = passive.length > 0 ? passive : available;
  }

  const [typeName] = pool[Math.floor(Math.random() * pool.length)];
  return typeName;
}

function buildVehicleCandidate () {
  const elapsed = gameState.elapsedTime;
  const typeName = chooseVehicleType(elapsed);
  const type = VEHICLE_TYPES[typeName];
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const x = ROAD_LEFT + lane * LANE_WIDTH + (LANE_WIDTH - type.width) / 2;
  return { typeName, type, lane, x, y: -type.height, width: type.width, height: type.height };
}

function spawnVehicle (candidate) {
  const obj = {
    type: candidate.typeName,
    x: candidate.x,
    y: candidate.y,
    lane: candidate.lane,
    width: candidate.width,
    height: candidate.height,
    ownSpeed: 0, // computed dynamically in updateTraffic
    // Timer until next lane change (Infinity for non-changers)
    laneChangeTimer: candidate.type.behavior !== 'none'
      ? candidate.type.laneChangeMin + Math.random() * (candidate.type.laneChangeMax - candidate.type.laneChangeMin)
      : Infinity,
    laneChanging: null, // {startX, targetX, progress} while changing
    collided: false,   // true if player hit this vehicle (tracks overtake bonus)
    minDistX: Infinity, // min sprite-edge-to-edge horizontal dist during vertical overlap
    nearMissChecked: false, // true once near miss check has been performed
    nearMissFlash: null,    // {side: 'left'|'right', timer} when flashing
  };
  // Asteroid: pre-generate irregular polygon vertices and rotation state
  if (candidate.typeName === 'asteroid') {
    const baseRadius = 18;
    const verts = [];
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const r = baseRadius + (Math.random() * 8 - 4); // ±4px variation
      verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    obj.vertices = verts;
    obj.rotation = 0;
  }
  gameState.traffic.push(obj);
}

function updateTraffic (dt) {
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
      // DDA: combo >= 3 reduces interval by 10% (closer spawns); ddaSpawnRate scales it further
      const ddaComboMul = comboMultiplier >= 3 ? 0.9 : 1.0;
      const rawInterval = spawnMin + Math.random() * (spawnMax - spawnMin);
      gameState.nextSpawnDistance =
        gameState.distanceTraveled + rawInterval / (ddaSpawnRate * ddaComboMul);
    }
    // If not fair, skip this frame — will retry next frame with a fresh candidate
  }

  // Update each vehicle
  const nearMissPlayer = gameState.player;
  for (const v of gameState.traffic) {
    const type = VEHICLE_TYPES[v.type];
    // Dynamic speed: opponent moves at speedRatio of effective speed
    // visualSpeed = effSpeed * (1 - speedRatio), always positive (downward)
    v.ownSpeed = getEffectiveScrollSpeed() * type.speedRatio;
    const visualSpeed = getEffectiveScrollSpeed() * (1 - type.speedRatio);
    v.y += visualSpeed * dt;

    // Asteroid rotation
    if (v.rotation !== undefined) v.rotation += dt * 0.5;

    // First-time near miss discoverability hint (US-011)
    if (!nearMissHintShown && v.y > 0) {
      nearMissHintShown = true;
      spawnFloatText(CANVAS_WIDTH / 2, 80, 'Passe rente aos carros!', '#FFFFFF', 1.0, 3.0);
    }

    // Track minimum horizontal distance during vertical sprite overlap (near miss detection)
    if (v.y + v.height > nearMissPlayer.y && v.y < nearMissPlayer.y + PLAYER_HEIGHT) {
      // Sprites are vertically overlapping — measure edge-to-edge horizontal gap
      const distRight = v.x - (nearMissPlayer.x + PLAYER_WIDTH); // positive = vehicle to the right
      const distLeft = nearMissPlayer.x - (v.x + v.width);       // positive = vehicle to the left
      const horizDist = Math.max(0, Math.max(distRight, distLeft));
      if (horizDist < v.minDistX) v.minDistX = horizDist;
    }

    // Check near miss once the vehicle has fully passed the player
    if (!v.nearMissChecked && v.y > nearMissPlayer.y + PLAYER_HEIGHT) {
      v.nearMissChecked = true;
      if (!v.collided && v.minDistX < NEAR_MISS_DIST) {
        triggerNearMiss(v);
      }
    }

    // Tick near miss flash timer
    if (v.nearMissFlash !== null) {
      v.nearMissFlash.timer -= dt;
      if (v.nearMissFlash.timer <= 0) v.nearMissFlash = null;
    }

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
      if (!v.collided) {
        gameState.score += OVERTAKE_BONUS * (comboMultiplier >= 2 ? comboMultiplier : 1);
        AudioManager.playOvertake();
      }
      return false;
    }
    return true;
  });
}

function renderTraffic (ctx) {
  for (const v of gameState.traffic) {
    if (v.scattered) continue; // scattered vehicles rendered separately with rotation
    if (v.type === 'truck') {
      // Body with rounded rect
      ctx.fillStyle = '#616161';
      ctx.beginPath();
      ctx.roundRect(v.x, v.y, v.width, v.height, 4);
      ctx.fill();
      // Outline
      ctx.strokeStyle = '#0D1117';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Cargo container (slightly different shade)
      ctx.fillStyle = '#757575';
      ctx.fillRect(v.x + 4, v.y + 28, v.width - 8, v.height - 36);
      // Front grill (rectangle with 2 horizontal lines)
      ctx.fillStyle = '#424242';
      ctx.fillRect(v.x + 10, v.y + 4, v.width - 20, 10);
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.x + 12, v.y + 7);
      ctx.lineTo(v.x + v.width - 12, v.y + 7);
      ctx.moveTo(v.x + 12, v.y + 11);
      ctx.lineTo(v.x + v.width - 12, v.y + 11);
      ctx.stroke();
      // Cab windows
      ctx.fillStyle = 'rgba(100, 180, 255, 0.5)';
      ctx.fillRect(v.x + 8, v.y + 16, v.width - 16, 10);
      // Headlights (2 white arcs at front)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(v.x + 8, v.y + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x + v.width - 8, v.y + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (v.type === 'sedan') {
      // Body
      ctx.fillStyle = '#1E88E5';
      ctx.beginPath();
      ctx.roundRect(v.x, v.y, v.width, v.height, 4);
      ctx.fill();
      // Outline
      ctx.strokeStyle = '#0D1117';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Hood highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(v.x + 8, v.y + 2, v.width - 16, 4);
      // Windows
      ctx.fillStyle = 'rgba(100, 180, 255, 0.6)';
      ctx.fillRect(v.x + 5, v.y + 10, v.width - 10, 14);
      ctx.fillRect(v.x + 5, v.y + v.height - 18, v.width - 10, 10);
      // Headlights (2 white arcs at front y+4)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(v.x + 6, v.y + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x + v.width - 6, v.y + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Tail lights (2 red arcs at rear)
      ctx.fillStyle = '#EF5350';
      ctx.beginPath();
      ctx.arc(v.x + 6, v.y + v.height - 4, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x + v.width - 6, v.y + v.height - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (v.type === 'sports') {
      // Body with rounded rect
      ctx.fillStyle = '#B71C1C';
      ctx.beginPath();
      ctx.roundRect(v.x, v.y, v.width, v.height, 8);
      ctx.fill();
      // Outline
      ctx.strokeStyle = '#0D1117';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Racing stripe (center vertical line on hood)
      ctx.strokeStyle = '#E53935';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(v.x + v.width / 2, v.y + 2);
      ctx.lineTo(v.x + v.width / 2, v.y + 20);
      ctx.stroke();
      // Windows
      ctx.fillStyle = 'rgba(100, 180, 255, 0.5)';
      ctx.fillRect(v.x + 4, v.y + 10, v.width - 8, 12);
      ctx.fillRect(v.x + 4, v.y + v.height - 17, v.width - 8, 10);
      // Spoiler (thin rectangle at rear)
      ctx.fillStyle = '#880E0E';
      ctx.fillRect(v.x + 2, v.y + v.height - 3, v.width - 4, 3);
      // Headlights (bright white)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(v.x + 5, v.y + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x + v.width - 5, v.y + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (v.type === 'moto') {
      // Motorcycle body
      ctx.fillStyle = '#FFC107';
      ctx.beginPath();
      ctx.roundRect(v.x, v.y, v.width, v.height, 3);
      ctx.fill();
      // Outline
      ctx.strokeStyle = '#0D1117';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Rider silhouette
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(v.x + 3, v.y + 12, v.width - 6, 20);
      // Helmet (semicircle on top of rider)
      ctx.fillStyle = '#212121';
      ctx.beginPath();
      ctx.arc(v.x + v.width / 2, v.y + 12, v.width / 2 - 2, Math.PI, 0);
      ctx.fill();
      // Headlight (white arc at front)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(v.x + v.width / 2, v.y + 2, 2, 0, Math.PI * 2);
      ctx.fill();
      // Tail light (red arc at rear)
      ctx.fillStyle = '#EF5350';
      ctx.beginPath();
      ctx.arc(v.x + v.width / 2, v.y + v.height - 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (v.type === 'bird') {
      // Bird: oval body + oscillating wings with offset, tail, eye, beak
      const bx = v.x + v.width / 2;
      const by = v.y + v.height / 2;
      const wingAngleL = Math.sin(gameState.elapsedTime * 8) * (Math.PI / 6);
      const wingAngleR = Math.sin(gameState.elapsedTime * 8 + 0.3) * (Math.PI / 6);

      // Tail: small triangle behind body
      ctx.fillStyle = '#4E342E';
      ctx.beginPath();
      ctx.moveTo(bx, by + 6);
      ctx.lineTo(bx - 4, by + 10);
      ctx.lineTo(bx + 4, by + 10);
      ctx.closePath();
      ctx.fill();

      // Body oval with darker color + outline
      ctx.fillStyle = '#3E2723';
      ctx.beginPath();
      ctx.ellipse(bx, by, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1A1010';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Left wing
      ctx.save();
      ctx.translate(bx - 8, by);
      ctx.rotate(-wingAngleL);
      ctx.fillStyle = '#3E2723';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, -6);
      ctx.lineTo(-2, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1A1010';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Right wing
      ctx.save();
      ctx.translate(bx + 8, by);
      ctx.rotate(wingAngleR);
      ctx.fillStyle = '#3E2723';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10, -6);
      ctx.lineTo(2, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1A1010';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Beak: small orange triangle at front
      ctx.fillStyle = '#FF8F00';
      ctx.beginPath();
      ctx.moveTo(bx, by - 7);
      ctx.lineTo(bx - 1.5, by - 4);
      ctx.lineTo(bx + 1.5, by - 4);
      ctx.closePath();
      ctx.fill();

      // Eye: small yellow arc
      ctx.fillStyle = '#FFD600';
      ctx.beginPath();
      ctx.arc(bx + 2, by - 3, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (v.type === 'airplane') {
      // Airplane: fuselage with gradient, wings with engines, tail, windows, nav lights
      const ax = v.x;
      const ay = v.y;
      const acx = ax + v.width / 2;

      // --- Tail (empenagem) - vertical fin + horizontal stabilizer ---
      // Vertical fin (triangle at top of fuselage)
      ctx.fillStyle = '#90A4AE';
      ctx.beginPath();
      ctx.moveTo(acx, ay - 2);
      ctx.lineTo(acx - 6, ay + 14);
      ctx.lineTo(acx + 6, ay + 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1A1A2E';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Horizontal stabilizer (small rectangle at tail base)
      ctx.fillStyle = '#90A4AE';
      ctx.fillRect(acx - 12, ay + 10, 24, 4);
      ctx.strokeStyle = '#1A1A2E';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(acx - 12, ay + 10, 24, 4);

      // --- Fuselage with metallic gradient ---
      const fuseGrad = ctx.createLinearGradient(acx - 8, ay, acx + 8, ay);
      fuseGrad.addColorStop(0, '#90A4AE');
      fuseGrad.addColorStop(0.4, '#CFD8DC');
      fuseGrad.addColorStop(1, '#90A4AE');
      ctx.fillStyle = fuseGrad;
      ctx.beginPath();
      ctx.roundRect(acx - 8, ay, 16, 70, 4);
      ctx.fill();
      ctx.strokeStyle = '#1A1A2E';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // --- Horizontal wings with outline ---
      const wingGrad = ctx.createLinearGradient(ax, ay + 25, ax, ay + 35);
      wingGrad.addColorStop(0, '#CFD8DC');
      wingGrad.addColorStop(1, '#90A4AE');
      ctx.fillStyle = wingGrad;
      ctx.beginPath();
      ctx.rect(ax, ay + 25, 50, 10);
      ctx.fill();
      ctx.strokeStyle = '#1A1A2E';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // --- Engine/turbine details on wings ---
      ctx.fillStyle = '#455A64';
      ctx.beginPath();
      ctx.arc(ax + 8, ay + 30, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ax + 42, ay + 30, 3, 0, Math.PI * 2);
      ctx.fill();

      // --- Windows (larger, brighter) ---
      ctx.fillStyle = 'rgba(100, 181, 246, 0.9)';
      for (let wi = 0; wi < 4; wi++) {
        ctx.beginPath();
        ctx.arc(acx, ay + 34 + wi * 8, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- Navigation lights (blinking) ---
      const blinkOn = Math.floor(gameState.elapsedTime * 4) % 2 === 0;
      // Red on left wing tip
      ctx.fillStyle = '#FF1744';
      ctx.globalAlpha = blinkOn ? 1.0 : 0.2;
      ctx.beginPath();
      ctx.arc(ax + 1, ay + 30, 2, 0, Math.PI * 2);
      ctx.fill();
      // Green on right wing tip
      ctx.fillStyle = '#00E676';
      ctx.beginPath();
      ctx.arc(ax + 49, ay + 30, 2, 0, Math.PI * 2);
      ctx.fill();
      // White on tail
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(acx, ay + 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    } else if (v.type === 'helicopter') {
      // Helicopter: oval body with gradient + 4-blade rotor + tail boom + cockpit + nav lights + skids
      const hcx = v.x + v.width / 2;
      const hcy = v.y + v.height / 2;

      // Tail boom (behind body)
      ctx.strokeStyle = '#546E7A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hcx, hcy + 10);
      ctx.lineTo(hcx, v.y + v.height - 6);
      ctx.stroke();
      // Tail rotor (small perpendicular line at end of boom)
      const tailRotorY = v.y + v.height - 6;
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hcx - 6, tailRotorY);
      ctx.lineTo(hcx + 6, tailRotorY);
      ctx.stroke();

      // Body (oval) with gradient for volume
      const bodyGrad = ctx.createLinearGradient(hcx, hcy - 22, hcx, hcy + 22);
      bodyGrad.addColorStop(0, '#B0BEC5');
      bodyGrad.addColorStop(1, '#607D8B');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(hcx, hcy, 18, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      // Body outline
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Cockpit/window (ellipse at top of body)
      ctx.fillStyle = 'rgba(100, 181, 246, 0.7)';
      ctx.beginPath();
      ctx.ellipse(hcx, hcy - 10, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Navigation lights
      const blinkOn = Math.floor(gameState.elapsedTime * 4) % 2;
      // Red left
      ctx.fillStyle = '#FF1744';
      ctx.globalAlpha = blinkOn ? 1.0 : 0.3;
      ctx.beginPath();
      ctx.arc(v.x + 4, hcy, 2, 0, Math.PI * 2);
      ctx.fill();
      // Green right
      ctx.fillStyle = '#00E676';
      ctx.beginPath();
      ctx.arc(v.x + v.width - 4, hcy, 2, 0, Math.PI * 2);
      ctx.fill();
      // White top
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(hcx, v.y + 4, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Rotor — 4 blades (2 crossed lines) with blur alpha
      const rotorAngle = gameState.elapsedTime * 15;
      ctx.save();
      ctx.translate(hcx, v.y + 8);
      ctx.rotate(rotorAngle);
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(20, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(0, 20);
      ctx.stroke();
      ctx.restore();
      // Rotor hub
      ctx.fillStyle = '#546E7A';
      ctx.beginPath();
      ctx.arc(hcx, v.y + 8, 3, 0, Math.PI * 2);
      ctx.fill();

      // Skids — 2 horizontal lines + vertical supports
      ctx.strokeStyle = '#37474F';
      ctx.lineWidth = 2;
      // Vertical supports (left pair)
      ctx.beginPath();
      ctx.moveTo(hcx - 10, hcy + 16);
      ctx.lineTo(hcx - 12, v.y + v.height - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hcx + 10, hcy + 16);
      ctx.lineTo(hcx + 12, v.y + v.height - 4);
      ctx.stroke();
      // Horizontal skid bars
      ctx.beginPath();
      ctx.moveTo(v.x + 4, v.y + v.height - 4);
      ctx.lineTo(v.x + v.width - 4, v.y + v.height - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(v.x + 6, v.y + v.height - 1);
      ctx.lineTo(v.x + v.width - 6, v.y + v.height - 1);
      ctx.stroke();
    } else if (v.type === 'asteroid') {
      // Asteroid: rotating irregular polygon with craters and highlight
      const acx = v.x + v.width / 2;
      const acy = v.y + v.height / 2;
      ctx.save();
      ctx.translate(acx, acy);
      ctx.rotate(v.rotation || 0);
      // Fill
      ctx.fillStyle = '#795548';
      ctx.beginPath();
      const verts = v.vertices;
      if (verts && verts.length > 0) {
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
          ctx.lineTo(verts[i].x, verts[i].y);
        }
        ctx.closePath();
        ctx.fill();
        // Border
        ctx.strokeStyle = '#5D4037';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Craters (3 fixed positions relative to center, seeded from vertex count)
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#5D4037';
      ctx.beginPath();
      ctx.arc(-5, -4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6, 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-2, 7, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      // Highlight arc on top
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, -4, 10, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.restore();
    } else if (v.type === 'fighter') {
      // Fighter: inverted red triangle with cyan outline, weapons, and thruster glow
      const fcx = v.x + v.width / 2;
      ctx.save();
      // Main body — inverted triangle (point at bottom)
      ctx.fillStyle = '#F44336';
      ctx.beginPath();
      ctx.moveTo(fcx, v.y + v.height);            // bottom point
      ctx.lineTo(v.x, v.y);                        // top-left
      ctx.lineTo(v.x + v.width, v.y);              // top-right
      ctx.closePath();
      ctx.fill();
      // Cyan outline
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Darker center stripe
      ctx.fillStyle = '#C62828';
      ctx.beginPath();
      ctx.moveTo(fcx, v.y + v.height);
      ctx.lineTo(fcx - 5, v.y);
      ctx.lineTo(fcx + 5, v.y);
      ctx.closePath();
      ctx.fill();
      // 2 cannons (lateral rectangles)
      ctx.fillStyle = '#B71C1C';
      ctx.fillRect(v.x - 2, v.y + 4, 4, 8);
      ctx.fillRect(v.x + v.width - 2, v.y + 4, 4, 8);
      // Weapon details on wing tips (thin red rectangles)
      ctx.fillStyle = '#FF5252';
      ctx.fillRect(v.x - 3, v.y + 2, 2, 6);
      ctx.fillRect(v.x + v.width + 1, v.y + 2, 2, 6);
      // Fire trail at rear (2 oscillating flame rectangles)
      const ft = gameState.elapsedTime || 0;
      const flameH1 = 8 + Math.sin(ft * 10) * 3;
      const flameH2 = 8 + Math.sin(ft * 10 + 2) * 3;
      const flameLerp1 = (Math.sin(ft * 10) + 1) / 2;
      const flameLerp2 = (Math.sin(ft * 10 + 2) + 1) / 2;
      // Flame 1 (left thruster)
      ctx.fillStyle = `rgb(${Math.round(255 - flameLerp1 * 0)}, ${Math.round(102 + flameLerp1 * 102)}, ${Math.round(flameLerp1 * 0)})`;
      ctx.fillRect(fcx - 7, v.y + v.height, 5, flameH1);
      // Flame 2 (right thruster)
      ctx.fillStyle = `rgb(${Math.round(255 - flameLerp2 * 0)}, ${Math.round(102 + flameLerp2 * 102)}, ${Math.round(flameLerp2 * 0)})`;
      ctx.fillRect(fcx + 2, v.y + v.height, 5, flameH2);
      // Thruster glow (subtle cyan arc behind flames)
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(ft * 8);
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.arc(fcx - 4.5, v.y + v.height, 5, 0, Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fcx + 4.5, v.y + v.height, 5, 0, Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.restore();
    } else if (v.type === 'cruiser') {
      // Cruiser: large dark roundRect with outline, window panels, antenna, and blinking lights
      ctx.save();
      ctx.fillStyle = '#455A64';
      ctx.beginPath();
      ctx.roundRect(v.x, v.y, v.width, v.height, 6);
      ctx.fill();
      // Outline
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Antenna on top (thin line + arc at tip)
      ctx.strokeStyle = '#78909C';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.x + v.width / 2, v.y);
      ctx.lineTo(v.x + v.width / 2, v.y - 8);
      ctx.stroke();
      ctx.fillStyle = '#B0BEC5';
      ctx.beginPath();
      ctx.arc(v.x + v.width / 2, v.y - 8, 2, 0, Math.PI * 2);
      ctx.fill();
      // 4 internal panel lines (horizontal)
      ctx.strokeStyle = '#37474F';
      ctx.lineWidth = 1;
      const panelSpacing = v.height / 5;
      for (let i = 1; i <= 4; i++) {
        const py = v.y + panelSpacing * i;
        ctx.beginPath();
        ctx.moveTo(v.x + 4, py);
        ctx.lineTo(v.x + v.width - 4, py);
        ctx.stroke();
      }
      // 2 lateral panel lines (vertical, near edges)
      ctx.beginPath();
      ctx.moveTo(v.x + 8, v.y + 6);
      ctx.lineTo(v.x + 8, v.y + v.height - 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(v.x + v.width - 8, v.y + 6);
      ctx.lineTo(v.x + v.width - 8, v.y + v.height - 6);
      ctx.stroke();
      // Window/panel rectangles (blue, along body)
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#64B5F6';
      ctx.fillRect(v.x + 12, v.y + 16, 8, 5);
      ctx.fillRect(v.x + v.width - 20, v.y + 16, 8, 5);
      ctx.fillRect(v.x + 12, v.y + 32, 8, 5);
      ctx.fillRect(v.x + v.width - 20, v.y + 32, 8, 5);
      ctx.globalAlpha = 1.0;
      // 2 blinking blue lights at top (toggle every 0.5s)
      const ct = gameState.elapsedTime || 0;
      const lightOn = Math.floor(ct / 0.5) % 2 === 0;
      ctx.fillStyle = lightOn ? '#42A5F5' : '#1565C0';
      ctx.globalAlpha = lightOn ? 1.0 : 0.4;
      ctx.beginPath();
      ctx.arc(v.x + v.width / 2 - 8, v.y + 8, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x + v.width / 2 + 8, v.y + 8, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.restore();
    }

    // Near miss flash: white strip on the side closest to the player
    if (v.nearMissFlash !== null) {
      const flashAlpha = v.nearMissFlash.timer / NEAR_MISS_FLASH_DURATION;
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = '#FFFFFF';
      const flashW = Math.max(4, v.width * 0.15);
      if (v.nearMissFlash.side === 'left') {
        ctx.fillRect(v.x, v.y, flashW, v.height);
      } else {
        ctx.fillRect(v.x + v.width - flashW, v.y, flashW, v.height);
      }
      ctx.globalAlpha = 1;
    }
  }
}

// --- Fuel System ---

// Fuel pickup amount decreases over time (reads from DIFFICULTY config)
function getFuelCollectAmount (elapsed) {
  for (const tier of DIFFICULTY.fuel.collectTiers) {
    if (elapsed < tier.untilTime) return tier.amount;
  }
  return DIFFICULTY.fuel.collectTiers[DIFFICULTY.fuel.collectTiers.length - 1].amount;
}

// Spawn a fuel item; 60% chance in a lane adjacent to an existing traffic vehicle
function spawnFuelItem () {
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
  // DDA: when fuel > 70%, next fuel spawns 20% further (punishes excess fuel)
  const ddaFuelMul = gameState.fuel > 70 ? 1.2 : 1.0;
  gameState.nextFuelSpawnDistance = gameState.distanceTraveled + (intervalMin + Math.random() * (intervalMax - intervalMin)) * ddaFuelMul;
}

function updateFuelItems (dt) {
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
      AudioManager.playFuelPickup();
      item.collectAnim = { timer: FUEL_COLLECT_ANIM_DURATION };
      spawnFloatText(item.x, item.y, '+FUEL', '#00FF88'); // US-009
    }
  }
}

function renderFuelItems (ctx) {
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

// --- Coin Collectibles ---

function spawnCoinCluster () {
  const count = 3 + Math.floor(Math.random() * 3); // 3–5 coins
  const patterns = ['line', 'arc', 'zigzag'];
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const centerX = ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;

  for (let i = 0; i < count; i++) {
    let x;
    // coins spawn above screen; first coin (i=0) arrives first at player
    const y = -COIN_RADIUS - i * 40;

    if (pattern === 'line') {
      x = centerX;
    } else if (pattern === 'arc') {
      const t = count > 1 ? i / (count - 1) : 0.5;
      x = centerX + Math.sin(t * Math.PI) * 24;
    } else {
      // zigzag
      x = centerX + (i % 2 === 0 ? -20 : 20);
    }

    // Clamp to road interior
    x = Math.max(ROAD_LEFT + COIN_RADIUS, Math.min(ROAD_RIGHT - COIN_RADIUS, x));
    gameState.coins.push({ x, y, collectAnim: null });
  }

  gameState.nextCoinSpawnDistance =
    gameState.distanceTraveled + COIN_SPAWN_MIN + Math.random() * (COIN_SPAWN_MAX - COIN_SPAWN_MIN);
}

function updateCoins (dt) {
  const effSpeed = getEffectiveScrollSpeed();

  if (gameState.distanceTraveled >= gameState.nextCoinSpawnDistance) {
    spawnCoinCluster();
  }

  const ph = getPlayerHitbox(gameState.player);

  for (let i = gameState.coins.length - 1; i >= 0; i--) {
    const coin = gameState.coins[i];

    if (coin.collectAnim !== null) {
      coin.collectAnim.timer -= dt;
      if (coin.collectAnim.timer <= 0) gameState.coins.splice(i, 1);
      continue;
    }

    coin.y += effSpeed * dt;

    if (coin.y > CANVAS_HEIGHT + COIN_RADIUS) {
      gameState.coins.splice(i, 1);
      continue;
    }

    // Collection: player 80% hitbox vs coin 100% hitbox (full circle bounding square)
    const coinHb = {
      x: coin.x - COIN_RADIUS,
      y: coin.y - COIN_RADIUS,
      w: COIN_RADIUS * 2,
      h: COIN_RADIUS * 2,
    };
    if (aabbOverlap(ph, coinHb)) {
      gameState.score += COIN_POINTS * (comboMultiplier >= 2 ? comboMultiplier : 1);
      gameState.coinsCollected++;
      spawnFloatText(coin.x, coin.y, '+1', '#FFD700'); // US-009
      AudioManager.playCoinPickup();
      coin.collectAnim = { timer: COIN_COLLECT_ANIM_DURATION };
      coinPulse = 1.0; // beat-pulse HUD: coin counter bounce (US-008)
    }
  }

}

function renderCoins (ctx) {
  for (const coin of gameState.coins) {
    let scale = 1;
    let alpha = 1;
    if (coin.collectAnim !== null) {
      const progress = 1 - coin.collectAnim.timer / COIN_COLLECT_ANIM_DURATION;
      scale = 1 + 0.2 * progress;
      alpha = 1 - progress;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(coin.x, coin.y);
    ctx.scale(scale, scale);

    // Gold circle
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, 0, COIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Shine highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(-2, -2, COIN_RADIUS * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

}

// --- Nitro Item ---

function spawnNitroItem () {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const x = ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
  gameState.nitroItems.push({ x, y: -NITRO_ITEM_HALF * 2, collectAnim: null });
  gameState.nextNitroSpawnDistance =
    gameState.distanceTraveled + NITRO_SPAWN_MIN + Math.random() * (NITRO_SPAWN_MAX - NITRO_SPAWN_MIN);
}

function updateNitroItems (dt) {
  const effSpeed = getEffectiveScrollSpeed();

  if (gameState.distanceTraveled >= gameState.nextNitroSpawnDistance) {
    spawnNitroItem();
  }

  const ph = getPlayerHitbox(gameState.player);

  for (let i = gameState.nitroItems.length - 1; i >= 0; i--) {
    const item = gameState.nitroItems[i];

    if (item.collectAnim !== null) {
      item.collectAnim.timer -= dt;
      if (item.collectAnim.timer <= 0) gameState.nitroItems.splice(i, 1);
      continue;
    }

    item.y += effSpeed * dt;

    if (item.y > CANVAS_HEIGHT + NITRO_ITEM_HALF * 2) {
      gameState.nitroItems.splice(i, 1);
      continue;
    }

    // Collection: player 80% hitbox vs item full bounding box (20x20)
    const itemHb = {
      x: item.x - NITRO_ITEM_HALF,
      y: item.y - NITRO_ITEM_HALF,
      w: NITRO_ITEM_HALF * 2,
      h: NITRO_ITEM_HALF * 2,
    };
    if (aabbOverlap(ph, itemHb)) {
      nitroTimer = NITRO_BOOST_DURATION;
      nitroEaseTimer = 0;
      // Full invulnerability during boost
      invulnTimer = Math.max(invulnTimer, NITRO_BOOST_DURATION);
      AudioManager.playNitroPickup();
      item.collectAnim = { timer: NITRO_COLLECT_ANIM_DURATION };
      // Chromatic aberration on nitro activation (US-002)
      chromaTimer = 0.25;
      chromaDuration = 0.25;
      chromaIntensity = 0.6;
      spawnFloatText(item.x, item.y, '+NITRO', '#00FFFF'); // US-009
    }
  }
}

function renderNitroItems (ctx) {
  // Pulsing scale: 0.9 to 1.1 over a 0.5s cycle
  const pulseScale = 1.0 + 0.1 * Math.sin(gameState.elapsedTime * 4 * Math.PI);

  for (const item of gameState.nitroItems) {
    let scale = pulseScale;
    let alpha = 1;
    if (item.collectAnim !== null) {
      const progress = 1 - item.collectAnim.timer / NITRO_COLLECT_ANIM_DURATION;
      scale = 1 + 0.2 * progress;
      alpha = 1 - progress;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(item.x, item.y);
    ctx.scale(scale, scale);

    const s = NITRO_ITEM_HALF;
    // Yellow triangle pointing upward
    ctx.fillStyle = '#FFD600';
    ctx.beginPath();
    ctx.moveTo(0, -s);       // apex
    ctx.lineTo(s, s);        // bottom right
    ctx.lineTo(-s, s);       // bottom left
    ctx.closePath();
    ctx.fill();

    // "N" label
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${Math.floor(s * 1.2)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, s * 0.2);

    ctx.restore();
  }
}

// --- Shield Item ---

function spawnShieldItem () {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const x = ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
  gameState.shieldItems.push({ x, y: -SHIELD_ITEM_RADIUS * 2, collectAnim: null });
  gameState.nextShieldSpawnDistance =
    gameState.distanceTraveled + SHIELD_SPAWN_MIN + Math.random() * (SHIELD_SPAWN_MAX - SHIELD_SPAWN_MIN);
}

function updateShieldItems (dt) {
  const effSpeed = getEffectiveScrollSpeed();

  if (gameState.distanceTraveled >= gameState.nextShieldSpawnDistance) {
    spawnShieldItem();
  }

  const ph = getPlayerHitbox(gameState.player);

  for (let i = gameState.shieldItems.length - 1; i >= 0; i--) {
    const item = gameState.shieldItems[i];

    if (item.collectAnim !== null) {
      item.collectAnim.timer -= dt;
      if (item.collectAnim.timer <= 0) gameState.shieldItems.splice(i, 1);
      continue;
    }

    item.y += effSpeed * dt;

    if (item.y > CANVAS_HEIGHT + SHIELD_ITEM_RADIUS * 2) {
      gameState.shieldItems.splice(i, 1);
      continue;
    }

    // Collection: player 80% hitbox vs item full bounding box
    const itemHb = {
      x: item.x - SHIELD_ITEM_RADIUS,
      y: item.y - SHIELD_ITEM_RADIUS,
      w: SHIELD_ITEM_RADIUS * 2,
      h: SHIELD_ITEM_RADIUS * 2,
    };
    if (aabbOverlap(ph, itemHb)) {
      // Only 1 shield at a time — collecting another while active does nothing
      if (!gameState.player.hasShield) {
        gameState.player.hasShield = true;
      }
      AudioManager.playShieldPickup();
      item.collectAnim = { timer: SHIELD_COLLECT_ANIM_DURATION };
      spawnFloatText(item.x, item.y, '+SHIELD', '#4488FF'); // US-009
    }
  }
}

// Draw a regular hexagon at (cx, cy) with bounding radius r
function drawHexagon (ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function renderShieldItems (ctx) {
  // Pulsing scale: 0.9 to 1.1 over a 0.6s cycle
  const pulseScale = 1.0 + 0.1 * Math.sin(gameState.elapsedTime * (2 * Math.PI / 0.6));

  for (const item of gameState.shieldItems) {
    let scale = pulseScale;
    let alpha = 1;
    if (item.collectAnim !== null) {
      const progress = 1 - item.collectAnim.timer / SHIELD_COLLECT_ANIM_DURATION;
      scale = 1 + 0.2 * progress;
      alpha = 1 - progress;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(item.x, item.y);
    ctx.scale(scale, scale);

    // Outer glow
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, SHIELD_ITEM_RADIUS * 1.8);
    glow.addColorStop(0, 'rgba(66, 165, 245, 0.4)');
    glow.addColorStop(1, 'rgba(66, 165, 245, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, SHIELD_ITEM_RADIUS * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Hexagon fill
    ctx.fillStyle = '#42A5F5';
    drawHexagon(ctx, 0, 0, SHIELD_ITEM_RADIUS);
    ctx.fill();

    // Hexagon border
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    drawHexagon(ctx, 0, 0, SHIELD_ITEM_RADIUS);
    ctx.stroke();

    // 'S' label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.floor(SHIELD_ITEM_RADIUS * 1.1)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 0, 0);

    ctx.restore();
  }
}

// --- Weapon Item ---

function spawnWeaponItem () {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const x = ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
  gameState.weaponItems.push({ x, y: -WEAPON_ITEM_RADIUS * 2, collectAnim: null });
  gameState.nextWeaponSpawnDistance =
    gameState.distanceTraveled + WEAPON_SPAWN_MIN + Math.random() * (WEAPON_SPAWN_MAX - WEAPON_SPAWN_MIN);
}

function updateWeaponItems (dt) {
  const effSpeed = getEffectiveScrollSpeed();

  if (gameState.distanceTraveled >= gameState.nextWeaponSpawnDistance) {
    spawnWeaponItem();
  }

  const ph = getPlayerHitbox(gameState.player);

  for (let i = gameState.weaponItems.length - 1; i >= 0; i--) {
    const item = gameState.weaponItems[i];

    if (item.collectAnim !== null) {
      item.collectAnim.timer -= dt;
      if (item.collectAnim.timer <= 0) gameState.weaponItems.splice(i, 1);
      continue;
    }

    item.y += effSpeed * dt;

    if (item.y > CANVAS_HEIGHT + WEAPON_ITEM_RADIUS * 2) {
      gameState.weaponItems.splice(i, 1);
      continue;
    }

    // Collection: player 80% hitbox vs item full bounding box
    const itemHb = {
      x: item.x - WEAPON_ITEM_RADIUS,
      y: item.y - WEAPON_ITEM_RADIUS,
      w: WEAPON_ITEM_RADIUS * 2,
      h: WEAPON_ITEM_RADIUS * 2,
    };
    if (aabbOverlap(ph, itemHb)) {
      // Stack duration: add +3s to remaining time
      shootingTimer += WEAPON_DURATION;
      gameState.player.shooting = true;
      AudioManager.playWeaponPickup();
      item.collectAnim = { timer: WEAPON_COLLECT_ANIM_DURATION };
      spawnFloatText(item.x, item.y, '+WEAPON', '#FF6633');
    }
  }
}

function renderWeaponItems (ctx) {
  // Pulsing scale: 0.9 to 1.1 over a 0.5s cycle
  const pulseScale = 1.0 + 0.1 * Math.sin(gameState.elapsedTime * 4 * Math.PI);

  for (const item of gameState.weaponItems) {
    let scale = pulseScale;
    let alpha = 1;
    if (item.collectAnim !== null) {
      const progress = 1 - item.collectAnim.timer / WEAPON_COLLECT_ANIM_DURATION;
      scale = 1 + 0.2 * progress;
      alpha = 1 - progress;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(item.x, item.y);
    ctx.scale(scale, scale);

    // Outer glow (red-orange)
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, WEAPON_ITEM_RADIUS * 1.8);
    glow.addColorStop(0, 'rgba(255, 100, 50, 0.4)');
    glow.addColorStop(1, 'rgba(255, 100, 50, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, WEAPON_ITEM_RADIUS * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Circular body (red-orange)
    ctx.fillStyle = '#FF5522';
    ctx.beginPath();
    ctx.arc(0, 0, WEAPON_ITEM_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, WEAPON_ITEM_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Projectile icon: upward arrow/bullet shape
    const r = WEAPON_ITEM_RADIUS * 0.55;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(0, -r);                     // tip
    ctx.lineTo(r * 0.4, -r * 0.2);         // right shoulder
    ctx.lineTo(r * 0.4, r * 0.6);          // right base
    ctx.lineTo(-r * 0.4, r * 0.6);         // left base
    ctx.lineTo(-r * 0.4, -r * 0.2);        // left shoulder
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// --- Weapon Shooting Timer HUD ---
// Small bar below the nitro bar; visible when weapon is active.
function renderWeaponHUD (ctx) {
  if (shootingTimer <= 0) return;
  const pct = Math.min(shootingTimer / WEAPON_DURATION, 1.0);

  const barW = 80;
  const barH = 5;
  const x = CANVAS_WIDTH / 2 - barW / 2;
  const y = CANVAS_HEIGHT - 8;

  ctx.save();
  ctx.globalAlpha = 0.8;
  // Background track
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, barW, barH);
  // Orange fill
  ctx.fillStyle = '#FF6633';
  ctx.fillRect(x, y, barW * pct, barH);
  // Label
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#FF6633';
  ctx.fillText('WEAPON', CANVAS_WIDTH / 2, y - 1);
  ctx.restore();
}

// --- Bullet (Projectile) System — US-002 ---
// Automatic shooting while weapon power-up is active

function updateBullets (dt) {
  // Spawn bullets while weapon is active
  if (gameState.player.shooting) {
    bulletFireTimer -= dt;
    if (bulletFireTimer <= 0 && gameState.bullets.length < BULLET_MAX) {
      const player = gameState.player;
      gameState.bullets.push({
        x: player.x + PLAYER_WIDTH / 2,
        y: player.y,
        phase: gameState.phase, // track phase at spawn for visual
      });
      bulletFireTimer = BULLET_FIRE_INTERVAL;
      AudioManager.playBulletShoot();
    }
  } else {
    bulletFireTimer = 0; // reset cooldown when weapon not active
  }

  // Update bullet positions + check collision with traffic
  for (let i = gameState.bullets.length - 1; i >= 0; i--) {
    const b = gameState.bullets[i];
    b.y -= BULLET_SPEED * dt;

    // Remove if off screen
    if (b.y + BULLET_HEIGHT < 0) {
      gameState.bullets.splice(i, 1);
      continue;
    }

    // Bullet hitbox (centered on x)
    const bHb = {
      x: b.x - BULLET_WIDTH / 2,
      y: b.y - BULLET_HEIGHT / 2,
      w: BULLET_WIDTH,
      h: BULLET_HEIGHT,
    };

    // Check collision with traffic vehicles
    for (let j = gameState.traffic.length - 1; j >= 0; j--) {
      const v = gameState.traffic[j];
      if (v.destroyed) continue; // skip already destroyed
      const vHb = getVehicleHitbox(v);
      if (aabbOverlap(bHb, vHb)) {
        // Destroy vehicle
        spawnVehicleDestroyParticles(v);
        AudioManager.playVehicleDestroy();

        // Score bonus + combo
        const pts = BULLET_KILL_POINTS * (comboMultiplier >= 2 ? comboMultiplier : 1);
        gameState.score += pts;
        comboMultiplier += 1;
        comboResetTimer = COMBO_RESET_TIME;
        comboScaleTimer = COMBO_SCALE_DURATION;
        bestCombo = Math.max(bestCombo, comboMultiplier);
        scorePunchScale = Math.min(0.4, 0.15 + comboMultiplier * 0.05);
        scorePunchColor = getComboColor(comboMultiplier);

        // Float text
        const comboColor = getComboColor(comboMultiplier - 1);
        const label = comboMultiplier > 2
          ? 'x' + (comboMultiplier - 1) + ' +' + pts + '!'
          : '+' + pts;
        spawnFloatText(v.x + v.width / 2, v.y + v.height / 2, label, comboColor);

        // Screen shake (light)
        triggerShake(0.08, 2);

        // Remove vehicle and bullet
        gameState.traffic.splice(j, 1);
        gameState.bullets.splice(i, 1);
        break; // bullet consumed
      }
    }
  }
}

// Explosion particles when a vehicle is destroyed by bullet (US-002)
function spawnVehicleDestroyParticles (v) {
  const cx = v.x + v.width / 2;
  const cy = v.y + v.height / 2;
  const fireColors = ['#FFF176', '#FFB74D', '#FF7043', '#E53935'];
  const debrisColors = ['#757575', '#4E342E', '#424242'];
  // Fire particles
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 160;
    particles.push({
      x: cx + (Math.random() - 0.5) * v.width * 0.4,
      y: cy + (Math.random() - 0.5) * v.height * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.3,
      maxLife: 0.6,
      color: fireColors[Math.floor(Math.random() * fireColors.length)],
      size: 2 + Math.random() * 3,
    });
  }
  // Debris particles
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 100;
    particles.push({
      x: cx + (Math.random() - 0.5) * v.width * 0.3,
      y: cy + (Math.random() - 0.5) * v.height * 0.3,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + 30,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      color: debrisColors[Math.floor(Math.random() * debrisColors.length)],
      size: 1.5 + Math.random() * 2,
    });
  }
}

function renderBullets (ctx) {
  if (gameState.bullets.length === 0) return;
  const phase = gameState.phase;

  for (const b of gameState.bullets) {
    ctx.save();
    ctx.translate(b.x, b.y);

    if (phase === 'space' || b.phase === 'space') {
      // Space: green laser bolt
      ctx.shadowColor = '#00FF66';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#00FF66';
      ctx.fillRect(-BULLET_WIDTH / 2, -BULLET_HEIGHT / 2, BULLET_WIDTH, BULLET_HEIGHT);
      // Bright core
      ctx.fillStyle = '#AAFFAA';
      ctx.fillRect(-1, -BULLET_HEIGHT / 2, 2, BULLET_HEIGHT);
    } else if (phase === 'sky' || b.phase === 'sky') {
      // Sky: blue missile/laser
      ctx.shadowColor = '#42A5F5';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#42A5F5';
      ctx.fillRect(-BULLET_WIDTH / 2, -BULLET_HEIGHT / 2, BULLET_WIDTH, BULLET_HEIGHT);
      // Bright core
      ctx.fillStyle = '#BBDEFB';
      ctx.fillRect(-1, -BULLET_HEIGHT / 2, 2, BULLET_HEIGHT);
      // Pointed tip
      ctx.fillStyle = '#42A5F5';
      ctx.beginPath();
      ctx.moveTo(0, -BULLET_HEIGHT / 2 - 3);
      ctx.lineTo(BULLET_WIDTH / 2, -BULLET_HEIGHT / 2);
      ctx.lineTo(-BULLET_WIDTH / 2, -BULLET_HEIGHT / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      // Road: metallic bullet
      ctx.shadowColor = '#FFCC00';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#CCCCCC';
      ctx.fillRect(-BULLET_WIDTH / 2, -BULLET_HEIGHT / 2, BULLET_WIDTH, BULLET_HEIGHT);
      // Bright tip
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-BULLET_WIDTH / 2, -BULLET_HEIGHT / 2, BULLET_WIDTH, 3);
      // Trail glow
      ctx.fillStyle = '#FFCC00';
      ctx.fillRect(-1, BULLET_HEIGHT / 2 - 2, 2, 4);
    }

    ctx.restore();
  }
}

// --- Floating pickup texts (US-009) ---
// Rendered above world layer, below main HUD panel
function renderFloatTexts (ctx) {
  if (floatTexts.length === 0) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const ft of floatTexts) {
    const fontSize = Math.round(16 * (ft.scale || 1.0));
    ctx.font = 'bold ' + fontSize + 'px monospace';
    ctx.globalAlpha = ft.timer / (ft.maxTimer || FLOAT_TEXT_DURATION);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.restore();
}

// --- Fuel HUD ---
// US-012: update a single HUD opacity tracker; call each frame during playingState.update()
function tickHudOpacity (tracker, newValue, elapsedTime) {
  if (newValue !== tracker.trackedValue) {
    tracker.trackedValue = newValue;
    tracker.lastChanged = elapsedTime;
  }
  const t = elapsedTime - tracker.lastChanged;
  if (t < HUD_OPACITY_RAMP_IN) {
    tracker.currentAlpha = HUD_OPACITY_STEADY + (1 - HUD_OPACITY_STEADY) * (t / HUD_OPACITY_RAMP_IN);
  } else if (t < HUD_OPACITY_RAMP_IN + HUD_OPACITY_HOLD) {
    tracker.currentAlpha = 1.0;
  } else {
    const fade = (t - HUD_OPACITY_RAMP_IN - HUD_OPACITY_HOLD) / HUD_OPACITY_RAMP_OUT;
    tracker.currentAlpha = 1.0 - (1 - HUD_OPACITY_STEADY) * Math.min(1, fade);
  }
}

function renderFuelHUD (ctx) {
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
function renderScoreHUD (ctx) {
  const scoreStr = Math.floor(gameState.displayedScore).toString();

  // Beat-pulse scale (US-008): beat → 1.08×, coin collect → 1.15×, take larger
  // Score punch (US-007): adds combo-scaled punch on near miss
  const scoreScale = Math.max(1 + 0.08 * beatPulse, 1 + 0.15 * coinPulse) + scorePunchScale;
  // Scale around score anchor (top-right)
  const anchorX = CANVAS_WIDTH - 8;
  const anchorY = 20;
  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.scale(scoreScale, scoreScale);
  ctx.translate(-anchorX, -anchorY);

  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(scoreStr, CANVAS_WIDTH - 6, 10);
  // Main score — flash combo color during punch, blend back to white as it decays
  ctx.fillStyle = (scorePunchScale > 0 && scorePunchColor) ? scorePunchColor : '#FFFFFF';
  ctx.fillText(scoreStr, CANVAS_WIDTH - 8, 8);

  ctx.restore();

  // Speed indicator — small text below score, pulses with beat (US-008)
  const speedKmh = Math.round(gameState.scrollSpeed * 0.36);
  const speedScale = 1 + 0.08 * beatPulse;
  ctx.save();
  ctx.translate(anchorX, anchorY + 22);
  ctx.scale(speedScale, speedScale);
  ctx.translate(-anchorX, -(anchorY + 22));
  ctx.font = '12px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`${speedKmh} km/h`, CANVAS_WIDTH - 8, anchorY + 22);
  ctx.restore();

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

// --- Nitro Meter HUD (US-008) ---
// Small bar at bottom-center; visible when nitro is active; glows on beat.
function renderNitroHUD (ctx) {
  if (nitroTimer <= 0 && nitroEaseTimer <= 0) return;
  const pct = nitroTimer > 0
    ? nitroTimer / NITRO_BOOST_DURATION
    : (nitroEaseTimer / NITRO_EASE_DURATION) * 0.5; // ease-out shows at half intensity
  const baseAlpha = 0.7 + 0.3 * nitroPulse; // glows brighter (+0.3 max) on each beat

  const barW = 80;
  const barH = 5;
  const x = CANVAS_WIDTH / 2 - barW / 2;
  const y = CANVAS_HEIGHT - 18;

  ctx.save();
  ctx.globalAlpha = baseAlpha;
  // Background track
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, barW, barH);
  // Cyan fill
  ctx.fillStyle = '#00FFFF';
  ctx.fillRect(x, y, barW * pct, barH);
  // Label
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#00FFFF';
  ctx.fillText('NITRO', CANVAS_WIDTH / 2, y - 1);
  ctx.restore();
}

// --- Mute Icon HUD ---
function renderMuteIcon (ctx) {
  const x = CANVAS_WIDTH - 28; // center of icon
  const y = 54;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';

  // Speaker body (small rectangle)
  ctx.fillRect(x - 8, y - 5, 6, 10);
  // Speaker cone (triangle)
  ctx.beginPath();
  ctx.moveTo(x - 2, y - 5);
  ctx.lineTo(x + 4, y - 10);
  ctx.lineTo(x + 4, y + 10);
  ctx.lineTo(x - 2, y + 5);
  ctx.closePath();
  ctx.fill();

  if (!AudioManager.muted) {
    // Sound wave arcs
    ctx.beginPath();
    ctx.arc(x + 5, y, 7, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 5, y, 12, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  } else {
    // X mark
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 7);
    ctx.lineTo(x + 16, y + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 16, y - 7);
    ctx.lineTo(x + 6, y + 7);
    ctx.stroke();
  }

  ctx.restore();
}

// --- Pause Button HUD (US-003) ---
function renderPauseButton (ctx) {
  // Only show during playingState and not paused
  if (fsm.currentState !== playingState || gamePaused) return;
  const x = CANVAS_WIDTH - 28;
  const y = 20;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#FFFFFF';
  // Two vertical bars ❚❚
  ctx.fillRect(x - 6, y - 8, 4, 16);
  ctx.fillRect(x + 2, y - 8, 4, 16);
  ctx.restore();
}

// --- Pause Overlay (US-003) ---
function renderPauseOverlay (ctx) {
  if (!gamePaused) return;

  // Dark semi-transparent overlay
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // "PAUSADO" text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Glow effect
  ctx.shadowColor = '#00FFFF';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 48px monospace';
  ctx.fillText('PAUSADO', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
  ctx.shadowBlur = 0;

  // "Continuar" button
  const btnX = CANVAS_WIDTH / 2;
  const btnY = CANVAS_HEIGHT / 2 + 40;
  const btnW = 180;
  const btnH = 44;

  // Button background
  ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
  ctx.strokeStyle = '#00FFFF';
  ctx.lineWidth = 2;
  const r = 8;
  ctx.beginPath();
  ctx.moveTo(btnX - btnW / 2 + r, btnY - btnH / 2);
  ctx.lineTo(btnX + btnW / 2 - r, btnY - btnH / 2);
  ctx.arcTo(btnX + btnW / 2, btnY - btnH / 2, btnX + btnW / 2, btnY - btnH / 2 + r, r);
  ctx.lineTo(btnX + btnW / 2, btnY + btnH / 2 - r);
  ctx.arcTo(btnX + btnW / 2, btnY + btnH / 2, btnX + btnW / 2 - r, btnY + btnH / 2, r);
  ctx.lineTo(btnX - btnW / 2 + r, btnY + btnH / 2);
  ctx.arcTo(btnX - btnW / 2, btnY + btnH / 2, btnX - btnW / 2, btnY + btnH / 2 - r, r);
  ctx.lineTo(btnX - btnW / 2, btnY - btnH / 2 + r);
  ctx.arcTo(btnX - btnW / 2, btnY - btnH / 2, btnX - btnW / 2 + r, btnY - btnH / 2, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Button text
  ctx.fillStyle = '#00FFFF';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('Continuar', btnX, btnY);

  // Hint text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '12px monospace';
  ctx.fillText('P / Esc para continuar', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 90);

  ctx.restore();
}

// Helper to toggle pause state (US-003)
function togglePause () {
  if (fsm.currentState !== playingState) return;
  gamePaused = !gamePaused;
  if (gamePaused) {
    // Reduce audio volume during pause
    pauseAudioWasMuted = AudioManager.muted;
    if (!pauseAudioWasMuted && AudioManager.ctx && AudioManager.masterGain) {
      AudioManager.masterGain.gain.setTargetAtTime(0.05, AudioManager.ctx.currentTime, 0.01);
    }
  } else {
    // Restore audio volume
    if (!pauseAudioWasMuted && AudioManager.ctx && AudioManager.masterGain) {
      AudioManager.masterGain.gain.setTargetAtTime(1, AudioManager.ctx.currentTime, 0.01);
    }
  }
}

// --- Combo HUD ---
function renderComboHUD (ctx) {
  // Show during active combo OR during expire fade-out
  const isActive = comboMultiplier >= 2;
  const isFading = comboExpireFadeTimer > 0;
  if (!isActive && !isFading) return;

  // Use last known combo level during fade-out (multiplier already reset to 1)
  const displayLevel = isActive ? comboMultiplier : 2; // minimum x2 for color
  const comboColor = getComboColor(displayLevel);

  // Alpha: full during active, fade during expire
  let alpha = 1;
  if (!isActive && isFading) {
    alpha = comboExpireFadeTimer / 0.3;
  }

  // Pop/bounce animation on each new near miss
  const scaleProgress = comboScaleTimer > 0 ? comboScaleTimer / COMBO_SCALE_DURATION : 0;
  const popScale = 1 + 0.35 * scaleProgress;

  // Expire shake: horizontal oscillation
  let shakeX = 0;
  if (comboExpireShakeTimer > 0) {
    shakeX = Math.sin(comboExpireShakeTimer * 80) * 3 * (comboExpireShakeTimer / 0.15);
  }

  const cx = CANVAS_WIDTH / 2;
  const cy = 45;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx + shakeX, cy);
  ctx.scale(popScale, popScale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Milestone white flash overlay
  const isFlashing = comboMilestoneFlash > 0;

  // Main combo text: 'x{N} COMBO'
  const label = `x${isActive ? comboMultiplier : 2} COMBO`;
  ctx.font = 'bold 30px monospace';

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(label, 1, 1);

  // Colored text (or white during milestone flash)
  ctx.fillStyle = isFlashing ? '#FFFFFF' : comboColor;
  ctx.fillText(label, 0, 0);

  // Timer bar below the text
  if (isActive) {
    const barWidth = 120;
    const barHeight = 6;
    const ratio = comboResetTimer / COMBO_RESET_TIME;
    const barX = -barWidth / 2;
    const barY = 18;

    // Bar background
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Bar fill — green/yellow/red based on ratio
    let barColor;
    if (ratio > 0.66) barColor = '#44FF44';
    else if (ratio > 0.33) barColor = '#FFDD00';
    else barColor = '#FF4444';

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barWidth * ratio, barHeight);
  }

  ctx.restore();
}

// --- Title State ---
const TOAST_NEWS = [
  { icon: '🎨', text: 'Sprites renovados em todas as fases!' },
  { icon: '⚡', text: 'Near Miss — passe rente e ganhe pontos!' },
  { icon: '🎁', text: 'Surpresas esperando nos 25k e 50k...' },
];

const titleState = {
  pulseTime: 0,
  scrollOffset: 0,
  carFloatTime: 0,
  toastTimer: 0,
  toastIndex: 0,
  toastPhase: 'in', // 'in' | 'show' | 'out' | 'wait'
  toastPhaseTimer: 0,

  onEnter () {
    this.pulseTime = 0;
    this.carFloatTime = 0;
    this.toastTimer = 0;
    this.toastIndex = 0;
    this.toastPhase = 'wait';
    this.toastPhaseTimer = 0.8; // small delay before first toast
    // Start drone if AudioContext already exists (return visits)
    if (AudioManager.ctx) {
      AudioManager.startTitleDrone();
    }
    rankingBtnEl.style.display = 'block';
    positionRankingBtn();
    feedbackBtnEl.style.display = 'block';
    positionFeedbackBtn();
  },

  onExit () {
    AudioManager.stopTitleDrone();
    rankingBtnEl.style.display = 'none';
    feedbackBtnEl.style.display = 'none';
  },

  update (dt) {
    this.pulseTime += dt;
    this.scrollOffset += 260 * dt;
    this.carFloatTime += dt;

    // Toast news cycling
    this.toastPhaseTimer -= dt;
    if (this.toastPhaseTimer <= 0) {
      if (this.toastPhase === 'wait') {
        this.toastPhase = 'in';
        this.toastPhaseTimer = 0.4;
      } else if (this.toastPhase === 'in') {
        this.toastPhase = 'show';
        this.toastPhaseTimer = 3.0;
      } else if (this.toastPhase === 'show') {
        this.toastPhase = 'out';
        this.toastPhaseTimer = 0.4;
      } else if (this.toastPhase === 'out') {
        this.toastIndex = (this.toastIndex + 1) % TOAST_NEWS.length;
        this.toastPhase = 'wait';
        this.toastPhaseTimer = 0.6;
      }
    }

    if (consumeKey('r') || consumeKey('R')) {
      fsm.transition(titleRankingState);
      return;
    }
    if (consumeKey('Enter')) {
      AudioManager.init();
      AudioManager.resume();
      // Start drone briefly — it will crossfade out via onExit
      AudioManager.startTitleDrone();
      AudioManager.playRiser();
      resetGameState();
      fsm.transition(playingState);
    }
  },

  render (ctx) {
    const CX = CANVAS_WIDTH / 2;

    // --- Animated road background ---
    renderRoad(ctx, this.scrollOffset);

    // --- Overlay gradient for readability ---
    const ov = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    ov.addColorStop(0,    'rgba(8,8,20,0.88)');
    ov.addColorStop(0.28, 'rgba(8,8,20,0.55)');
    ov.addColorStop(0.55, 'rgba(8,8,20,0.30)');
    ov.addColorStop(0.80, 'rgba(8,8,20,0.60)');
    ov.addColorStop(1,    'rgba(8,8,20,0.90)');
    ctx.fillStyle = ov;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // --- Logo glow backdrop ---
    ctx.save();
    ctx.filter = 'blur(28px)';
    ctx.fillStyle = 'rgba(229,57,53,0.28)';
    ctx.fillRect(CX - 130, 62, 260, 160);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // --- "ROAD" ---
    ctx.save();
    ctx.shadowColor = '#FF1744';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 60px monospace';
    ctx.fillText('ROAD', CX, 72);
    ctx.restore();

    // --- "RUSH" ---
    ctx.save();
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 72px monospace';
    ctx.fillText('RUSH', CX, 135);
    ctx.restore();

    // Accent lines flanking the logo area
    const lineY = 222;
    ctx.strokeStyle = 'rgba(255,215,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, lineY); ctx.lineTo(CX - 80, lineY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + 80, lineY); ctx.lineTo(CANVAS_WIDTH - 16, lineY); ctx.stroke();
    // Center diamond
    ctx.fillStyle = '#FFD700';
    ctx.save();
    ctx.translate(CX, lineY);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();

    // --- Tagline ---
    ctx.fillStyle = 'rgba(255,255,255,0.50)';
    ctx.font = '12px monospace';
    ctx.fillText('DESVIE  ·  SOBREVIVA  ·  DOMINE', CX, 232);

    // --- Best score badge ---
    const bestScore = parseInt(localStorage.getItem('roadrush_best_score') || '0', 10);
    if (bestScore > 0) {
      const bx = CX - 88, by = 260, bw = 176, bh = 24;
      ctx.fillStyle = 'rgba(255,215,0,0.10)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,0,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.stroke();
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 11px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🏆  RECORDE: ${bestScore.toLocaleString()}`, CX, by + bh / 2);
    }

    ctx.textBaseline = 'top';

    // --- Decorative side cars (faded, to show gameplay) ---
    const drawShowCar = (cx, cy, col, w, h) => {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(cx, cy + h / 2 + 6, w * 0.45, 6, 0, 0, Math.PI * 2); ctx.fill();
      // Body
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(cx - w / 2, cy, w, h, 5); ctx.fill();
      // Windshield
      ctx.fillStyle = 'rgba(100,180,255,0.45)';
      ctx.fillRect(cx - w / 2 + 4, cy + 7, w - 8, 12);
      // Rear window
      ctx.fillRect(cx - w / 2 + 4, cy + h - 19, w - 8, 10);
      // Taillights
      ctx.fillStyle = '#FF5252';
      ctx.fillRect(cx - w / 2 + 2, cy + h - 7, 6, 4);
      ctx.fillRect(cx + w / 2 - 8, cy + h - 7, 6, 4);
    };

    ctx.globalAlpha = 0.45;
    // Lane 0 center (x=80), car slightly higher for depth
    drawShowCar(ROAD_LEFT + LANE_WIDTH * 0.5, 306, '#42A5F5', 32, 54);
    // Lane 3 center (x=320), slightly higher for depth
    drawShowCar(ROAD_LEFT + LANE_WIDTH * 3.5, 316, '#66BB6A', 32, 54);
    ctx.globalAlpha = 1;

    // --- Player car (center, floating) ---
    const carFloat = Math.sin(this.carFloatTime * 1.6) * 3.5;
    const carX = CX - PLAYER_WIDTH / 2;
    const carY = 330 + carFloat;

    // Car ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(CX, carY + PLAYER_HEIGHT + 8, PLAYER_WIDTH * 0.55, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Car glow
    ctx.save();
    ctx.shadowColor = '#FF1744';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#E53935';
    ctx.beginPath(); ctx.roundRect(carX, carY, PLAYER_WIDTH, PLAYER_HEIGHT, 6); ctx.fill();
    ctx.restore();

    // Windshield
    ctx.fillStyle = 'rgba(100,180,255,0.65)';
    ctx.fillRect(carX + 6, carY + 8, PLAYER_WIDTH - 12, 16);
    // Rear window
    ctx.fillRect(carX + 6, carY + PLAYER_HEIGHT - 22, PLAYER_WIDTH - 12, 12);

    // Headlights with glow
    ctx.save();
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(carX + 8, carY + 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(carX + PLAYER_WIDTH - 8, carY + 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Headlight beam rays
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(carX + 8, carY + 5);
    ctx.lineTo(carX - 20, carY - 50);
    ctx.lineTo(carX + 22, carY - 50);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(carX + PLAYER_WIDTH - 8, carY + 5);
    ctx.lineTo(carX + PLAYER_WIDTH - 22, carY - 50);
    ctx.lineTo(carX + PLAYER_WIDTH + 20, carY - 50);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // --- Pulsing start prompt ---
    const isMob = 'ontouchstart' in window;
    const startLabel = isMob ? '  TOQUE PARA JOGAR  ' : '  PRESS ENTER  ';
    const pulse = 0.55 + 0.45 * Math.sin(this.pulseTime * 2.6);
    // Button-style background for the prompt
    ctx.globalAlpha = pulse * 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(CX - 95, 510, 190, 32, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(CX - 95, 510, 190, 32, 10); ctx.stroke();
    ctx.globalAlpha = pulse;
    ctx.save();
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(startLabel, CX, 526);
    ctx.restore();
    ctx.globalAlpha = 1;

    // --- News toast ---
    if (this.toastPhase !== 'wait') {
      const news = TOAST_NEWS[this.toastIndex];
      let alpha = 1;
      let slideX = 0;
      if (this.toastPhase === 'in') {
        const t = 1 - this.toastPhaseTimer / 0.4;
        alpha = t;
        slideX = (1 - t) * 60;
      } else if (this.toastPhase === 'out') {
        const t = this.toastPhaseTimer / 0.4;
        alpha = t;
        slideX = -(1 - t) * 60;
      }

      ctx.save();
      ctx.globalAlpha = alpha * 0.92;
      const tw = 280, th = 34;
      const tx = CX - tw / 2 + slideX;
      const ty = 560;

      // Background pill
      ctx.fillStyle = 'rgba(20,20,40,0.82)';
      ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 12); ctx.fill();

      // Border
      ctx.strokeStyle = 'rgba(255,215,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 12); ctx.stroke();

      // "NOVO" badge
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('NOVO', tx + 10, ty + th / 2 - 1);

      // Icon + text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '11px monospace';
      ctx.fillText(`${news.icon}  ${news.text}`, tx + 42, ty + th / 2);

      ctx.restore();
      ctx.textAlign = 'center';
    }

    // Dots indicator for toast position
    {
      const dotY = 600;
      for (let i = 0; i < TOAST_NEWS.length; i++) {
        ctx.fillStyle = i === this.toastIndex ? 'rgba(255,215,0,0.7)' : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(CX - (TOAST_NEWS.length - 1) * 6 + i * 12, dotY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Footer hint ---
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = '10px monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText('R = RANKING', CX, CANVAS_HEIGHT - 6);
  },
};

// --- Playing State ---
const playingState = {
  onEnter () {
    rankingBtnEl.style.display = 'none';
    feedbackBtnEl.style.display = 'none';
    AudioManager.startEngine();
    AudioManager.startRoad();
    AudioManager.startBeat();
    AudioManager.startPad();
    AudioManager.startArp();
    AudioManager.startBass();
    if (isMobileDevice) {
      // Show arrow buttons only if gyroscope is not active (US-004)
      if (gyroEnabled) {
        // Re-attach listener (was detached in onExit)
        window.addEventListener('deviceorientation', onDeviceOrientation, true);
      } else {
        touchLeft.style.display = 'flex';
        touchRight.style.display = 'flex';
      }
    }
  },

  onExit () {
    // Restore audio if paused when exiting (US-003)
    if (gamePaused) {
      gamePaused = false;
      if (!pauseAudioWasMuted && AudioManager.ctx && AudioManager.masterGain) {
        AudioManager.masterGain.gain.setTargetAtTime(1, AudioManager.ctx.currentTime, 0.01);
      }
    }
    // Stop gyroscope listener when leaving playing state (US-004)
    if (gyroEnabled) {
      window.removeEventListener('deviceorientation', onDeviceOrientation, true);
      gyroGamma = 0;
      // Note: we keep gyroEnabled=true so it auto-restarts on next playingState enter
    }
    AudioManager.stopNitro();
    AudioManager.stopBeat();
    AudioManager.stopArp();
    AudioManager.stopBass();
    AudioManager.stopEngine();
    AudioManager.stopRoad();
    AudioManager.stopPad();
    touchLeft.style.display = 'none';
    touchRight.style.display = 'none';
    keys['ArrowLeft'] = false;
    keys['ArrowRight'] = false;
  },

  update (dt) {
    gameState.elapsedTime += dt;
    updateScrollSpeed(dt);
    AudioManager.updateEngine(gameState.scrollSpeed);
    AudioManager.updateRoad(gameState.scrollSpeed);
    AudioManager.updateNitro();
    AudioManager.updateBeat(gameState.scrollSpeed);
    AudioManager.updatePad(gameState.scrollSpeed);
    AudioManager.updateArp(gameState.scrollSpeed);

    // Beat-pulse HUD detection (US-008): fire when AudioContext time crosses a scheduled beat
    if (AudioManager.ctx && AudioManager.beat.pendingBeats.length > 0) {
      const now = AudioManager.ctx.currentTime;
      while (AudioManager.beat.pendingBeats.length > 0 && AudioManager.beat.pendingBeats[0] <= now) {
        AudioManager.beat.pendingBeats.shift();
        beatPulse = 1.0;
        if (nitroTimer > 0) nitroPulse = 1.0;
      }
    }
    // Exponential decay of beat pulses (each approaches 0 by its target duration)
    if (beatPulse > 0.001) beatPulse *= BEAT_PULSE_DECAY; else beatPulse = 0;
    if (nitroPulse > 0.001) nitroPulse *= BEAT_PULSE_DECAY; else nitroPulse = 0;
    if (coinPulse > 0.001) coinPulse *= COIN_PULSE_DECAY; else coinPulse = 0;

    const effSpeed = getEffectiveScrollSpeed();
    gameState.scrollOffset += effSpeed * dt;
    gameState.distanceTraveled += effSpeed * dt;

    if (consumeKey('d') || consumeKey('D')) debugMode = !debugMode;
    // Debug shortcuts: P = jump near 25k (sky), O = jump near 50k (space)
    if (debugMode && (consumeKey('p') || consumeKey('P'))) gameState.score = 24500;
    if (debugMode && (consumeKey('o') || consumeKey('O'))) gameState.score = 49500;
    if (debugMode && (consumeKey('w') || consumeKey('W'))) { shootingTimer += WEAPON_DURATION; gameState.player.shooting = true; }

    updatePlayer(dt);
    updateTraffic(dt);
    updateFuelItems(dt);
    updateCoins(dt);
    updateNitroItems(dt);
    updateShieldItems(dt);
    updateWeaponItems(dt);
    updateBullets(dt);

    // Tick weapon shooting timer
    if (shootingTimer > 0) {
      shootingTimer = Math.max(0, shootingTimer - dt);
      if (shootingTimer === 0) {
        gameState.player.shooting = false;
      }
    }

    // Tick floating pickup texts (US-009)
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      floatTexts[i].y -= 60 * dt;
      floatTexts[i].timer -= dt;
      if (floatTexts[i].timer <= 0) floatTexts.splice(i, 1);
    }
    AudioManager.updateCoinSeq(dt);
    updateParticles(dt);

    // Tick nitro boost and ease-out timers; spawn blue particle trail during active boost
    // Start nitro audio when boost is active and audio isn't playing yet
    if (nitroTimer > 0 && !AudioManager.nitro.active) AudioManager.startNitro();
    if (nitroTimer > 0) {
      nitroTimer = Math.max(0, nitroTimer - dt);
      if (nitroTimer === 0) {
        nitroEaseTimer = NITRO_EASE_DURATION;
        AudioManager.stopNitro();
      }
      // Blue particle trail: 4-6 particles per frame at car bottom-center
      const trailCount = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < trailCount; i++) {
        particles.push({
          x: gameState.player.x + PLAYER_WIDTH / 2 + (Math.random() * 2 - 1) * 10,
          y: gameState.player.y + PLAYER_HEIGHT,
          vx: (Math.random() * 2 - 1) * 30,
          vy: 50 + Math.random() * 50, // drift downward on screen
          life: 0.3,
          maxLife: 0.3,
          color: '#42A5F5',
          size: 2 + Math.random() * 2,
          isNitro: true,
        });
      }
    }
    if (nitroEaseTimer > 0) nitroEaseTimer = Math.max(0, nitroEaseTimer - dt);

    // Tick chromatic aberration timer (US-002)
    if (chromaTimer > 0) chromaTimer = Math.max(0, chromaTimer - dt);

    // Tick shield break flash
    if (shieldBreakFlash > 0) shieldBreakFlash = Math.max(0, shieldBreakFlash - dt);

    // Distance score: 1 pt per 10 px traveled (multiplied by combo when active)
    gameState.score += effSpeed * dt * SCORE_PER_PX * (comboMultiplier >= 2 ? comboMultiplier : 1);

    // Survivor bonus: +300 every 30s without collision
    gameState.survivorTimer += dt;
    if (gameState.survivorTimer >= SURVIVOR_INTERVAL) {
      gameState.score += SURVIVOR_BONUS;
      gameState.survivorTimer -= SURVIVOR_INTERVAL;
      survivorFlash = { timer: 2.0 };
      AudioManager.playSurvivorBonus();
    }

    // Tick survivor flash
    if (survivorFlash !== null) {
      survivorFlash.timer -= dt;
      if (survivorFlash.timer <= 0) survivorFlash = null;
    }

    // DDA: accumulate clean time; every 10s without collision → +5% spawn rate (cap 1.5)
    ddaCleanTimer += dt;
    while (ddaCleanTimer >= 10) {
      ddaCleanTimer -= 10;
      ddaSpawnRate = Math.min(1.5, ddaSpawnRate + 0.05);
    }

    // Lerp displayed score toward actual score
    gameState.displayedScore += (gameState.score - gameState.displayedScore) * Math.min(1, SCORE_LERP_RATE * dt);

    // Phase transition triggers
    if (!phaseTriggered.sky && gameState.score >= 25000) {
      phaseTriggered.sky = true;
      gameState.phase = 'sky';
      gameState.phaseTransition = { progress: 0, _timer: 0, active: true, from: 'road', to: 'sky' };
      spawnPauseTimer = 1.0; // Brief pause to avoid overwhelming player during transition
      AudioManager.playPhaseTransition('road', 'sky');
      spawnTransitionParticles('road', 'sky');
    }
    if (!phaseTriggered.space && gameState.score >= 50000) {
      phaseTriggered.space = true;
      gameState.phase = 'space';
      gameState.phaseTransition = { progress: 0, _timer: 0, active: true, from: 'sky', to: 'space' };
      spawnPauseTimer = 1.0; // Brief pause to avoid overwhelming player during transition
      AudioManager.playPhaseTransition('sky', 'space');
      spawnTransitionParticles('sky', 'space');
    }

    // Advance active phase transition (3 second duration with easing)
    if (gameState.phaseTransition.active) {
      const TRANSITION_DURATION = 3;
      gameState.phaseTransition._timer = Math.min(TRANSITION_DURATION, gameState.phaseTransition._timer + dt);
      const linearT = gameState.phaseTransition._timer / TRANSITION_DURATION;
      gameState.phaseTransition.progress = easeInOutCubic(linearT);
      if (gameState.phaseTransition._timer >= TRANSITION_DURATION) {
        gameState.phaseTransition.active = false;
        gameState.phaseTransition.progress = 1;
      }
    }

    // Drain fuel proportional to effective speed
    const fuelDrain = (FUEL_DRAIN_BASE + (getEffectiveScrollSpeed() / SPEED_MAX) * FUEL_DRAIN_SPEED) * dt;
    gameState.fuel = Math.max(0, gameState.fuel - fuelDrain);
    if (gameState.fuel <= 0) {
      gameOverState.causeOfDeath = 'fuel_empty';
      fsm.transition(gameOverState);
      return;
    }

    // Fuel warning beep when low
    AudioManager.updateFuelWarning(dt, gameState.fuel / FUEL_INITIAL);

    // Tick invulnerability timer
    if (invulnTimer > 0) invulnTimer = Math.max(0, invulnTimer - dt);

    // Tick combo reset timer; expire combo when it runs out
    if (comboResetTimer > 0) {
      comboResetTimer = Math.max(0, comboResetTimer - dt);
      if (comboResetTimer === 0 && comboMultiplier > 1) {
        AudioManager.playComboLost();
        comboMultiplier = 1;
        comboExpireShakeTimer = 0.15;
        comboExpireFadeTimer = 0.3;
      }
    }
    // Tick combo scale animation
    if (comboScaleTimer > 0) comboScaleTimer = Math.max(0, comboScaleTimer - dt);
    // Tick combo expire effects
    if (comboExpireShakeTimer > 0) comboExpireShakeTimer = Math.max(0, comboExpireShakeTimer - dt);
    if (comboExpireFadeTimer > 0) comboExpireFadeTimer = Math.max(0, comboExpireFadeTimer - dt);
    if (comboMilestoneFlash > 0) comboMilestoneFlash = Math.max(0, comboMilestoneFlash - dt);
    // Combo glow: fade in over 0.3s when combo active, fade out over 0.5s when lost
    const glowTarget = comboMultiplier >= 2 ? 1 : 0;
    if (glowTarget > comboGlowAlpha) {
      comboGlowAlpha = Math.min(1, comboGlowAlpha + dt / 0.3);
    } else if (glowTarget < comboGlowAlpha) {
      comboGlowAlpha = Math.max(0, comboGlowAlpha - dt / 0.5);
    }

    // Decay score punch scale (US-007)
    if (scorePunchScale > 0) scorePunchScale = Math.max(0, scorePunchScale - dt * 3);

    // Camera zoom on high combo (US-009): lerp toward target
    const zoomTarget = comboMultiplier >= 6 ? 1.04 : comboMultiplier >= 4 ? 1.02 : 1.0;
    comboZoom += (Math.min(1.05, zoomTarget) - comboZoom) * dt * 3;

    // Fade red flash
    if (redFlash.alpha > 0) redFlash.alpha = Math.max(0, redFlash.alpha - dt / 0.15);

    // Screen-edge danger flash: accumulate alpha from nearby traffic vehicles (US-010)
    {
      const playerCenterY = gameState.player.y + PLAYER_HEIGHT / 2;
      let dangerAccum = 0;
      for (const v of gameState.traffic) {
        const vehicleCenterY = v.y + v.height / 2;
        if (Math.abs(vehicleCenterY - playerCenterY) < DANGER_FLASH_PROXIMITY) {
          dangerAccum += 0.25; // each nearby vehicle contributes 0.25 (2+ vehicles reach cap)
        }
      }
      dangerAccum = Math.min(dangerAccum, 0.5); // cap at 0.5 total
      if (dangerAccum > dangerFlashAlpha) {
        dangerFlashAlpha = dangerAccum; // rapid onset: jump to danger level immediately
      } else {
        dangerFlashAlpha = Math.max(0, dangerFlashAlpha - dt / DANGER_FLASH_DECAY); // decay over 0.3s
      }
    }

    // Adaptive HUD opacity (US-012): update trackers each frame
    tickHudOpacity(hudOpacity.score, Math.floor(gameState.displayedScore), gameState.elapsedTime);
    tickHudOpacity(hudOpacity.fuel, Math.floor(gameState.fuel), gameState.elapsedTime);

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

  render (ctx) {
    // --- World layer with camera roll (US-006) ---
    // Rotate canvas around its center; HUD is drawn after restore so it stays level
    ctx.save();
    if (cameraRoll !== 0) {
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.rotate(cameraRoll * Math.PI / 180);
      ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
    }

    // Camera zoom on high combo (US-009) — purely visual, does not affect game logic
    if (comboZoom !== 1.0) {
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.scale(comboZoom, comboZoom);
      ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
    }

    // Heat haze / road shimmer (US-007) — renders road with distortion when speed > 500;
    // falls back to normal renderRoad when below threshold or returns false
    if (!renderHeatHaze(gameState.scrollOffset)) {
      renderRoad(ctx, gameState.scrollOffset);
    }
    // Motion blur: ghost of previous frame composited behind current world (US-003)
    renderMotionGhost();
    renderSpeedLines(ctx);
    renderTraffic(ctx);
    renderFuelItems(ctx);
    renderCoins(ctx);
    renderNitroItems(ctx);
    renderShieldItems(ctx);
    renderWeaponItems(ctx);
    renderBullets(ctx);
    renderPlayer(ctx, gameState.player);
    renderParticles(ctx);
    // Capture road/traffic/player/particles layer for motion blur next frame (US-003)
    captureGhostFrame();

    // Bloom / glow on collectibles and headlights (US-004)
    renderBloom();

    // Red flash overlay on frontal collision
    if (redFlash.alpha > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${redFlash.alpha})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Speed vignette — tunnel vision effect (darkens edges at high speed)
    renderSpeedVignette(ctx);

    // Screen-edge danger flash — red glow from edges when traffic is nearby (US-010)
    renderDangerFlash(ctx);

    // Combo edge glow — ambient glow on top/bottom borders (US-006)
    renderComboGlow(ctx);

    ctx.restore();
    // --- End world layer ---

    // Floating pickup texts — above world, below HUD (US-009)
    renderFloatTexts(ctx);

    // Chromatic aberration — RGB split on collision/nitro (US-002)
    // Applied after restore so it post-processes the full rolled frame
    renderChromaticAberration();

    // Fuel bar HUD (full-width bar at top + low-fuel vignette) — US-012: adaptive opacity
    {
      const fuelCritical = gameState.fuel < FUEL_INITIAL * 0.3;
      ctx.save();
      ctx.globalAlpha = fuelCritical ? 1.0 : hudOpacity.fuel.currentAlpha;
      renderFuelHUD(ctx);
      ctx.restore();
    }

    // Score HUD (top-right) — US-012: adaptive opacity
    {
      ctx.save();
      ctx.globalAlpha = hudOpacity.score.currentAlpha;
      renderScoreHUD(ctx);
      ctx.restore();
    }

    // Combo counter (center-top, shown when combo >= 2)
    renderComboHUD(ctx);

    // Nitro meter (bottom-center, visible during boost; beat-reactive glow) (US-008)
    renderNitroHUD(ctx);
    // Weapon shooting meter (below nitro bar)
    renderWeaponHUD(ctx);

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
      if (comboMultiplier > 1) ctx.fillText(`Combo: x${comboMultiplier} (${comboResetTimer.toFixed(1)}s)`, 8, 128);
      // Type breakdown
      const counts = {};
      for (const v of gameState.traffic) counts[v.type] = (counts[v.type] || 0) + 1;
      let y = 142;
      for (const [type, count] of Object.entries(counts)) {
        ctx.fillText(`  ${type}: ${count}`, 8, y);
        y += 14;
      }
      // DDA values
      ctx.fillText(`DDA rate: x${ddaSpawnRate.toFixed(2)} (${ddaCleanTimer.toFixed(0)}s clean)`, 8, y);
      y += 14;
      if (comboMultiplier >= 3) { ctx.fillText(`DDA combo: x0.9 (combo ${comboMultiplier})`, 8, y); y += 14; }
      if (gameState.fuel > 70) { ctx.fillText(`DDA fuel: x1.2 (fuel ${gameState.fuel.toFixed(0)})`, 8, y); y += 14; }
      if (nitroTimer > 0) { ctx.fillText(`NITRO: ${nitroTimer.toFixed(1)}s (x${getNitroMultiplier().toFixed(2)})`, 8, y); y += 14; }
      else if (nitroEaseTimer > 0) { ctx.fillText(`Nitro ease: ${nitroEaseTimer.toFixed(2)}s (x${getNitroMultiplier().toFixed(2)})`, 8, y); y += 14; }
      if (gameState.player.hasShield) { ctx.fillText('SHIELD: active', 8, y); y += 14; }
      ctx.fillText(`Phase: ${gameState.phase} | P=25k O=50k`, 8, y); y += 14;
    }
  },
};

// --- Explosion State ---
// Orchestrates the cinematic explosion sequence after a fatal collision.
// Renders the frozen game world for 2.0s before transitioning to gameOverState.
const explosionState = {
  originX: 0,
  originY: 0,
  timer: 0,
  finalTime: 0,
  finalDistance: 0,
  finalScore: 0,
  coinsCollected: 0,
  isNewBest: false,
  bestScore: 0,
  screenFlashAlpha: 0,
  fadeInAlpha: 0,
  textAlpha: 0,

  onEnter () {
    rankingBtnEl.style.display = 'none';
    feedbackBtnEl.style.display = 'none';
    this.originX = gameState.player.x + PLAYER_WIDTH / 2;
    this.originY = gameState.player.y + PLAYER_HEIGHT / 2;
    this.timer = 2.0;
    this.screenFlashAlpha = 1.0;
    this.fadeInAlpha = 0;
    this.textAlpha = 0;
    playerVisible = false;
    AudioManager.playExplosion();
    AudioManager.startExplosionRumble();
    // Hit stop on major collision (US-011): freeze update for 3 frames (~50ms)
    hitStopFrames = 3;
    // Chromatic aberration on explosion entry (US-002)
    chromaTimer = 0.4;
    chromaDuration = 0.4;
    chromaIntensity = 1.0;
    this.finalTime = gameState.elapsedTime;
    this.finalDistance = gameState.distanceTraveled;
    this.finalScore = Math.floor(gameState.score);
    this.coinsCollected = gameState.coinsCollected;
    const stored = parseInt(localStorage.getItem('roadrush_best_score') || '0', 10);
    this.isNewBest = this.finalScore > stored;
    this.bestScore = this.isNewBest ? this.finalScore : stored;
    if (this.isNewBest) localStorage.setItem('roadrush_best_score', this.finalScore);
    // Clear any pre-existing particles (e.g. nitro trail)
    particles.length = 0;
    // Spawn 40 fire/debris particles from explosion origin
    const fireColors = ['#FFF176', '#FFB74D', '#FF7043', '#E53935'];
    const debrisColors = ['#757575', '#4E342E'];
    for (let i = 0; i < 40; i++) {
      const isDebris = Math.random() < 0.3;
      const color = isDebris
        ? debrisColors[Math.floor(Math.random() * debrisColors.length)]
        : fireColors[Math.floor(Math.random() * fireColors.length)];
      const angle = Math.random() * Math.PI * 2;
      const speed = 200 + Math.random() * 200;
      const maxLife = 0.8 + Math.random() * 0.7;
      particles.push({
        x: this.originX,
        y: this.originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: maxLife,
        maxLife,
        color,
        size: 2 + Math.random() * 6,
      });
    }
    // Initialize shockwave rings (4 concentric, staggered start offsets)
    shockwaveRings.length = 0;
    const maxRadii = [120, 140, 160, 180];
    const startOffsets = [0, 0.25, 0.5, 0.75];
    for (let i = 0; i < 4; i++) {
      shockwaveRings.push({
        x: this.originX,
        y: this.originY,
        elapsed: 0,
        duration: 1.2,
        maxRadius: maxRadii[i],
        startOffset: startOffsets[i],
      });
    }
    // Mark nearby traffic vehicles as scattered
    const scatterRadius = 120;
    for (const v of gameState.traffic) {
      const vcx = v.x + v.width / 2;
      const vcy = v.y + v.height / 2;
      const dx = vcx - this.originX;
      const dy = vcy - this.originY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < scatterRadius) {
        const proximity = 1 - dist / scatterRadius; // 1 = closest, 0 = edge
        const speed = 150 + proximity * 150; // 150-300 px/s
        const len = dist < 1 ? 1 : dist;
        v.scattered = true;
        v.scatterVx = (dx / len) * speed;
        v.scatterVy = (dy / len) * speed;
        v.scatterRotation = 0;
        v.scatterSpinRate = (Math.random() - 0.5) * 8; // radians/s
        v.scatterAlpha = 1.0;
      }
    }
  },

  onExit () {
    AudioManager.stopExplosionRumble();
  },

  update (dt) {
    this.timer -= dt;
    for (const ring of shockwaveRings) ring.elapsed += dt;
    updateParticles(dt);
    if (this.screenFlashAlpha > 0) {
      this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt / 0.2);
    }
    // Tick chromatic aberration timer (US-002)
    if (chromaTimer > 0) chromaTimer = Math.max(0, chromaTimer - dt);
    // Update scattered vehicles
    for (const v of gameState.traffic) {
      if (v.scattered) {
        v.x += v.scatterVx * dt;
        v.y += v.scatterVy * dt;
        v.scatterRotation += v.scatterSpinRate * dt;
        v.scatterAlpha = Math.max(0, v.scatterAlpha - dt / 1.5);
      }
    }
    if (this.timer <= 0) {
      gameOverState.finalTime = this.finalTime;
      gameOverState.finalDistance = this.finalDistance;
      gameOverState.finalScore = this.finalScore;
      gameOverState.coinsCollected = this.coinsCollected;
      gameOverState.isNewBest = this.isNewBest;
      gameOverState.bestScore = this.bestScore;
      gameOverState.statsPreset = true;
      gameOverState.causeOfDeath = 'collision';
      fsm.transition(gameOverState);
    }
    // Fade in dark overlay and text after 1.0s elapsed (timer < 1.0)
    const elapsed = 2.0 - this.timer;
    if (elapsed >= 1.0) {
      this.fadeInAlpha = Math.min(1, this.fadeInAlpha + dt / 0.9);
    }
    if (elapsed >= 1.2) {
      this.textAlpha = Math.min(1, this.textAlpha + dt / 0.8);
    }
  },

  render (ctx) {
    renderRoad(ctx, gameState.scrollOffset);
    // Render non-scattered traffic normally
    renderTraffic(ctx);
    // Render scattered vehicles with rotation and alpha on top
    ctx.save();
    for (const v of gameState.traffic) {
      if (!v.scattered) continue;
      const cx = v.x + v.width / 2;
      const cy = v.y + v.height / 2;
      const typeColors = { truck: '#616161', sedan: '#1E88E5', sports: '#B71C1C', moto: '#FFC107' };
      ctx.save();
      ctx.globalAlpha = v.scatterAlpha;
      ctx.translate(cx, cy);
      ctx.rotate(v.scatterRotation);
      ctx.fillStyle = typeColors[v.type] || '#888888';
      ctx.fillRect(-v.width / 2, -v.height / 2, v.width, v.height);
      ctx.restore();
    }
    ctx.restore();
    // No renderPlayer (car hidden), no collectibles
    renderShockwaveRings(ctx);
    renderParticles(ctx);
    // Chromatic aberration — RGB split (US-002)
    renderChromaticAberration();
    // Screen flash: white overlay fading over ~0.2s
    if (this.screenFlashAlpha > 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = this.screenFlashAlpha;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.globalAlpha = 1;
    }
    // Dark overlay fading in from 1.0s elapsed
    if (this.fadeInAlpha > 0) {
      ctx.fillStyle = '#0A0A1A';
      ctx.globalAlpha = this.fadeInAlpha;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.globalAlpha = 1;
    }
    // Game over text fading in from 1.2s elapsed
    if (this.textAlpha > 0) {
      ctx.globalAlpha = this.textAlpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#E53935';
      ctx.font = 'bold 44px monospace';
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '18px monospace';
      const meters = (this.finalDistance / 100).toFixed(0);
      ctx.fillText(`Time: ${this.finalTime.toFixed(1)}s`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
      ctx.fillText(`Distance: ${meters}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 14);
      ctx.fillStyle = this.isNewBest ? '#FFD700' : '#FFFFFF';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`Score: ${this.finalScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 48);
      if (this.isNewBest) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('NEW BEST!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 72);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '14px monospace';
        ctx.fillText(`Best: ${this.bestScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 72);
      }
      ctx.globalAlpha = 1;
    }
  },
};

// --- Shared Ranking Panel Renderer ---
/**
 * Renders the ranking leaderboard section onto a Canvas 2D context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{name:string,score:number,distance:number}>} rankingData
 * @param {'idle'|'loading'|'loaded'|'error'} rankingStatus
 * @param {number} rankingScroll - index of first visible row
 * @param {number} rankingDotTime - elapsed time for animated dots
 * @param {string} highlightName - player name to highlight in gold
 * @param {Object} [opts] - layout options
 * @param {number} [opts.startY=537] - y position where panel starts
 * @param {number} [opts.rowH=13] - row height in px
 * @param {number} [opts.visible=10] - number of visible rows
 * @param {string} [opts.fontSize='10px'] - font size for entries
 * @param {boolean} [opts.cards=false] - render card-style rows
 */
function renderRankingPanel (ctx, rankingData, rankingStatus, rankingScroll, rankingDotTime, highlightName, opts) {
  const o = opts || {};
  const RANK_Y = o.startY !== undefined ? o.startY : 537;
  const RANK_ROW_H = o.rowH !== undefined ? o.rowH : 13;
  const RANK_VISIBLE = o.visible !== undefined ? o.visible : 10;
  const FONT_SIZE = o.fontSize || '10px';
  const CARDS = !!o.cards;
  const MEDALS = ['🥇', '🥈', '🥉'];

  ctx.textBaseline = 'top';
  ctx.font = `${FONT_SIZE} monospace`;

  if (rankingStatus === 'loading') {
    const dots = '.'.repeat(Math.floor(rankingDotTime * 2) % 4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(`Carregando${dots}`, CANVAS_WIDTH / 2, RANK_Y + 8);
  } else if (rankingStatus === 'error') {
    ctx.fillStyle = '#E53935';
    ctx.textAlign = 'center';
    ctx.fillText('Erro ao carregar ranking', CANVAS_WIDTH / 2, RANK_Y + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('Tente novamente', CANVAS_WIDTH / 2, RANK_Y + 22);
  } else if (rankingStatus === 'loaded') {
    if (rankingData.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText('Nenhum score ainda', CANVAS_WIDTH / 2, RANK_Y + 8);
    } else {
      const PAD = 12;
      const hasMore = rankingData.length > RANK_VISIBLE;

      if (CARDS) {
        // Card-style layout for full-screen ranking
        const visibleEntries = rankingData.slice(rankingScroll, rankingScroll + RANK_VISIBLE);
        visibleEntries.forEach((entry, i) => {
          const rank = rankingScroll + i + 1;
          const isPlayer = highlightName.length >= 2 && entry.name === highlightName;
          const rowY = RANK_Y + i * RANK_ROW_H;
          const cardH = RANK_ROW_H - 3;

          // Card background
          if (isPlayer) {
            ctx.fillStyle = 'rgba(255,215,0,0.18)';
          } else if (rank <= 3) {
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
          } else {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.12)';
          }
          ctx.beginPath();
          const rx = PAD, ry = rowY, rw = CANVAS_WIDTH - PAD * 2, rh = cardH;
          const r = 4;
          ctx.moveTo(rx + r, ry); ctx.lineTo(rx + rw - r, ry);
          ctx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
          ctx.lineTo(rx + rw, ry + rh - r);
          ctx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
          ctx.lineTo(rx + r, ry + rh);
          ctx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
          ctx.lineTo(rx, ry + r);
          ctx.arcTo(rx, ry, rx + r, ry, r);
          ctx.closePath();
          ctx.fill();

          // Left border accent for top 3
          if (rank <= 3 && !isPlayer) {
            const accentColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
            ctx.fillStyle = accentColors[rank - 1];
            ctx.fillRect(PAD, rowY, 3, cardH);
          } else if (isPlayer) {
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(PAD, rowY, 3, cardH);
          }

          const textY = rowY + cardH / 2 - parseInt(FONT_SIZE) / 2;
          const nameColor = isPlayer ? '#FFD700' : 'rgba(255,255,255,0.92)';
          const scoreColor = isPlayer ? '#FFE066' : '#7EC8E3';
          const distColor = 'rgba(255,255,255,0.45)';

          // Rank badge / medal
          ctx.textBaseline = 'top';
          if (rank <= 3) {
            ctx.font = `${parseInt(FONT_SIZE) + 1}px monospace`;
            ctx.textAlign = 'left';
            ctx.fillText(MEDALS[rank - 1], PAD + 6, textY);
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = `${parseInt(FONT_SIZE) - 1}px monospace`;
            ctx.textAlign = 'left';
            ctx.fillText(String(rank).padStart(2, ' '), PAD + 7, textY + 1);
          }

          // Name
          ctx.font = `bold ${FONT_SIZE} monospace`;
          ctx.fillStyle = nameColor;
          ctx.textAlign = 'left';
          const nameStr = String(entry.name || '').substring(0, 14);
          ctx.fillText(nameStr, PAD + 28, textY);

          // Score
          ctx.font = `bold ${FONT_SIZE} monospace`;
          ctx.fillStyle = scoreColor;
          ctx.textAlign = 'right';
          ctx.fillText(entry.score.toLocaleString(), CANVAS_WIDTH - PAD - 40, textY);

          // Distance
          const dist = typeof entry.distance === 'number' ? entry.distance : 0;
          ctx.font = `${parseInt(FONT_SIZE) - 1}px monospace`;
          ctx.fillStyle = distColor;
          ctx.fillText(`${dist}m`, CANVAS_WIDTH - PAD - 4, textY + 1);
        });

        // Scroll indicators
        if (rankingScroll > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.font = `12px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('▲ deslize', CANVAS_WIDTH / 2, RANK_Y - 14);
        }
        if (rankingScroll + RANK_VISIBLE < rankingData.length) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.font = `12px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('▼ deslize', CANVAS_WIDTH / 2, RANK_Y + RANK_VISIBLE * RANK_ROW_H + 4);
        }
      } else {
        // Compact layout for game over screen
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${FONT_SIZE} monospace`;
        ctx.textAlign = 'left';
        ctx.fillText('TOP SCORES' + (hasMore ? '  ▲▼' : ''), PAD, RANK_Y);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(PAD, RANK_Y + 12, CANVAS_WIDTH - PAD * 2, 1);

        const visibleEntries = rankingData.slice(rankingScroll, rankingScroll + RANK_VISIBLE);
        visibleEntries.forEach((entry, i) => {
          const rank = rankingScroll + i + 1;
          const isPlayer = highlightName.length >= 2 && entry.name === highlightName;
          const rowY = RANK_Y + 15 + i * RANK_ROW_H;
          ctx.fillStyle = isPlayer ? '#FFD700' : (i % 2 === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)');
          ctx.textAlign = 'left';
          const nameStr = String(entry.name || '').substring(0, 12);
          ctx.fillText(`${String(rank).padStart(2, '\u00a0')} ${nameStr}`, PAD, rowY);
          ctx.textAlign = 'right';
          const dist = typeof entry.distance === 'number' ? entry.distance : 0;
          ctx.fillText(`${entry.score}  ${dist}m`, CANVAS_WIDTH - PAD, rowY);
        });

        if (rankingScroll > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.textAlign = 'center';
          ctx.fillText('▲', CANVAS_WIDTH - 10, RANK_Y + 14);
        }
        if (rankingScroll + RANK_VISIBLE < rankingData.length) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.textAlign = 'center';
          ctx.fillText('▼', CANVAS_WIDTH - 10, RANK_Y + 15 + RANK_VISIBLE * RANK_ROW_H);
        }
      }
    }
  }
}

// --- GameOver State ---
const gameOverState = {
  pulseTime: 0,
  finalTime: 0,
  finalDistance: 0,
  finalScore: 0,
  coinsCollected: 0,
  bestScore: 0,
  isNewBest: false,
  causeOfDeath: '', // 'collision' or 'fuel_empty'
  statsPreset: false, // true when explosionState pre-sets final stats
  rankingData: [], // array of {name, score, distance} sorted by score desc
  rankingStatus: 'idle', // 'idle' | 'loading' | 'loaded' | 'error'
  rankingScroll: 0, // index of first visible row
  rankingDotTime: 0, // for animated loading dots

  onEnter () {
    rankingBtnEl.style.display = 'none';
    this.pulseTime = 0;
    if (!this.statsPreset) {
      // Fuel empty or other non-collision death: capture stats now
      this.finalTime = gameState.elapsedTime;
      this.finalDistance = gameState.distanceTraveled;
      this.finalScore = Math.floor(gameState.score);
      this.coinsCollected = gameState.coinsCollected;
      const stored = parseInt(localStorage.getItem('roadrush_best_score') || '0', 10);
      this.isNewBest = this.finalScore > stored;
      this.bestScore = this.isNewBest ? this.finalScore : stored;
      if (this.isNewBest) localStorage.setItem('roadrush_best_score', this.finalScore);
    }
    this.statsPreset = false;
    // Capture near miss stats (US-010)
    this.finalNearMissCount = nearMissCount;
    this.finalBestCombo = bestCombo;
    this.finalNearMissBonusTotal = nearMissBonusTotal;
    this.rankingScroll = 0;
    this.rankingDotTime = 0;
    this._rankingBuilt = false;
    feedbackBtnEl.style.display = 'block';
    positionFeedbackBtn();
    AudioManager.startGameOverDrone();
    showNameForm();
    fetchRanking();
    showGameOverRanking();
  },

  onExit () {
    feedbackBtnEl.style.display = 'none';
    AudioManager.stopGameOverDrone();
    hideNameForm();
    hideGameOverRanking();
  },

  update (dt) {
    this.pulseTime += dt;
    this.rankingDotTime += dt;
    if (consumeKey('Enter')) {
      AudioManager.playDrumRoll();
      resetGameState();
      fsm.transition(playingState);
    }
    // Update DOM ranking when data changes
    if (this.rankingStatus === 'loaded' && !this._rankingBuilt) {
      const playerName = nameInputEl ? nameInputEl.value.trim() : '';
      buildRankingDOM(this.rankingData, playerName);
      this._rankingBuilt = true;
    }
  },

  render (ctx) {
    const CX = CANVAS_WIDTH / 2;

    // --- Background ---
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bg.addColorStop(0,   '#060610');
    bg.addColorStop(0.5, '#0D0D1A');
    bg.addColorStop(1,   '#060610');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Red glow at top from explosion
    ctx.save();
    ctx.filter = 'blur(50px)';
    ctx.fillStyle = 'rgba(229,57,53,0.22)';
    ctx.fillRect(CX - 120, -20, 240, 140);
    ctx.restore();

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }

    ctx.textAlign = 'center';

    // --- GAME OVER title ---
    ctx.save();
    ctx.shadowColor = '#FF1744';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#FF5252';
    ctx.font = 'bold 40px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('GAME OVER', CX, 16);
    ctx.restore();

    // Cause of death badge
    if (this.causeOfDeath) {
      const codLabel = this.causeOfDeath === 'fuel_empty' ? '⛽ Sem combustível' : '💥 Colisão';
      const badgeColor = this.causeOfDeath === 'fuel_empty' ? 'rgba(255,193,7,0.18)' : 'rgba(229,57,53,0.18)';
      const textColor  = this.causeOfDeath === 'fuel_empty' ? '#FFC107' : '#FF7043';
      const bw = 180, bh = 22, bx = CX - bw / 2, by = 62;
      ctx.fillStyle = badgeColor;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
      ctx.fillStyle = textColor;
      ctx.font = 'bold 11px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(codLabel, CX, by + bh / 2);
    }

    // Divider
    ctx.strokeStyle = 'rgba(255,82,82,0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, 90); ctx.lineTo(CANVAS_WIDTH - 16, 90); ctx.stroke();

    // --- Stats cards ---
    const meters = (this.finalDistance / 100).toFixed(0);
    const stats = [
      { label: 'SCORE', value: this.finalScore.toLocaleString(), highlight: this.isNewBest },
      { label: 'DISTÂNCIA', value: `${meters}m`, highlight: false },
      { label: 'TEMPO', value: `${this.finalTime.toFixed(1)}s`, highlight: false },
    ];
    const cardW = 112, cardH = 58, cardGap = 8;
    const cardsTotal = stats.length * cardW + (stats.length - 1) * cardGap;
    const cardsX = (CANVAS_WIDTH - cardsTotal) / 2;
    const cardsY = 97;

    stats.forEach((s, i) => {
      const cx = cardsX + i * (cardW + cardGap);
      ctx.fillStyle = s.highlight ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.roundRect(cx, cardsY, cardW, cardH, 8); ctx.fill();
      ctx.strokeStyle = s.highlight ? 'rgba(255,215,0,0.35)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(cx, cardsY, cardW, cardH, 8); ctx.stroke();
      // Label
      ctx.fillStyle = s.highlight ? 'rgba(255,215,0,0.7)' : 'rgba(255,255,255,0.45)';
      ctx.font = '9px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(s.label, cx + cardW / 2, cardsY + 7);
      // Value
      ctx.fillStyle = s.highlight ? '#FFD700' : '#FFFFFF';
      ctx.font = `bold ${s.value.length > 7 ? '14px' : '16px'} monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(s.value, cx + cardW / 2, cardsY + cardH / 2 + 6);
    });

    // NEW BEST or best score reference
    if (this.isNewBest) {
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 13px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('★  NOVO RECORDE PESSOAL!  ★', CX, cardsY + cardH + 14);
      ctx.restore();
    } else if (this.bestScore > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '11px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Recorde: ${this.bestScore.toLocaleString()}`, CX, cardsY + cardH + 14);
    }

    // --- Near miss stats section (US-010) ---
    if (this.finalNearMissCount > 0) {
      const nmY = cardsY + cardH + 32;
      const isGold = this.finalBestCombo >= 3;
      ctx.fillStyle = isGold ? '#FFD700' : 'rgba(255,255,255,0.55)';
      ctx.font = 'bold 11px monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      const niceLabel = isGold ? '  NICE!' : '';
      ctx.fillText(
        `Near Misses: ${this.finalNearMissCount}  |  Best Combo: x${this.finalBestCombo}  |  Bonus: +${this.finalNearMissBonusTotal}${niceLabel}`,
        CX, nmY
      );
    }

    // --- Ranking section (DOM-based, rendered above canvas) ---
    // Show loading/error state on canvas while DOM container handles loaded data
    if (this.rankingStatus === 'loading') {
      const dots = '.'.repeat(Math.floor(this.rankingDotTime * 2) % 4);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`Carregando ranking${dots}`, CX, 290);
    } else if (this.rankingStatus === 'error') {
      ctx.fillStyle = '#E53935';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('Erro ao carregar ranking', CX, 290);
    }

    // --- Pulsing retry hint ---
    const pulse = 0.45 + 0.45 * Math.sin(this.pulseTime * 2.6);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const retryLabel = ('ontouchstart' in window) ? 'Toque para tentar novamente' : 'ENTER para tentar novamente';
    ctx.fillText(retryLabel, CX, CANVAS_HEIGHT - 6);
    ctx.globalAlpha = 1;
  },
};

// --- Title Ranking State ---
const titleRankingState = {
  rankingData: [],
  rankingStatus: 'idle',
  rankingScroll: 0,
  rankingDotTime: 0,
  errorMessage: '',

  onEnter () {
    // Hide ranking button and feedback button, show back button
    rankingBtnEl.style.display = 'none';
    feedbackBtnEl.style.display = 'none';
    rankingBackBtnEl.style.display = 'block';
    positionRankingBackBtn();
    // Always reset to fresh loading state — never show stale data
    this.rankingData = [];
    this.rankingStatus = 'loading';
    this.rankingScroll = 0;
    this.rankingDotTime = 0;
    this.errorMessage = '';
    // Abort any pending fetch
    if (titleRankingAbortController) {
      titleRankingAbortController.abort();
    }
    titleRankingAbortController = new AbortController();
    const signal = titleRankingAbortController.signal;
    // 10-second timeout
    const timeoutId = setTimeout(() => {
      if (titleRankingAbortController) titleRankingAbortController.abort();
    }, 10000);
    fetch(SCORE_WEBHOOK_URL, { signal })
      .then((res) => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const entries = Array.isArray(data) ? data : [];
        this.rankingData = entries
          .filter((e) => e && typeof e.name === 'string' && typeof e.score === 'number')
          .sort((a, b) => b.score - a.score)
          .slice(0, 50);
        this.rankingStatus = 'loaded';
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          // Only set error if we're still in this state (not navigated away)
          if (fsm.currentState === titleRankingState) {
            this.rankingStatus = 'error';
            this.errorMessage = 'Timeout — tente novamente';
          }
        } else {
          this.rankingStatus = 'error';
          this.errorMessage = 'Erro ao carregar ranking';
        }
      });
  },

  onExit () {
    rankingBackBtnEl.style.display = 'none';
  },

  update (dt) {
    this.rankingDotTime += dt;
    if (consumeKey('Escape')) {
      fsm.transition(titleState);
      return;
    }
    if (this.rankingStatus === 'loaded' && this.rankingData.length > 10) {
      const maxScroll = this.rankingData.length - 10;
      if (consumeKey('ArrowDown')) this.rankingScroll = Math.min(this.rankingScroll + 1, maxScroll);
      if (consumeKey('ArrowUp')) this.rankingScroll = Math.max(this.rankingScroll - 1, 0);
    }
  },

  render (ctx) {
    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bg.addColorStop(0, '#0D0D1A');
    bg.addColorStop(1, '#1A1A2E');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }

    // Header background bar
    ctx.fillStyle = 'rgba(255,215,0,0.08)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 75);

    // Title
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏆  RANKING GLOBAL', CANVAS_WIDTH / 2, 38);

    // Divider under header
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, 75); ctx.lineTo(CANVAS_WIDTH - 16, 75); ctx.stroke();

    // Column labels
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('JOGADOR', 40, 80);
    ctx.textAlign = 'right';
    ctx.fillText('SCORE', CANVAS_WIDTH - 40, 80);
    ctx.fillText('DIST', CANVAS_WIDTH - 8, 80);

    // Ranking content
    const PANEL_OPTS = { startY: 98, rowH: 47, visible: 10, fontSize: '13px', cards: true };
    if (this.rankingStatus === 'error') {
      ctx.fillStyle = '#E53935';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.errorMessage || 'Erro ao carregar ranking', CANVAS_WIDTH / 2, 400);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '11px monospace';
      ctx.fillText('ESC ou VOLTAR para tentar novamente', CANVAS_WIDTH / 2, 420);
    } else {
      renderRankingPanel(ctx, this.rankingData, this.rankingStatus, this.rankingScroll, this.rankingDotTime, localStorage.getItem('roadRushPlayerName') || '', PANEL_OPTS);
    }

    // Hint at bottom
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ESC ou VOLTAR para sair', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 8);
  },
};

// --- Start with Title state ---
fsm.transition(titleState);

// --- Game loop with fixed timestep accumulator ---
let accumulator = 0;
let lastTime = 0;

function gameLoop (timestamp) {
  if (lastTime === 0) {
    lastTime = timestamp;
  }

  const frameTime = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  accumulator += frameTime;

  // M key mute toggle (all states)
  if (consumeKey('m') || consumeKey('M')) {
    AudioManager.toggleMute();
  }

  // Pause toggle: P or Escape during playingState (US-003)
  // P is also a debug shortcut (score=24500) but only when debugMode is on,
  // so we only use P for pause when NOT in debugMode
  if (fsm.currentState === playingState) {
    const pPressed = consumeKey('p') || consumeKey('P');
    const escPressed = consumeKey('Escape');
    if (escPressed || (pPressed && !debugMode)) {
      togglePause();
    } else if (pPressed && debugMode && !gamePaused) {
      // Re-inject the P press so playingState.update() debug shortcut can consume it
      justPressed['P'] = true;
    }
  }

  // Skip updates when paused — timers frozen, game world frozen
  if (!gamePaused) {
    while (accumulator >= FIXED_DT) {
      if (shake.time > 0) shake.time = Math.max(0, shake.time - FIXED_DT);
      if (hitStopFrames > 0) {
        hitStopFrames--;
      } else {
        fsm.update(FIXED_DT);
      }
      accumulator -= FIXED_DT;
    }
  } else {
    // Drain accumulator so we don't get a burst of updates on resume
    accumulator = 0;
  }

  ctx.save();
  if (shake.time > 0) {
    const progress = shake.maxTime > 0 ? shake.time / shake.maxTime : 0;
    const amount = shake.intensity * progress * progress; // quadratic (exponential-ish) decay
    ctx.translate(
      (Math.random() * 2 - 1) * amount,
      (Math.random() * 2 - 1) * amount
    );
  }
  fsm.render(ctx);
  ctx.restore();
  // Mute icon rendered outside shake transform, visible in all states
  renderMuteIcon(ctx);
  // Pause button + overlay rendered on top of everything (US-003)
  renderPauseButton(ctx);
  renderPauseOverlay(ctx);
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
