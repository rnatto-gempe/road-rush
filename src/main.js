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

// Near miss / combo constants
const NEAR_MISS_DIST = 20;           // px sprite-edge to sprite-edge threshold
const NEAR_MISS_BASE_POINTS = 50;    // base points per near miss (× combo multiplier)
const NEAR_MISS_FLASH_DURATION = 0.3; // seconds for vehicle side flash
const COMBO_RESET_TIME = 3.0;        // seconds without near miss before combo resets
const COMBO_SCALE_DURATION = 0.2;    // scale-in animation duration

// Coin constants
const COIN_RADIUS = 8;                 // 16px diameter
const COIN_POINTS = 100;               // points per coin collected
const COIN_SPAWN_MIN = 600;            // px traveled min between cluster spawns
const COIN_SPAWN_MAX = 1000;           // px traveled max between cluster spawns
const COIN_COLLECT_ANIM_DURATION = 0.2;
const COIN_FLOAT_DURATION = 0.8;       // float '+100' text duration

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

// Speed lines: drawn in rumble-strip margins when scrollSpeed > 500
const SPEED_LINE_PERIOD = CANVAS_HEIGHT + 80; // vertical wrap period
const speedLineData = (() => {
  const data = [];
  for (let i = 0; i < 8; i++) {
    // Left margin (x: 3–37), right margin (x: 363–397), random y phase
    data.push({ x: 3 + Math.random() * 34,               yPhase: Math.random() * SPEED_LINE_PERIOD });
    data.push({ x: ROAD_RIGHT + 3 + Math.random() * 34,  yPhase: Math.random() * SPEED_LINE_PERIOD });
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

// ─── Audio Manager (Web Audio API) ───
const AudioManager = {
  ctx: null,
  masterGain: null,
  muted: false,

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  toggleMute() {
    if (!this.ctx) return;
    this.muted = !this.muted;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.01);
  },

  // Play a tone with gain envelope to avoid clicks
  playTone(freq, duration, type, gainValue) {
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

  startEngine() {
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

  stopEngine() {
    if (!this.engine.osc) return;
    const now = this.ctx.currentTime;
    this.engine.gain.gain.setTargetAtTime(0, now, 0.05);
    const osc = this.engine.osc;
    const filter = this.engine.filter;
    const gain = this.engine.gain;
    // Stop after fade-out completes (~0.25s)
    setTimeout(() => {
      try { osc.stop(); } catch (_) {}
      osc.disconnect(); filter.disconnect(); gain.disconnect();
    }, 250);
    this.engine = { osc: null, filter: null, gain: null };
  },

  // Update engine pitch/volume based on scroll speed (call every frame)
  updateEngine(scrollSpeed) {
    if (!this.engine.osc) return;
    const now = this.ctx.currentTime;
    // Map scrollSpeed 200→800 to frequency 60→180Hz
    const t = Math.max(0, Math.min(1, (scrollSpeed - 200) / 600));
    let freq = 60 + t * 120;
    // Nitro boost: raise pitch by ~30%
    if (this.nitro.active) freq *= 1.3;
    this.engine.osc.frequency.setTargetAtTime(freq, now, 0.05);
    // Filter cutoff maps 400→800Hz
    this.engine.filter.frequency.setTargetAtTime(400 + t * 400, now, 0.05);
    // Volume ramps 0.08→0.20 with speed
    const vol = 0.08 + t * 0.12;
    this.engine.gain.gain.setTargetAtTime(vol, now, 0.05);
  },

  // ─── Road ambience (long-lived looping noise) ───
  startRoad() {
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

  stopRoad() {
    if (!this.road.source) return;
    const now = this.ctx.currentTime;
    this.road.gain.gain.setTargetAtTime(0, now, 0.05);
    const source = this.road.source;
    const filter = this.road.filter;
    const gain = this.road.gain;
    setTimeout(() => {
      try { source.stop(); } catch (_) {}
      source.disconnect(); filter.disconnect(); gain.disconnect();
    }, 250);
    this.road.source = null;
    this.road.filter = null;
    this.road.gain = null;
  },

  updateRoad(scrollSpeed) {
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
  startNitro() {
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

  stopNitro() {
    if (!this.nitro.active) return;
    const now = this.ctx.currentTime;
    if (this.nitro.gain) {
      this.nitro.gain.gain.setTargetAtTime(0, now, 0.05);
    }
    const osc = this.nitro.osc;
    const gain = this.nitro.gain;
    setTimeout(() => {
      try { if (osc) osc.stop(); } catch (_) {}
      if (osc) osc.disconnect();
      if (gain) gain.disconnect();
    }, 250);
    this.nitro.osc = null;
    this.nitro.gain = null;
    this.nitro.active = false;
  },

  updateNitro() {
    if (!this.nitro.active || !this.nitro.osc || !this.engine.osc) return;
    const now = this.ctx.currentTime;
    // Keep nitro harmonic tracking ~2x the boosted engine freq
    const engineFreq = this.engine.osc.frequency.value;
    this.nitro.osc.frequency.setTargetAtTime(engineFreq * 2, now, 0.05);
  },

  // Create filtered noise burst
  createNoise(duration, filterFreq, filterType) {
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

  // ─── Collision & Explosion SFX ───

  // Metallic crash: short noise burst (high-pass ~2kHz) + low-freq impact thump (sine ~60Hz)
  playCrash() {
    if (!this.ctx) return;
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
  playExplosion() {
    if (!this.ctx) return;
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
  playShieldBreak() {
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
  playFuelPickup() {
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
  playCoinPickup() {
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
  playNitroPickup() {
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
  playShieldPickup() {
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

  // ─── Near Miss, Combo, and Bonus SFX ───

  // Near miss: short chromatic grace note — one semitone below tonic A4 (G#4 = 415.3Hz), 0.05s
  playNearMiss() {
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
  playComboUp(combo) {
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

  // Survivor bonus: triumphant short major chord (400/500/600Hz sines, 0.3s)
  playSurvivorBonus() {
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
  playOvertake() {
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
  updateCoinSeq(dt) {
    if (this.coinSeq.count > 0) {
      this.coinSeq.resetTimer -= dt;
      if (this.coinSeq.resetTimer <= 0) {
        this.coinSeq.count = 0;
      }
    }
  },

  // --- Title screen ambient drone ---
  titleDrone: { osc: null, lfo: null, lfoGain: null, noiseSource: null, noiseGain: null, gain: null },

  startTitleDrone() {
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

  stopTitleDrone() {
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
    if (d.osc) { try { d.osc.stop(stopTime); } catch(e) {} d.osc.onended = () => { d.osc.disconnect(); d.gain.disconnect(); }; }
    if (d.lfo) { try { d.lfo.stop(stopTime); } catch(e) {} d.lfo.onended = () => { d.lfo.disconnect(); d.lfoGain.disconnect(); }; }
    if (d.noiseSource) { try { d.noiseSource.stop(stopTime); } catch(e) {} d.noiseSource.onended = () => { d.noiseSource.disconnect(); d.noiseGain.disconnect(); }; }

    this.titleDrone = { osc: null, lfo: null, lfoGain: null, noiseSource: null, noiseGain: null, gain: null };
  },

  // ─── Rhythmic beat scheduler ───
  beat: { running: false, nextBeatTime: 0, beatIndex: 0, scheduledUpTo: 0 },

  startBeat() {
    if (!this.ctx) return;
    this.beat.running = true;
    this.beat.nextBeatTime = this.ctx.currentTime + 0.1; // slight delay to sync
    this.beat.beatIndex = 0;
    this.beat.scheduledUpTo = this.beat.nextBeatTime;
  },

  stopBeat() {
    this.beat.running = false;
    this.beat.beatIndex = 0;
    this.beat.scheduledUpTo = 0;
  },

  // Schedule individual beat sounds at precise times
  _scheduleKick(time) {
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

  _scheduleHiHat(time) {
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

  _scheduleSubBass(time) {
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
  updateBeat(scrollSpeed) {
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
  playFuelBeep() {
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
  updateFuelWarning(dt, fuelPct) {
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

  startExplosionRumble() {
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

  stopExplosionRumble() {
    const r = this.explosionRumble;
    if (!r.source) return;
    const now = this.ctx.currentTime;
    r.gain.gain.cancelScheduledValues(now);
    r.gain.gain.setTargetAtTime(0, now, 0.1); // ~0.3s fade
    const { source, filter, gain } = r;
    setTimeout(() => {
      try { source.stop(); } catch (_) {}
      source.disconnect(); filter.disconnect(); gain.disconnect();
    }, 400);
    this.explosionRumble = { source: null, filter: null, gain: null };
  },

  // ─── Title→Playing riser (1s white noise ascending sweep + crescendo) ───
  playRiser() {
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
  playTapeStop() {
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
          for (const osc of grp.oscs) { try { osc.stop(); } catch (_) {} osc.disconnect(); }
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
  playDrumRoll() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const interval = 0.075; // 4 kicks → 0.3s total
    for (let i = 0; i < 4; i++) {
      this._scheduleKick(now + i * interval);
    }
  },

  // ─── Game over somber drone (two detuned low sines + filtered noise tail) ───
  gameOverDrone: { osc1: null, osc2: null, oscGain: null, noiseSource: null, noiseGain: null, dimOsc1: null, dimOsc2: null, dimOsc3: null, dimGain: null },

  startGameOverDrone() {
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

  stopGameOverDrone() {
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
      try { osc1.stop(); } catch (_) {}
      try { osc2.stop(); } catch (_) {}
      try { if (noiseSource) noiseSource.stop(); } catch (_) {}
      osc1.disconnect(); osc2.disconnect(); oscGain.disconnect();
      if (noiseSource) noiseSource.disconnect();
      if (noiseGain) noiseGain.disconnect();
      if (dimOscs) { for (const o of dimOscs) { try { o.stop(); } catch (_) {} o.disconnect(); } }
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

  startPad() {
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

  stopPad() {
    if (!this.pad.active) return;
    const now = this.ctx.currentTime;
    this.pad.gain.gain.cancelScheduledValues(now);
    this.pad.gain.gain.setTargetAtTime(0, now, 0.1); // fade out ~0.3s

    const { noteGroups, filter, gain } = this.pad;
    setTimeout(() => {
      for (const grp of noteGroups) {
        for (const osc of grp.oscs) {
          try { osc.stop(); } catch (_) {}
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

  updatePad(scrollSpeed) {
    if (!this.pad.active || !this.pad.gain) return;
    const now = this.ctx.currentTime;
    const t = Math.max(0, Math.min(1, (scrollSpeed - 200) / 600));
    // Filter cutoff 400→1200Hz with speed
    this.pad.filter.frequency.setTargetAtTime(400 + t * 800, now, 0.1);
    // Volume 0.12→0.20 with speed
    this.pad.gain.gain.setTargetAtTime(0.12 + t * 0.08, now, 0.1);
  },

  // Call from updateBeat — advances chord when beat index crosses a 4-beat bar boundary
  updatePadChord(beatIndex) {
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

  startBass() {
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

  stopBass() {
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
  _scheduleBassNote(time, freq, vel) {
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
  _scheduleBassBeat(beatTime, beatInterval, chordIdx) {
    const root = this.BASS_ROOTS[chordIdx];
    this._scheduleBassNote(beatTime,                          root, 1.0);  // beat 1: full
    this._scheduleBassNote(beatTime + 1.5 * beatInterval,    root, 0.5);  // beat 2.5: ghost
    this._scheduleBassNote(beatTime + 2.5 * beatInterval,    root, 0.5);  // beat 3.5: ghost
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

  startArp() {
    if (!this.ctx) return;
    this.arp.running = true;
    // Sync start time with beat scheduler (or now + small offset)
    this.arp.scheduledUpTo = this.beat.scheduledUpTo > 0
      ? this.beat.scheduledUpTo
      : this.ctx.currentTime + 0.1;
    this.arp.noteIndex = 0;
  },

  stopArp() {
    this.arp.running = false;
    this.arp.scheduledUpTo = 0;
    this.arp.noteIndex = 0;
  },

  // Schedule a single arpeggio note: square wave + bandpass filter
  _scheduleArpNote(time, freq, duration) {
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
  updateArp(scrollSpeed) {
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
const particles = [];             // spark particles
let playerVisible = true;         // set to false during explosion sequence

// Post-collision spawn pause (US-014)
let spawnPauseTimer = 0; // seconds remaining in spawn suppression window

// Near miss / combo state
let comboMultiplier = 1;  // 1 = base (no active combo), 2+ = active combo
let comboResetTimer = 0;  // seconds until combo resets to 1
let comboScaleTimer = 0;  // countdown for scale-in animation on new near miss

// DDA (Dynamic Difficulty Adjustment) state
let ddaCleanTimer = 0;   // seconds since last collision (resets on any hit)
let ddaSpawnRate = 1.0;  // traffic spawn rate multiplier; +5% per 10s clean, cap 1.5; halves on collision

// Coin float text state (populated on coin collection, rendered over game elements)
const coinFloatTexts = []; // {x, y, timer}

// Nitro state
let nitroTimer = 0;      // countdown during active boost (3s → 0)
let nitroEaseTimer = 0;  // countdown during ease-out (0.5s → 0)

// Shield state
let shieldBreakFlash = 0; // countdown for bright border flash after shield absorbs a hit

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

// --- Mute icon click detection ---
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;
  // Icon area: top-right corner, 32x32 region
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
const shake = { time: 0, maxTime: SHAKE_DURATION, intensity: SHAKE_INTENSITY };

function triggerShake(duration, intensity) {
  const dur = duration !== undefined ? duration : SHAKE_DURATION;
  const inten = intensity !== undefined ? intensity : SHAKE_INTENSITY;
  shake.time = dur;
  shake.maxTime = dur;
  shake.intensity = inten;
}

// Returns the nitro speed multiplier (1.0 normally, 1.3 during boost, eases back to 1.0)
function getNitroMultiplier() {
  if (nitroTimer > 0) return NITRO_BOOST_FACTOR;
  if (nitroEaseTimer > 0) {
    const progress = nitroEaseTimer / NITRO_EASE_DURATION; // 1→0 as ease progresses
    return 1.0 + (NITRO_BOOST_FACTOR - 1.0) * progress;
  }
  return 1.0;
}

// Returns scroll speed with active penalty and nitro boost applied
function getEffectiveScrollSpeed() {
  return gameState.scrollSpeed * speedPenaltyMultiplier * getNitroMultiplier();
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

function spawnExplosion(x, y) {} // deprecated — replaced by shockwave ring system

function renderShockwaveRings(ctx) {
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

// White speed lines in the 40px rumble-strip margins when scrollSpeed > 500
function renderSpeedLines(ctx) {
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

// Trigger a near miss event for vehicle v (called when min distance < threshold)
function triggerNearMiss(v) {
  const pts = NEAR_MISS_BASE_POINTS * comboMultiplier;
  gameState.score += pts;
  comboMultiplier += 1;
  comboResetTimer = COMBO_RESET_TIME;
  comboScaleTimer = COMBO_SCALE_DURATION;

  // Near miss whoosh + combo stinger
  AudioManager.playNearMiss();
  if (comboMultiplier >= 2) AudioManager.playComboUp(comboMultiplier);

  // White flash on the vehicle's side closest to the player
  const playerCenterX = gameState.player.x + PLAYER_WIDTH / 2;
  const vCenterX = v.x + v.width / 2;
  v.nearMissFlash = {
    side: playerCenterX < vCenterX ? 'left' : 'right',
    timer: NEAR_MISS_FLASH_DURATION,
  };
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

  const relativeVy = getEffectiveScrollSpeed() - v.ownSpeed; // approach speed on screen
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
  // Nitro items
  nitroItems: [],
  nextNitroSpawnDistance: NITRO_SPAWN_MIN,
  // Shield items
  shieldItems: [],
  nextShieldSpawnDistance: SHIELD_SPAWN_MIN,
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
  // Reset DDA fully on game over / retry
  ddaCleanTimer = 0;
  ddaSpawnRate = 1.0;
  // Reset coin state
  gameState.coins = [];
  gameState.nextCoinSpawnDistance = COIN_SPAWN_MIN + Math.random() * (COIN_SPAWN_MAX - COIN_SPAWN_MIN);
  coinFloatTexts.length = 0;
  // Reset nitro state
  gameState.nitroItems = [];
  gameState.nextNitroSpawnDistance = NITRO_SPAWN_MIN + Math.random() * (NITRO_SPAWN_MAX - NITRO_SPAWN_MIN);
  nitroTimer = 0;
  nitroEaseTimer = 0;
  // Reset shield state
  gameState.player.hasShield = false;
  gameState.shieldItems = [];
  gameState.nextShieldSpawnDistance = SHIELD_SPAWN_MIN + Math.random() * (SHIELD_SPAWN_MAX - SHIELD_SPAWN_MIN);
  shieldBreakFlash = 0;
  // Reset VFX
  explosions.length = 0;
  shockwaveRings.length = 0;
  playerVisible = true;
  explosionState.screenFlashAlpha = 0;
  explosionState.fadeInAlpha = 0;
  explosionState.textAlpha = 0;
  explosionState.timer = 0;
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
}

function renderPlayer(ctx, player) {
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
    collided: false,   // true if player hit this vehicle (tracks overtake bonus)
    minDistX: Infinity, // min sprite-edge-to-edge horizontal dist during vertical overlap
    nearMissChecked: false, // true once near miss check has been performed
    nearMissFlash: null,    // {side: 'left'|'right', timer} when flashing
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
    const visualSpeed = getEffectiveScrollSpeed() - v.ownSpeed;
    v.y += visualSpeed * dt;

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
        gameState.score += OVERTAKE_BONUS;
        AudioManager.playOvertake();
      }
      return false;
    }
    return true;
  });
}

function renderTraffic(ctx) {
  for (const v of gameState.traffic) {
    if (v.scattered) continue; // scattered vehicles rendered separately with rotation
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
  // DDA: when fuel > 70%, next fuel spawns 20% further (punishes excess fuel)
  const ddaFuelMul = gameState.fuel > 70 ? 1.2 : 1.0;
  gameState.nextFuelSpawnDistance = gameState.distanceTraveled + (intervalMin + Math.random() * (intervalMax - intervalMin)) * ddaFuelMul;
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
      AudioManager.playFuelPickup();
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

// --- Coin Collectibles ---

function spawnCoinCluster() {
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

function updateCoins(dt) {
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
      gameState.score += COIN_POINTS;
      coinFloatTexts.push({ x: coin.x, y: coin.y, timer: COIN_FLOAT_DURATION });
      AudioManager.playCoinPickup();
      coin.collectAnim = { timer: COIN_COLLECT_ANIM_DURATION };
    }
  }

  // Tick float texts
  for (let i = coinFloatTexts.length - 1; i >= 0; i--) {
    coinFloatTexts[i].y -= 60 * dt; // float upward at 60 px/s
    coinFloatTexts[i].timer -= dt;
    if (coinFloatTexts[i].timer <= 0) coinFloatTexts.splice(i, 1);
  }
}

function renderCoins(ctx) {
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

  // Floating '+100' text
  for (const ft of coinFloatTexts) {
    const alpha = ft.timer / COIN_FLOAT_DURATION;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+100', ft.x, ft.y);
  }
  ctx.globalAlpha = 1;
}

// --- Nitro Item ---

function spawnNitroItem() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const x = ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
  gameState.nitroItems.push({ x, y: -NITRO_ITEM_HALF * 2, collectAnim: null });
  gameState.nextNitroSpawnDistance =
    gameState.distanceTraveled + NITRO_SPAWN_MIN + Math.random() * (NITRO_SPAWN_MAX - NITRO_SPAWN_MIN);
}

function updateNitroItems(dt) {
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
    }
  }
}

function renderNitroItems(ctx) {
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

function spawnShieldItem() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const x = ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
  gameState.shieldItems.push({ x, y: -SHIELD_ITEM_RADIUS * 2, collectAnim: null });
  gameState.nextShieldSpawnDistance =
    gameState.distanceTraveled + SHIELD_SPAWN_MIN + Math.random() * (SHIELD_SPAWN_MAX - SHIELD_SPAWN_MIN);
}

function updateShieldItems(dt) {
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
    }
  }
}

// Draw a regular hexagon at (cx, cy) with bounding radius r
function drawHexagon(ctx, cx, cy, r) {
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

function renderShieldItems(ctx) {
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

// --- Mute Icon HUD ---
function renderMuteIcon(ctx) {
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

// --- Combo HUD ---
function renderComboHUD(ctx) {
  if (comboMultiplier < 2) return; // only show at x2+

  // Fade out in the last second before reset; full alpha for most of the window
  const fadeAlpha = Math.min(1, comboResetTimer);
  // Scale-in pop animation when a new near miss triggers
  const scaleProgress = comboScaleTimer > 0 ? comboScaleTimer / COMBO_SCALE_DURATION : 0;
  const scale = 1 + 0.35 * scaleProgress;

  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.translate(CANVAS_WIDTH / 2, 32);
  ctx.scale(scale, scale);
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(`x${comboMultiplier}`, 1, 1);
  // Gold text
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`x${comboMultiplier}`, 0, 0);
  ctx.restore();
}

// --- Title State ---
const titleState = {
  pulseTime: 0,

  onEnter() {
    this.pulseTime = 0;
    // Start drone if AudioContext already exists (return visits)
    if (AudioManager.ctx) {
      AudioManager.startTitleDrone();
    }
  },

  onExit() {
    AudioManager.stopTitleDrone();
  },

  update(dt) {
    this.pulseTime += dt;
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
    AudioManager.startEngine();
    AudioManager.startRoad();
    AudioManager.startBeat();
    AudioManager.startPad();
    AudioManager.startArp();
    AudioManager.startBass();
  },

  onExit() {
    AudioManager.stopNitro();
    AudioManager.stopBeat();
    AudioManager.stopArp();
    AudioManager.stopBass();
    AudioManager.stopEngine();
    AudioManager.stopRoad();
    AudioManager.stopPad();
  },

  update(dt) {
    gameState.elapsedTime += dt;
    updateScrollSpeed(dt);
    AudioManager.updateEngine(gameState.scrollSpeed);
    AudioManager.updateRoad(gameState.scrollSpeed);
    AudioManager.updateNitro();
    AudioManager.updateBeat(gameState.scrollSpeed);
    AudioManager.updatePad(gameState.scrollSpeed);
    AudioManager.updateArp(gameState.scrollSpeed);
    const effSpeed = getEffectiveScrollSpeed();
    gameState.scrollOffset += effSpeed * dt;
    gameState.distanceTraveled += effSpeed * dt;

    if (consumeKey('d') || consumeKey('D')) debugMode = !debugMode;

    updatePlayer(dt);
    updateTraffic(dt);
    updateFuelItems(dt);
    updateCoins(dt);
    updateNitroItems(dt);
    updateShieldItems(dt);
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
        });
      }
    }
    if (nitroEaseTimer > 0) nitroEaseTimer = Math.max(0, nitroEaseTimer - dt);

    // Tick shield break flash
    if (shieldBreakFlash > 0) shieldBreakFlash = Math.max(0, shieldBreakFlash - dt);

    // Distance score: 1 pt per 10 px traveled
    gameState.score += effSpeed * dt * SCORE_PER_PX;

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

    // Drain fuel proportional to effective speed
    const fuelDrain = (FUEL_DRAIN_BASE + (getEffectiveScrollSpeed() / SPEED_MAX) * FUEL_DRAIN_SPEED) * dt;
    gameState.fuel = Math.max(0, gameState.fuel - fuelDrain);
    if (gameState.fuel <= 0) {
      gameOverState.causeOfDeath = 'Fuel Empty';
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
      if (comboResetTimer === 0) comboMultiplier = 1;
    }
    // Tick combo scale animation
    if (comboScaleTimer > 0) comboScaleTimer = Math.max(0, comboScaleTimer - dt);

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
    renderSpeedLines(ctx);
    renderTraffic(ctx);
    renderFuelItems(ctx);
    renderCoins(ctx);
    renderNitroItems(ctx);
    renderShieldItems(ctx);
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

    // Combo counter (center-top, shown when combo >= 2)
    renderComboHUD(ctx);

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
  isNewBest: false,
  bestScore: 0,
  screenFlashAlpha: 0,
  fadeInAlpha: 0,
  textAlpha: 0,

  onEnter() {
    this.originX = gameState.player.x + PLAYER_WIDTH / 2;
    this.originY = gameState.player.y + PLAYER_HEIGHT / 2;
    this.timer = 2.0;
    this.screenFlashAlpha = 1.0;
    this.fadeInAlpha = 0;
    this.textAlpha = 0;
    playerVisible = false;
    AudioManager.playExplosion();
    AudioManager.startExplosionRumble();
    this.finalTime = gameState.elapsedTime;
    this.finalDistance = gameState.distanceTraveled;
    this.finalScore = Math.floor(gameState.score);
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

  onExit() {
    AudioManager.stopExplosionRumble();
  },

  update(dt) {
    this.timer -= dt;
    for (const ring of shockwaveRings) ring.elapsed += dt;
    updateParticles(dt);
    if (this.screenFlashAlpha > 0) {
      this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt / 0.2);
    }
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
      gameOverState.isNewBest = this.isNewBest;
      gameOverState.bestScore = this.bestScore;
      gameOverState.statsPreset = true;
      gameOverState.causeOfDeath = '';
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

  render(ctx) {
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

// --- GameOver State ---
const gameOverState = {
  pulseTime: 0,
  finalTime: 0,
  finalDistance: 0,
  finalScore: 0,
  bestScore: 0,
  isNewBest: false,
  causeOfDeath: '', // set by caller before transition; '' = collision
  statsPreset: false, // true when explosionState pre-sets final stats

  onEnter() {
    this.pulseTime = 0;
    if (!this.statsPreset) {
      // Fuel empty or other non-collision death: capture stats now
      this.finalTime = gameState.elapsedTime;
      this.finalDistance = gameState.distanceTraveled;
      this.finalScore = Math.floor(gameState.score);
      const stored = parseInt(localStorage.getItem('roadrush_best_score') || '0', 10);
      this.isNewBest = this.finalScore > stored;
      this.bestScore = this.isNewBest ? this.finalScore : stored;
      if (this.isNewBest) localStorage.setItem('roadrush_best_score', this.finalScore);
    }
    this.statsPreset = false;
    AudioManager.startGameOverDrone();
  },

  onExit() {
    AudioManager.stopGameOverDrone();
  },

  update(dt) {
    this.pulseTime += dt;
    if (consumeKey('Enter')) {
      AudioManager.playDrumRoll();
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

  // M key mute toggle (all states)
  if (consumeKey('m') || consumeKey('M')) {
    AudioManager.toggleMute();
  }

  while (accumulator >= FIXED_DT) {
    if (shake.time > 0) shake.time = Math.max(0, shake.time - FIXED_DT);
    fsm.update(FIXED_DT);
    accumulator -= FIXED_DT;
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
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
