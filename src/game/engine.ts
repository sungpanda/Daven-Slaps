import { soundEngine } from './audio';
import {
  BUOY_QUIPS,
  DAVIN_RAGE_QUIPS,
  DAVIN_SNORE_QUIPS,
  DIFFICULTIES,
  DUCK_QUIPS,
  LEVELS_VICTORY_METERS,
  LEVEL_2_START_METERS,
  LEVEL_2_START_Z,
  LEVEL_START_METERS,
  LOG_QUIPS,
  MAX_JUMP_HOLD_SEC,
  MAX_LEVEL,
  METERS_PER_WORLD_Z,
  SINK_QUIPS_HIGH,
  SINK_QUIPS_LOW,
  SINK_QUIPS_MID,
  SINK_QUIPS_ZERO,
  STONE_PROFILES,
  THROW_MAX_VZ,
  THROW_MIN_VZ,
  WRECK_QUIPS,
} from './constants';
import type {
  BeachCrab,
  DifficultyId,
  GameMode,
  GameWorld,
  Hazard,
  HazardKind,
  InputSnapshot,
  PowerupKind,
  StoneKind,
} from './types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getWaterHeight(world: GameWorld, x: number, z: number): number {
  const cfg = DIFFICULTIES[world.difficulty];
  if (cfg.waveAmplitude <= 0.01) return 0;
  const waveA = Math.sin(z * cfg.waveFrequency - world.time * 3.1);
  const waveB = Math.cos(x * 0.14 + z * (cfg.waveFrequency * 0.65) + world.time * 2.1);
  return (waveA * 0.65 + waveB * 0.35) * cfg.waveAmplitude;
}

export function getLevelFromMeters(meters: number, mode: GameMode): number {
  if (meters < LEVEL_START_METERS[2]) return 1;
  if (meters < LEVEL_START_METERS[3]) return 2;
  if (meters < LEVEL_START_METERS[4]) return 3;
  if (meters < LEVEL_START_METERS[5]) return 4;
  if (mode === 'LEVELS' || meters < LEVELS_VICTORY_METERS) return 5;
  return 6 + Math.floor((meters - LEVELS_VICTORY_METERS) / 400);
}

export function getEffectiveMeters(world: GameWorld): number {
  const runMeters = Math.max(0, world.stone.z * METERS_PER_WORLD_Z);
  if (world.mode === 'LEVELS' && world.startLevel > 1) {
    return (LEVEL_START_METERS[world.startLevel] ?? 0) + runMeters;
  }
  return runMeters;
}

export function getLevelSpeedMultiplier(level: number): number {
  if (level <= 1) return 0.36;
  if (level === 2) return 0.56;
  if (level === 3) return 0.72;
  if (level === 4) return 0.88;
  if (level === 5) return 1.04;
  return Math.min(1.5, 1.04 + (level - 5) * 0.12);
}

export function getEffectiveGravity(world: GameWorld): number {
  const cfg = DIFFICULTIES[world.difficulty];
  const meters = getEffectiveMeters(world);
  if (meters < LEVEL_2_START_METERS) {
    // Slow, floaty Level 1 gravity (0m..500m) so each bounce stays airborne >= 1s
    return cfg.gravity * (0.62 + (meters / LEVEL_2_START_METERS) * 0.08);
  }
  // Level 2+ (after 500m): tougher gravity that ramps smoothly through Levels 2–5 and Endless
  const extraMeters = meters - LEVEL_2_START_METERS;
  const multiplier = Math.min(1.95, 1.22 + (extraMeters / 300) * 0.16);
  return cfg.gravity * multiplier;
}

function spawnHazards(
  difficulty: DifficultyId,
  startId: number,
  mode: GameMode,
  startLevel: number
): { hazards: Hazard[]; nextId: number } {
  const cfg = DIFFICULTIES[difficulty];
  const hazards: Hazard[] = [];
  let nextId = startId;

  // Davin's Slumber rage bait level spawns bouncy snore bubbles
  if (difficulty === 'DAVIN_SLUMBER') {
    const bubbleCount = 38;
    for (let i = 0; i < bubbleCount; i++) {
      const z = 35 + i * 16 + Math.random() * 10;
      const x = (Math.random() - 0.5) * 86;
      const vx = (Math.random() > 0.5 ? 1 : -1) * (7 + Math.random() * 9);
      hazards.push({
        id: nextId++,
        kind: 'SNORE_BUBBLE',
        x,
        z,
        vx,
        width: 10,
        hitCooldown: 0,
        angryTimer: 0,
      });
    }
    return { hazards, nextId };
  }

  const startOffsetZ =
    mode === 'LEVELS' && startLevel > 1
      ? (LEVEL_START_METERS[startLevel] ?? 0) / METERS_PER_WORLD_Z
      : 0;
  const level1StartZ = Math.max(65, (LEVEL_START_METERS[startLevel] ?? 0) / METERS_PER_WORLD_Z - startOffsetZ);
  const level1EndZ = LEVEL_2_START_Z - 30;
  const count = Math.round(45 * cfg.hazardDensity);
  for (let i = 0; i < count && startLevel === 1; i++) {
    const z = level1StartZ + i * (82 / Math.max(0.65, cfg.hazardDensity)) + Math.random() * 28;
    if (z >= level1EndZ) break;
    const roll = Math.random();
    let kind: HazardKind = 'DUCK';
    if (roll > 0.66) kind = 'BUOY';
    else if (roll > 0.35) kind = 'LOG';

    const width = kind === 'LOG' ? 16 : kind === 'BUOY' ? 10 : 9;
    const x = (Math.random() - 0.5) * 95;
    const vx = kind === 'DUCK' ? (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 7) : 0;

    hazards.push({
      id: nextId++,
      kind,
      x,
      z,
      vx,
      width,
      hitCooldown: 0,
      angryTimer: 0,
    });
  }

  // Level 2 has a longer, more demanding run with spaced floating hazards.
  const level2EndZ = LEVEL_START_METERS[3] / METERS_PER_WORLD_Z - startOffsetZ;
  const level2StartZ = Math.max(35, LEVEL_2_START_Z - startOffsetZ + 35);
  const level2Spacing = 86 / Math.max(0.75, cfg.hazardDensity);
  const wreckCount = Math.ceil((level2EndZ - level2StartZ) / level2Spacing);
  for (let i = 0; i < wreckCount && startLevel <= 2; i++) {
    const z = level2StartZ + i * level2Spacing + Math.random() * 18;
    if (z >= level2EndZ) break;
    const x = (Math.random() - 0.5) * 85;
    const vx = (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 6);
    const roll = Math.random();
    const kind: HazardKind =
      roll < 0.28 ? 'DUCK' : roll < 0.56 ? 'LOG' : 'WRECKAGE';
    hazards.push({
      id: nextId++,
      kind,
      x,
      z,
      vx: kind === 'DUCK' ? (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 7) : vx,
      width: kind === 'LOG' ? 16 : kind === 'WRECKAGE' ? 14 : 9,
      hitCooldown: 0,
      angryTimer: 0,
    });
  }

  return { hazards, nextId };
}

function spawnEndlessSegment(world: GameWorld, fromZ: number, toZ: number) {
  const cfg = DIFFICULTIES[world.difficulty];
  let z = fromZ;

  while (z < toZ) {
    const step = 76 + Math.random() * 44;
    z += step;

    // Powerups: Springs, Power Buoys, and Bamboo floats
    const pRoll = Math.random();
    let pKind: PowerupKind = 'SPRING';
    if (pRoll > 0.66) pKind = 'BAMBOO';
    else if (pRoll > 0.34) pKind = 'POWER_BUOY';

    const px = (Math.random() - 0.5) * 116;
    world.powerups.push({
      id: world.nextId++,
      kind: pKind,
      x: px,
      z,
      bobPhase: Math.random() * Math.PI * 2,
      collected: false,
    });

    // Optional spaced hazard past the opening stretch, kept clear of powerups
    if (z > 130 && Math.random() < 0.42 + cfg.hazardDensity * 0.28) {
      const hz = z + 34 + Math.random() * 14;
      if (hz < toZ + 12) {
        const hRoll = Math.random();
        const kind: HazardKind = hRoll > 0.55 ? 'LOG' : 'DUCK';
        const hx = px > 0 ? -15 - Math.random() * 55 : 15 + Math.random() * 55;
        world.hazards.push({
          id: world.nextId++,
          kind,
          x: hx,
          z: hz,
          vx: kind === 'DUCK' ? (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 8) : 0,
          width: kind === 'LOG' ? 16 : 9,
          hitCooldown: 0,
          angryTimer: 0,
        });
      }
      z += 16;
    }
  }

  world.nextSpawnZ = z;
}

function spawnBeachCrabs(startId: number): { crabs: BeachCrab[]; nextId: number } {
  const crabColors = ['#ef4444', '#f97316', '#fb7185', '#ea580c'];
  const crabs: BeachCrab[] = [];
  let nextId = startId;

  const placements = [
    { x: -72, z: -12 },
    { x: -34, z: -22 },
    { x: -8, z: -8 },
    { x: 22, z: -25 },
    { x: 64, z: -10 },
    { x: 78, z: -21 },
  ];

  for (let i = 0; i < placements.length; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    crabs.push({
      id: nextId++,
      x: placements[i].x,
      z: placements[i].z,
      vx: dir * (11 + Math.random() * 8),
      pauseTimer: Math.random() * 0.8,
      moveTimer: 0.9 + Math.random() * 1.4,
      color: crabColors[i % crabColors.length],
      phaseOffset: Math.random() * 10,
    });
  }

  return { crabs, nextId };
}

export function createInitialWorld(
  difficulty: DifficultyId = 'CALM_CREEK',
  stoneKind: StoneKind = 'FLAT_SLATE',
  mode: GameMode = 'LEVELS',
  startLevel = 1,
  targetMeters = mode === 'LEVELS' ? 500 + Math.floor(Math.random() * 501) : 0
): GameWorld {
  const safeStartLevel = mode === 'LEVELS' ? Math.max(1, Math.min(MAX_LEVEL, startLevel)) : 1;
  const cfg = DIFFICULTIES[difficulty];
  const initialWind = (Math.random() - 0.5) * 2 * cfg.windStrength;
  const { hazards, nextId: idAfterHazards } = spawnHazards(difficulty, 1, mode, safeStartLevel);
  const { crabs, nextId } = spawnBeachCrabs(idAfterHazards);

  const world: GameWorld = {
    mode,
    targetMeters,
    startLevel: safeStartLevel,
    phase: 'READY',
    difficulty,
    stoneKind,
    time: 0,
    charge: 0,
    chargeDir: 1,
    overholdTimer: 0,
    wind: initialWind,
    windTarget: initialWind,
    stone: {
      x: 0,
      y: 12,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      rotation: 0,
      flinchTimer: 0,
      mashCooldown: 0,
      skipGraceTimer: 0,
      skipBufferTimer: 0,
      inSkipWindow: false,
      inPerfectWindow: false,
      tti: 99,
      isHoldingJump: false,
      jumpHoldTimer: 0,
      alive: false,
    },
    player: {
      pose: 'IDLE',
      poseTimer: 0,
      aimAngle: 0,
    },
    playerX: 0,
    demoCycleTimer: 0,
    crabs,
    birds: [],
    birdSpawnTimer: 5,
    davin: {
      active: difficulty === 'DAVIN_SLUMBER',
      x: 0,
      z: -24,
      vx: 4,
      breathPhase: 0,
      snoreTimer: 2.2,
      isSnoring: false,
      snoreWaveRadius: 0,
      snoreWaveAlpha: 0,
      sleepZzzTimer: 0,
      pabbleEaten: false,
      throwTimer: 0,
      snoreCycleCount: 0,
      lastQuip: 'Zzz... pabble detected...',
    },
    ripples: [],
    particles: [],
    floatingTexts: [],
    hazards,
    powerups: [],
    shieldCharges: 0,
    springBoostTimer: 0,
    nextSpawnZ: 60,
    nextBambooMilestoneMeters: 100,
    nextId,
    sinkTimer: 0,
    cameraZ: -26,
    cameraShake: 0,
    cameraZoomOffset: 0,
    flashAlpha: 0,
    stats: {
      mode,
      level: safeStartLevel,
      clearedLevels: false,
      skips: 0,
      perfectSkips: 0,
      distanceMeters: 0,
      peakSpeed: 0,
      mashFlinches: 0,
      ducksBonked: 0,
      powerupsHit: 0,
      bamboosEarned: 0,
      bamboosFromDistance: 0,
      bamboosFromPickups: 0,
      bamboosFromClear: 0,
      causeOfSink: '',
      quip: '',
    },
    lastEventText:
      mode === 'ENDLESS'
        ? 'Endless Mode: hit Springs & Buoys for boosts and earn Bamboos!'
        : `Level ${safeStartLevel} ready — hold SPACE longer for a farther throw!`,
  };

  if (mode === 'ENDLESS') {
    spawnEndlessSegment(world, 65, 420);
  }

  return world;
}

function addFloatingText(
  world: GameWorld,
  text: string,
  x: number,
  y: number,
  z: number,
  color: string,
  maxAge = 0.85
) {
  world.floatingTexts.push({
    id: world.nextId++,
    text,
    x,
    y,
    z,
    age: 0,
    maxAge,
    color,
  });
}

function spawnSplashParticles(
  world: GameWorld,
  x: number,
  y: number,
  z: number,
  count: number,
  power: number,
  colors: string[]
) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radial = (0.3 + Math.random() * 0.9) * power;
    world.particles.push({
      x,
      y: Math.max(0.2, y),
      z,
      vx: Math.cos(angle) * radial * 0.65,
      vy: (0.7 + Math.random() * 1.1) * power,
      vz: Math.sin(angle) * radial * 0.45,
      age: 0,
      maxAge: 0.35 + Math.random() * 0.35,
      color: colors[i % colors.length],
      size: Math.random() > 0.5 ? 2 : 1,
    });
  }
}

function triggerVictory(world: GameWorld) {
  if (world.phase === 'SINKING') return;
  const cfg = DIFFICULTIES[world.difficulty];
  const clearBonus = cfg.bamboosPer100m * 3;
  world.stats.clearedLevels = true;
  world.stats.bamboosFromClear = clearBonus;
  world.stats.bamboosEarned += clearBonus;
  world.stats.causeOfSink = 'TARGET REACHED!';
  world.stats.quip = 'Master of the water! Try Endless Mode or unlock the next map.';
  world.lastEventText = `Target reached! (+${clearBonus} Bamboo bonus)`;

  world.phase = 'SINKING';
  world.sinkTimer = 1.15;
  world.stone.alive = false;
  world.flashAlpha = 0.35;
  world.cameraShake = 3.5;
  world.player.pose = 'CHEER';
  world.player.poseTimer = 1.3;

  const waterY = getWaterHeight(world, world.stone.x, world.stone.z);
  spawnSplashParticles(
    world,
    world.stone.x,
    waterY + 4,
    world.stone.z,
    26,
    30,
    ['#fde047', '#4ade80', '#38bdf8', '#ffffff']
  );
  addFloatingText(
    world,
    `LEVELS CLEARED! +${clearBonus} BAMBOO`,
    world.stone.x,
    waterY + 12,
    world.stone.z,
    '#fde047',
    1.3
  );
  soundEngine.playVictory();
}

function triggerSink(world: GameWorld, cause: string, customQuip?: string) {
  if (world.phase === 'SINKING') return;
  world.phase = 'SINKING';
  world.sinkTimer = 1.05;
  world.stone.alive = false;
  world.cameraShake = Math.max(world.cameraShake, 4.5);
  world.player.pose = 'RAGE';
  world.player.poseTimer = 1.2;

  const skips = world.stats.skips;
  let quip = customQuip;
  if (!quip) {
    if (skips === 0) quip = pickRandom(SINK_QUIPS_ZERO);
    else if (skips <= 3) quip = pickRandom(SINK_QUIPS_LOW);
    else if (skips <= 8) quip = pickRandom(SINK_QUIPS_MID);
    else quip = pickRandom(SINK_QUIPS_HIGH);
  }

  world.stats.causeOfSink = cause;
  world.stats.quip = quip;
  world.lastEventText = cause;

  const waterY = getWaterHeight(world, world.stone.x, world.stone.z);
  world.ripples.push({
    x: world.stone.x,
    z: world.stone.z,
    age: 0,
    maxAge: 1.1,
    maxRadius: 16,
    isPerfect: false,
  });
  spawnSplashParticles(
    world,
    world.stone.x,
    waterY,
    world.stone.z,
    22,
    28,
    ['#ffffff', '#bae6fd', '#38bdf8', '#0284c7']
  );
  addFloatingText(world, 'KER-SPLASH!', world.stone.x, waterY + 8, world.stone.z, '#f87171', 1.0);
  soundEngine.playSplashSink();
}

function consumeShieldSave(world: GameWorld, label = 'BUOY SHIELD SAVE!') {
  const profile = STONE_PROFILES[world.stoneKind];
  const stone = world.stone;
  const effG = getEffectiveGravity(world);
  const levelSpeedMult = getLevelSpeedMultiplier(world.stats.level);
  const waterY = getWaterHeight(world, stone.x, stone.z);

  world.shieldCharges = Math.max(0, world.shieldCharges - 1);
  stone.y = Math.max(waterY + 1.5, 1.5);
  stone.vy = Math.max(38, effG * 0.54) * profile.liftFactor;
  stone.vz = Math.max(stone.vz, 95 * levelSpeedMult);
  stone.skipGraceTimer = 0;
  stone.skipBufferTimer = 0;
  stone.inSkipWindow = false;
  stone.inPerfectWindow = false;
  stone.tti = 99;

  world.cameraShake = 2.8;
  world.flashAlpha = 0.18;
  world.ripples.push({
    x: stone.x,
    z: stone.z,
    age: 0,
    maxAge: 0.9,
    maxRadius: 14,
    isPerfect: true,
  });
  spawnSplashParticles(world, stone.x, waterY + 1, stone.z, 14, 22, [
    '#34d399',
    '#a7f3d0',
    '#ffffff',
  ]);
  addFloatingText(world, label, stone.x, waterY + 10, stone.z, '#34d399', 0.95);
  world.lastEventText = 'Buoyancy Shield saved your stone!';
  soundEngine.playPowerBuoy();
}

function performSkip(world: GameWorld, isPerfect: boolean) {
  const cfg = DIFFICULTIES[world.difficulty];
  const profile = STONE_PROFILES[world.stoneKind];
  const stone = world.stone;

  const waterY = getWaterHeight(world, stone.x, stone.z);
  stone.y = Math.max(waterY + 0.5, 0.5);

  // Check speed before bouncing (very forgiving minimum momentum)
  if (stone.vz < 10) {
    if (world.shieldCharges > 0) {
      consumeShieldSave(world, 'SHIELD BOOST!');
      return;
    }
    triggerSink(world, 'Lost too much momentum to skip!');
    return;
  }

  world.stats.skips += 1;
  if (isPerfect) {
    world.stats.perfectSkips += 1;
  }

  // Speed scales with current level: slow & calm in Level 1, faster in Level 2+
  const levelSpeedMult = getLevelSpeedMultiplier(world.stats.level);
  const retention = isPerfect
    ? Math.min(1.015, profile.speedRetention + 0.025)
    : Math.max(0.92, profile.speedRetention * 0.96);
  stone.vz = Math.min(
    profile.maxThrowSpeed * 1.12 * levelSpeedMult,
    stone.vz * retention + (isPerfect ? 3.5 : 1.2) * levelSpeedMult
  );

  // Floaty bounce in Level 1 (>= 1s air time per skip) while respecting heavier Level 2+ gravity
  const effG = getEffectiveGravity(world);
  const baseBounce = 31 + Math.min(stone.vz, 220) * 0.115;
  const rawVy = baseBounce * profile.liftFactor * (isPerfect ? 1.08 : 1.0);
  stone.vy = world.stats.level <= 1 ? Math.max(rawVy, effG * 0.56) : rawVy;

  // Subtle slight lateral deflection from waves in harder modes
  if (cfg.waveAmplitude > 1) {
    stone.vx += (Math.random() - 0.5) * cfg.waveAmplitude * 3.0;
  }

  stone.spin = (isPerfect ? 22 : 15) * (0.55 + levelSpeedMult * 0.55);
  stone.skipGraceTimer = 0;
  stone.skipBufferTimer = 0;
  stone.inSkipWindow = false;
  stone.inPerfectWindow = false;
  stone.tti = 99;
  stone.isHoldingJump = true;
  stone.jumpHoldTimer = 0;

  // Juice & feedback
  world.cameraShake = isPerfect ? 2.6 : 1.4;
  if (isPerfect) {
    world.flashAlpha = 0.22;
  }
  world.player.pose = world.stats.skips >= 5 ? 'CHEER' : 'WATCH';
  world.player.poseTimer = 0.4;

  world.ripples.push({
    x: stone.x,
    z: stone.z,
    age: 0,
    maxAge: isPerfect ? 0.95 : 0.7,
    maxRadius: isPerfect ? 14 : 9,
    isPerfect,
  });

  spawnSplashParticles(
    world,
    stone.x,
    waterY,
    stone.z,
    isPerfect ? 14 : 8,
    isPerfect ? 24 : 16,
    isPerfect ? ['#ffffff', '#fef08a', '#bae6fd'] : ['#ffffff', '#bae6fd', '#7dd3fc']
  );

  const label = isPerfect ? `PERFECT! x${world.stats.skips}` : `SKIP x${world.stats.skips}`;
  addFloatingText(
    world,
    label,
    stone.x,
    waterY + 7,
    stone.z,
    isPerfect ? '#fde047' : '#e0f2fe',
    0.72
  );
  world.lastEventText = isPerfect ? `Perfect skip #${world.stats.skips}!` : `Skipped #${world.stats.skips}`;

  soundEngine.playSplash();
  soundEngine.playSkip(world.stats.skips, isPerfect);
}

function launchStone(world: GameWorld, isOverheld = false) {
  const profile = STONE_PROFILES[world.stoneKind];
  const charge = Math.max(0.08, Math.min(1, world.charge));
  const isFullPower = charge >= 0.85 && !isOverheld;
  const isWeak = charge < 0.3;

  // Longer hold = linearly stronger, farther throw (uses active startLevel speed)
  const startSpeedMult = getLevelSpeedMultiplier(world.stats.level);
  const minVz = THROW_MIN_VZ * startSpeedMult;
  const maxVz = Math.min(THROW_MAX_VZ, profile.maxThrowSpeed) * startSpeedMult;
  let vz = minVz + (maxVz - minVz) * Math.pow(charge, 0.9);
  if (isFullPower) vz *= 1.05;

  // Higher charge also gives stronger initial lift so first bounce stays airborne >= 1s in Level 1
  const effG = getEffectiveGravity(world);
  const vy = Math.max((17 + charge * 11) * profile.liftFactor, effG * 0.36);
  const hook = isOverheld ? (Math.random() - 0.5) * 24 : 0;

  world.stone = {
    x: world.playerX + world.player.aimAngle * 6,
    y: 10,
    z: -6,
    vx: world.player.aimAngle * 22 + hook,
    vy,
    vz,
    spin: 12 + charge * 8,
    rotation: 0,
    flinchTimer: 0,
    mashCooldown: 0.12,
    skipGraceTimer: 0,
    skipBufferTimer: 0,
    inSkipWindow: false,
    inPerfectWindow: false,
    tti: 99,
    isHoldingJump: false,
    jumpHoldTimer: 0,
    alive: true,
  };

  // Sand foot-kick particles on the ground during throw
  spawnSplashParticles(world, world.playerX, 0.5, -16, 5, 11, ['#fef3c7', '#d4ba98', '#b09576']);

  world.overholdTimer = 0;
  world.phase = 'IN_FLIGHT';
  world.player.pose = 'THROW';
  world.player.poseTimer = 0.45;
  world.cameraShake = isFullPower ? 2.2 : 1.1;
  world.stats.peakSpeed = Math.max(world.stats.peakSpeed, Math.round(vz * 0.25));

  if (isOverheld) {
    addFloatingText(world, 'ARM CRAMP!', 0, 18, 18, '#fb923c', 0.8);
    world.lastEventText = 'Held too long! Release earlier next time.';
  } else if (isFullPower) {
    addFloatingText(world, 'MAX YEET!', 0, 18, 18, '#fde047', 0.75);
    world.lastEventText = 'Big throw! Hold SPACE on impact · A / D to steer.';
  } else if (isWeak) {
    addFloatingText(world, 'TINY TOSS', 0, 18, 18, '#94a3b8', 0.75);
    world.lastEventText = 'Short toss! Hold SPACE longer · A / D to steer.';
  } else {
    world.lastEventText = 'Hold SPACE at impact to jump · A / D to steer!';
  }

  soundEngine.playThrow(charge);
}

export function stepWorld(
  world: GameWorld,
  input: InputSnapshot,
  dt: number
): { finished: boolean } {
  const cfg = DIFFICULTIES[world.difficulty];
  const profile = STONE_PROFILES[world.stoneKind];
  world.time += dt;

  // Decay screen effects
  world.cameraShake = Math.max(0, world.cameraShake - dt * 14);
  world.flashAlpha = Math.max(0, world.flashAlpha - dt * 1.4);
  if (world.springBoostTimer > 0) {
    world.springBoostTimer = Math.max(0, world.springBoostTimer - dt);
  }

  // Subtle shifting wind
  if (Math.random() < cfg.windShiftRate * dt) {
    world.windTarget = (Math.random() - 0.5) * 2 * cfg.windStrength;
  }
  world.wind += (world.windTarget - world.wind) * Math.min(1, dt * 1.6);

  // Update hazards (ducks paddle sideways)
  for (const h of world.hazards) {
    if (h.hitCooldown > 0) h.hitCooldown = Math.max(0, h.hitCooldown - dt);
    if (h.angryTimer > 0) h.angryTimer = Math.max(0, h.angryTimer - dt);
    if (h.kind === 'DUCK') {
      h.x += h.vx * dt;
      if (h.x > 65) {
        h.x = 65;
        h.vx = -Math.abs(h.vx);
      } else if (h.x < -65) {
        h.x = -65;
        h.vx = Math.abs(h.vx);
      }
    }
  }

  // Update ripples
  for (let i = world.ripples.length - 1; i >= 0; i--) {
    world.ripples[i].age += dt;
    if (world.ripples[i].age >= world.ripples[i].maxAge) {
      world.ripples.splice(i, 1);
    }
  }

  // Update particles
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.age += dt;
    if (p.age >= p.maxAge) {
      world.particles.splice(i, 1);
      continue;
    }
    p.vy -= 95 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0) p.y = 0;
  }

  // Update floating texts
  for (let i = world.floatingTexts.length - 1; i >= 0; i--) {
    const ft = world.floatingTexts[i];
    ft.age += dt;
    ft.y += 10 * dt;
    if (ft.age >= ft.maxAge) {
      world.floatingTexts.splice(i, 1);
    }
  }

  // Update scuttling beach crabs & random birds (max 2, every 5s)
  updateCrabs(world, dt);
  updateBirds(world, dt);

  // Player pose timer
  if (world.player.poseTimer > 0) {
    world.player.poseTimer = Math.max(0, world.player.poseTimer - dt);
    if (world.player.poseTimer === 0 && world.phase === 'IN_FLIGHT') {
      world.player.pose = 'WATCH';
    } else if (world.player.poseTimer === 0 && world.phase === 'READY') {
      world.player.pose = 'IDLE';
    }
  }

  // Phase logic
  if (world.phase === 'READY') {
    const aimDelta = (input.rightHeld ? 1 : 0) - (input.leftHeld ? 1 : 0);
    world.player.aimAngle = Math.max(-1, Math.min(1, world.player.aimAngle + aimDelta * dt * 1.45));
    world.stone.x = world.player.aimAngle * 6;
    world.cameraZoomOffset += (0 - world.cameraZoomOffset) * Math.min(1, dt * 6);

    if (input.spaceJustPressed || input.spaceHeld) {
      world.phase = 'CHARGING';
      world.charge = 0.06;
      world.chargeDir = 1;
      world.overholdTimer = 0;
      world.player.pose = 'WINDUP';
      world.lastEventText = 'Keep holding SPACE to power up... release to throw!';
    }
    return { finished: false };
  }

  if (world.phase === 'CHARGING') {
    const aimDelta = (input.rightHeld ? 1 : 0) - (input.leftHeld ? 1 : 0);
    world.player.aimAngle = Math.max(-1, Math.min(1, world.player.aimAngle + aimDelta * dt * 1.0));

    const prevTick = Math.floor(world.charge * 12);
    if (world.charge < 1) {
      world.charge = Math.min(1, world.charge + dt * 1.12);
    } else {
      world.overholdTimer += dt;
    }
    const nextTick = Math.floor(world.charge * 12);
    if (nextTick !== prevTick) {
      soundEngine.playChargeTick(world.charge);
    }

    if (world.overholdTimer > 0.95) {
      launchStone(world, true);
    } else if (input.spaceJustReleased || !input.spaceHeld) {
      launchStone(world, false);
    }
    return { finished: false };
  }

  if (world.phase === 'IN_FLIGHT') {
    const stone = world.stone;
    if (stone.mashCooldown > 0) stone.mashCooldown = Math.max(0, stone.mashCooldown - dt);
    if (stone.flinchTimer > 0) stone.flinchTimer = Math.max(0, stone.flinchTimer - dt);
    if (stone.skipBufferTimer > 0) stone.skipBufferTimer = Math.max(0, stone.skipBufferTimer - dt);

    // Hold camera on the beach ground during the throw, then smoothly follow the stone up the river
    const targetCameraZ = Math.max(-26, stone.z - 86);
    world.cameraZ += (targetCameraZ - world.cameraZ) * Math.min(1, dt * 8.5);
    world.cameraZoomOffset = 0;

    // Endless Mode: stream powerups & hazards ahead and prune passed entities
    if (world.mode === 'ENDLESS') {
      if (stone.z + 360 > world.nextSpawnZ) {
        spawnEndlessSegment(world, world.nextSpawnZ, stone.z + 440);
      }
      for (let i = world.powerups.length - 1; i >= 0; i--) {
        if (world.powerups[i].collected || world.powerups[i].z < world.cameraZ - 55) {
          world.powerups.splice(i, 1);
        }
      }
      for (let i = world.hazards.length - 1; i >= 0; i--) {
        if (world.hazards[i].z < world.cameraZ - 55) {
          world.hazards.splice(i, 1);
        }
      }
    }

    const effectiveGravity = getEffectiveGravity(world);
    const levelSpeedMult = getLevelSpeedMultiplier(world.stats.level);

    // Variable jump-hold boost: the longer you hold SPACE during a skip, the farther it jumps!
    if (stone.isHoldingJump) {
      if (input.spaceHeld && stone.jumpHoldTimer < MAX_JUMP_HOLD_SEC) {
        const prevSpark = Math.floor(stone.jumpHoldTimer * 22);
        stone.jumpHoldTimer += dt;
        const nextSpark = Math.floor(stone.jumpHoldTimer * 22);

        stone.vy += effectiveGravity * 0.78 * profile.liftFactor * dt;
        stone.vz = Math.min(
          profile.maxThrowSpeed * 1.18 * levelSpeedMult,
          stone.vz + 54 * levelSpeedMult * profile.liftFactor * dt
        );

        if (nextSpark !== prevSpark) {
          world.particles.push({
            x: stone.x + (Math.random() - 0.5) * 3,
            y: Math.max(0.5, stone.y - 1),
            z: stone.z - 2,
            vx: (Math.random() - 0.5) * 8,
            vy: 8 + Math.random() * 10,
            vz: -10,
            age: 0,
            maxAge: 0.22,
            color: stone.jumpHoldTimer > MAX_JUMP_HOLD_SEC * 0.65 ? '#fde047' : '#7dd3fc',
            size: 2,
          });
        }
      } else {
        stone.isHoldingJump = false;
      }
    }

    // Spring trail sparkle particles
    if (world.springBoostTimer > 0 && Math.random() < dt * 28) {
      world.particles.push({
        x: stone.x + (Math.random() - 0.5) * 4,
        y: Math.max(0.5, stone.y),
        z: stone.z - 2,
        vx: (Math.random() - 0.5) * 10,
        vy: 5 + Math.random() * 8,
        vz: -8,
        age: 0,
        maxAge: 0.25,
        color: Math.random() > 0.45 ? '#fde047' : '#38bdf8',
        size: 2,
      });
    }

    // Physics integration (gravity & speed scale up as level grows + A/D mid-flight steering)
    const lateralScale = 0.55 + levelSpeedMult * 0.45;
    const steerDir = (input.rightHeld ? 1 : 0) - (input.leftHeld ? 1 : 0);
    const steerAccel = (95 / profile.mass) * lateralScale * steerDir;
    const windAccel = (world.wind / profile.mass) * 0.55;
    stone.vx += (windAccel + steerAccel) * dt;
    stone.vx *= 1 - (steerDir === 0 ? 0.85 : 0.35) * dt;
    const maxVx = 56 * lateralScale;
    stone.vx = Math.max(-maxVx, Math.min(maxVx, stone.vx));
    stone.vy -= effectiveGravity * dt;

    // Gentle air drag on vz
    stone.vz *= 1 - (1 - cfg.baseDrag) * 0.14 * dt;

    stone.x += stone.vx * dt;
    stone.y += stone.vy * dt;
    stone.z += stone.vz * dt;
    stone.rotation += stone.spin * dt;

    const runMeters = Math.max(0, Math.round(stone.z * METERS_PER_WORLD_Z));
    world.stats.distanceMeters = Math.max(world.stats.distanceMeters, runMeters);
    world.stats.peakSpeed = Math.max(world.stats.peakSpeed, Math.round(stone.vz * 0.25));

    // Award Bamboo currency every 100m traveled, scaled by map difficulty
    while (world.stats.distanceMeters >= world.nextBambooMilestoneMeters) {
      const reward = cfg.bamboosPer100m;
      world.stats.bamboosFromDistance += reward;
      world.stats.bamboosEarned += reward;
      addFloatingText(
        world,
        `+${reward} BAMBOO!`,
        stone.x,
        Math.max(10, stone.y + 10),
        stone.z + 8,
        '#4ade80',
        1.05
      );
      soundEngine.playBamboo();
      world.nextBambooMilestoneMeters += 100;
    }

    const effectiveMeters = Math.round(getEffectiveMeters(world));

    // Targeted runs finish at their randomly selected run distance.
    if (world.mode === 'LEVELS' && world.stats.distanceMeters >= world.targetMeters) {
      triggerVictory(world);
      return { finished: false };
    }

    const nextLevel = getLevelFromMeters(effectiveMeters, world.mode);
    if (nextLevel > world.stats.level) {
      const prevSpeedMult = getLevelSpeedMultiplier(world.stats.level);
      const nextSpeedMult = getLevelSpeedMultiplier(nextLevel);
      const speedRatio = nextSpeedMult / Math.max(0.1, prevSpeedMult);
      const maxLevelVz = profile.maxThrowSpeed * 1.12 * nextSpeedMult;
      stone.vz = Math.min(
        maxLevelVz,
        Math.max(stone.vz * (1 + (speedRatio - 1) * 0.65) + 4, 145 * nextSpeedMult)
      );

      world.stats.level = nextLevel;
      world.flashAlpha = 0.28;
      world.cameraShake = 2.8;
      addFloatingText(
        world,
        `LEVEL ${nextLevel} · FASTER & HEAVIER!`,
        stone.x,
        Math.max(8, stone.y + 8),
        stone.z + 12,
        '#fde047',
        1.4
      );
      world.lastEventText = `Entered Level ${nextLevel} — speed & gravity increased!`;
    }

    const waterY = getWaterHeight(world, stone.x, stone.z);

    // Check Endless Mode Powerups (Springs, Power Buoys, Bamboo floats)
    if (world.mode === 'ENDLESS' && stone.y - waterY < 10.5) {
      for (const p of world.powerups) {
        if (p.collected) continue;
        const dz = Math.abs(stone.z - p.z);
        const dx = Math.abs(stone.x - p.x);
        if (dz < 11.5 && dx < 11.5) {
          p.collected = true;
          world.stats.powerupsHit += 1;

          if (p.kind === 'SPRING') {
            world.stats.skips += 2;
            stone.y = Math.max(waterY + 1.5, stone.y);
            stone.vy = Math.max(46, effectiveGravity * 0.6) * profile.liftFactor;
            stone.vz = Math.min(
              profile.maxThrowSpeed * 1.24 * levelSpeedMult,
              stone.vz + 28 * levelSpeedMult
            );
            stone.skipGraceTimer = 0;
            stone.skipBufferTimer = 0;
            stone.isHoldingJump = false;
            world.springBoostTimer = 1.15;
            world.cameraShake = 3.0;
            world.flashAlpha = 0.2;
            world.ripples.push({
              x: p.x,
              z: p.z,
              age: 0,
              maxAge: 0.95,
              maxRadius: 15,
              isPerfect: true,
            });
            spawnSplashParticles(world, p.x, waterY + 2, p.z, 16, 26, [
              '#fde047',
              '#38bdf8',
              '#ffffff',
            ]);
            addFloatingText(world, 'SPRING BOUNCE! +2', p.x, waterY + 10, p.z, '#fde047', 1.0);
            world.lastEventText = 'Spring hit! Huge mega-skip & speed boost!';
            soundEngine.playSpring();
          } else if (p.kind === 'POWER_BUOY') {
            world.stats.skips += 1;
            world.shieldCharges = Math.min(2, world.shieldCharges + 1);
            stone.y = Math.max(waterY + 1.2, stone.y);
            stone.vy = Math.max(stone.vy, Math.max(36, effectiveGravity * 0.48) * profile.liftFactor);
            stone.skipGraceTimer = 0;
            world.cameraShake = 2.2;
            world.ripples.push({
              x: p.x,
              z: p.z,
              age: 0,
              maxAge: 0.9,
              maxRadius: 13,
              isPerfect: true,
            });
            spawnSplashParticles(world, p.x, waterY + 2, p.z, 14, 22, [
              '#34d399',
              '#a7f3d0',
              '#fde047',
            ]);
            addFloatingText(world, 'BUOY SHIELD!', p.x, waterY + 10, p.z, '#34d399', 1.0);
            world.lastEventText = `Power Buoy! Buoyancy Shield x${world.shieldCharges} active.`;
            soundEngine.playPowerBuoy();
          } else {
            const bonus = Math.max(2, Math.round(cfg.bamboosPer100m * 0.4));
            world.stats.bamboosFromPickups += bonus;
            world.stats.bamboosEarned += bonus;
            spawnSplashParticles(world, p.x, waterY + 2, p.z, 12, 20, [
              '#4ade80',
              '#bef264',
              '#ffffff',
            ]);
            addFloatingText(world, `+${bonus} BAMBOO`, p.x, waterY + 9, p.z, '#4ade80', 0.95);
            world.lastEventText = `Collected Bamboo float (+${bonus} Bamboos)!`;
            soundEngine.playBamboo();
          }
        }
      }
    }

    // Davin Rage-Bait Interaction & Slumber Vortex
    if (world.davin && world.davin.active) {
      const davin = world.davin;
      davin.breathPhase += dt * 2.2;
      davin.x += (stone.x - davin.x) * Math.min(1, dt * 1.8);
      davin.x = Math.max(-42, Math.min(42, davin.x));
      davin.z += (stone.z - 24 - davin.z) * Math.min(1, dt * 1.35);

      if (davin.throwTimer > 0) {
        davin.throwTimer -= dt;
        if (davin.throwTimer <= 0) {
          triggerSink(world, 'Daven threw the pabble right back at you!', pickRandom(DAVIN_RAGE_QUIPS));
          return { finished: false };
        }
      }

      // Snore cycle
      davin.snoreTimer -= dt;
      if (davin.snoreTimer <= 0) {
        davin.isSnoring = true;
        davin.snoreWaveRadius = 2;
        davin.snoreWaveAlpha = 1.0;
        davin.snoreTimer = 3.0 + Math.random() * 1.5;
        davin.snoreCycleCount++;
        soundEngine.playSnoreExhale();
        world.cameraShake = 2.4;
        const quip = pickRandom(DAVIN_SNORE_QUIPS);
        addFloatingText(world, quip, davin.x, 14, davin.z, '#f472b6', 1.2);
        world.lastEventText = `Daven: "${quip}"`;
      }

      if (davin.snoreWaveAlpha > 0) {
        davin.snoreWaveRadius += 58 * dt;
        davin.snoreWaveAlpha -= dt * 0.65;
        if (davin.snoreWaveAlpha <= 0) {
          davin.isSnoring = false;
        }
      }

      // 1. Snore Suction: Pull stone towards Davin
      const distZ = davin.z - stone.z;
      if (Math.abs(distZ) < 80) {
        const lateralDist = davin.x - stone.x;
        const snorePull = (lateralDist > 0 ? 1 : -1) * 28 * (1 - Math.abs(distZ) / 80);
        stone.vx += snorePull * dt;
        if (Math.random() < dt * 14) {
          world.particles.push({
            x: stone.x + (Math.random() - 0.5) * 4,
            y: Math.max(1, stone.y + 1),
            z: stone.z,
            vx: (Math.random() - 0.5) * 10,
            vy: 5,
            vz: -6,
            age: 0,
            maxAge: 0.25,
            color: '#fbcfe8',
            size: 2,
          });
        }
      }

      // 2. Direct Hit / Collision on Daven's full-path blockade
      const dz = Math.abs(stone.z - davin.z);
      if (davin.throwTimer <= 0 && dz < 16 && stone.y - waterY < 8) {
        if (world.shieldCharges > 0) {
          consumeShieldSave(world, 'DREAM DEFLECT!');
          return { finished: false };
        }
        soundEngine.playBonk();
        soundEngine.playRageChime();
        davin.throwTimer = 0.42;
        davin.pabbleEaten = true;
        world.player.pose = 'RAGE';
        world.player.poseTimer = 0.55;
        stone.vz = -62;
        stone.vx = (stone.x - davin.x) * 0.8;
        stone.vy = 34;
        world.cameraShake = 7;
        addFloatingText(world, 'DAVEN THROWS IT BACK!', davin.x, 18, davin.z, '#fb7185', 1.4);
        world.lastEventText = 'Daven caught the pabble and threw it back!';
      }

      // Daven keeps closing the gap instead of waiting at a fixed blockade.
    }

    // Check hazards when stone is low near water
    if (stone.y - waterY < 6.5) {
      for (const h of world.hazards) {
        if (h.hitCooldown > 0) continue;
        const dz = Math.abs(stone.z - h.z);
        const dx = Math.abs(stone.x - h.x);
        if (dz < 9 && dx < h.width * 0.65) {
          h.hitCooldown = 1.4;
          if (h.kind === 'SNORE_BUBBLE') {
            soundEngine.playBubblePop();
            stone.vy = 32 + Math.random() * 12;
            stone.vx += (Math.random() > 0.5 ? 1 : -1) * (22 + Math.random() * 14);
            world.stats.skips += 1;
            world.cameraShake = 1.8;
            spawnSplashParticles(world, h.x, waterY + 2, h.z, 12, 18, [
              '#fbcfe8',
              '#f472b6',
              '#ffffff',
            ]);
            addFloatingText(world, 'BUBBLE POP! +1', h.x, waterY + 9, h.z, '#f472b6', 0.9);
            world.lastEventText = 'Popped Daven’s snore bubble!';
          } else if (h.kind === 'DUCK') {
            h.angryTimer = 1.6;
            world.stats.ducksBonked += 1;
            world.stats.skips += 1;
            stone.vy = 36 + Math.random() * 14;
            stone.vx += (Math.random() > 0.5 ? 1 : -1) * (28 + Math.random() * 18);
            stone.vz *= 0.85;
            world.cameraShake = 3.5;
            soundEngine.playQuack();
            spawnSplashParticles(
              world,
              h.x,
              waterY + 2,
              h.z,
              12,
              22,
              ['#ffffff', '#fef08a', '#f97316']
            );
            addFloatingText(world, 'QUACK BONK! +1', h.x, waterY + 9, h.z, '#fde047', 1.0);
            world.lastEventText = pickRandom(DUCK_QUIPS);
          } else if (world.shieldCharges > 0) {
            consumeShieldSave(world, 'SHIELD DEFLECT!');
            return { finished: false };
          } else if (h.kind === 'LOG' || h.kind === 'WRECKAGE') {
            soundEngine.playBonk();
            triggerSink(
              world,
              h.kind === 'WRECKAGE' ? 'Crashed into a rusting shipwreck part!' : 'Smacked straight into driftwood.',
              h.kind === 'WRECKAGE' ? pickRandom(WRECK_QUIPS) : pickRandom(LOG_QUIPS)
            );
            return { finished: false };
          } else {
            soundEngine.playBonk();
            triggerSink(world, 'Clanged off a harbor buoy.', pickRandom(BUOY_QUIPS));
            return { finished: false };
          }
        }
      }
    }

    // Out of lateral sea boundary cones/chains (Level 1 only; open ocean in Level 2+ or Endless past 500m)
    if (world.startLevel === 1 && stone.z < LEVEL_2_START_Z && Math.abs(stone.x) > 88) {
      if (world.shieldCharges > 0) {
        stone.x = Math.sign(stone.x) * 80;
        stone.vx = -Math.sign(stone.x) * 28;
        consumeShieldSave(world, 'SHIELD BOUNCE!');
        return { finished: false };
      }
      triggerSink(world, 'Crossed the boundary chain!');
      return { finished: false };
    }

    // Compute Time To Impact (TTI) when descending
    const heightAboveWater = stone.y - waterY;
    if (stone.vy < 0) {
      const disc = stone.vy * stone.vy + 2 * effectiveGravity * Math.max(0, heightAboveWater);
      stone.tti = (stone.vy + Math.sqrt(disc)) / effectiveGravity;
    } else {
      stone.tti = 99;
    }

    // Determine Skip Timing Windows (generous water-skim grace window!)
    const graceDuration = world.difficulty === 'CALM_CREEK' ? 0.16 : world.difficulty === 'CHOPPY_BAY' ? 0.115 : 0.085;
    if (heightAboveWater <= 0) {
      // Just touched surface: start or tick coyote skip grace window!
      if (stone.skipGraceTimer <= 0 && stone.vy < 0) {
        stone.skipGraceTimer = graceDuration;
      }
      stone.y = waterY;
      stone.inSkipWindow = stone.skipGraceTimer > 0;
      stone.inPerfectWindow = stone.skipGraceTimer > graceDuration * 0.45;
    } else {
      stone.skipGraceTimer = 0;
      stone.inSkipWindow = stone.vy < 0 && stone.tti <= cfg.goodWindowSec;
      stone.inPerfectWindow = stone.vy < 0 && stone.tti <= cfg.perfectWindowSec;
    }

    // Early-press input buffer: pressing SPACE slightly before the window opens still catches the skip!
    if (input.spaceJustPressed && stone.mashCooldown <= 0) {
      if (stone.inSkipWindow) {
        performSkip(world, stone.inPerfectWindow);
        return { finished: false };
      } else if (stone.vy <= 12) {
        // Descending or near apex: buffer the press cleanly instead of punishing!
        stone.skipBufferTimer = 0.2;
      } else {
        // Only flinch if mashing while stone is still shooting high upward
        stone.mashCooldown = 0.16;
        stone.flinchTimer = 0.2;
        stone.vz *= 0.95;
        world.stats.mashFlinches += 1;
        soundEngine.playFlinch();
        addFloatingText(
          world,
          'TOO HIGH!',
          stone.x,
          stone.y + 6,
          stone.z,
          '#fb923c',
          0.55
        );
        world.lastEventText = 'Wait until the stone starts dropping to press SPACE!';
      }
    } else if (stone.skipBufferTimer > 0 && stone.inSkipWindow) {
      performSkip(world, stone.inPerfectWindow);
      return { finished: false };
    }

    // Tick surface coyote grace window if underwater
    if (heightAboveWater <= 0) {
      stone.skipGraceTimer -= dt;
      if (stone.skipGraceTimer <= 0) {
        if (world.shieldCharges > 0) {
          consumeShieldSave(world);
          return { finished: false };
        }
        triggerSink(
          world,
          world.stats.skips === 0
            ? 'Missed the first skip!'
            : `Missed skip #${world.stats.skips + 1}!`
        );
        return { finished: false };
      }
    }

    return { finished: false };
  }

  if (world.phase === 'SINKING') {
    world.sinkTimer -= dt;
    if (world.sinkTimer <= 0) {
      return { finished: true };
    }
  }

  return { finished: false };
}

function updateCrabs(world: GameWorld, dt: number) {
  for (const crab of world.crabs) {
    if (crab.pauseTimer > 0) {
      crab.pauseTimer -= dt;
      if (crab.pauseTimer <= 0) {
        crab.moveTimer = 0.8 + Math.random() * 1.5;
        const speed = 11 + Math.random() * 10;
        const dir =
          crab.x > 72 ? -1 : crab.x < -72 ? 1 : Math.random() > 0.45 ? -Math.sign(crab.vx || 1) : Math.sign(crab.vx || 1);
        crab.vx = dir * speed;
      }
    } else {
      crab.x += crab.vx * dt;
      crab.z += Math.sin(world.time * 4 + crab.phaseOffset) * 2.2 * dt;
      crab.z = Math.max(-27, Math.min(-5, crab.z));

      if (crab.x > 86) {
        crab.x = 86;
        crab.vx = -Math.abs(crab.vx);
      } else if (crab.x < -86) {
        crab.x = -86;
        crab.vx = Math.abs(crab.vx);
      }

      crab.moveTimer -= dt;
      if (crab.moveTimer <= 0) {
        crab.pauseTimer = 0.45 + Math.random() * 1.1;
      }
    }
  }
}

function updateBirds(world: GameWorld, dt: number) {
  for (let i = world.birds.length - 1; i >= 0; i--) {
    const bird = world.birds[i];
    bird.x += bird.vx * dt;
    bird.z += bird.vz * dt;
    if (
      bird.x < -145 ||
      bird.x > 165 ||
      bird.z < world.cameraZ - 95 ||
      bird.z > world.cameraZ + 230
    ) {
      world.birds.splice(i, 1);
    }
  }

  world.birdSpawnTimer -= dt;
  if (world.birdSpawnTimer <= 0) {
    world.birdSpawnTimer = 5;
    if (world.birds.length < 2) {
      const speedX = 48 + Math.random() * 14;
      const speedZ = 28 + Math.random() * 10;
      world.birds.push({
        id: world.nextId++,
        x: 115 + Math.random() * 16,
        y: 30 + Math.random() * 7,
        z: world.cameraZ + 85 + Math.random() * 65,
        vx: -speedX,
        vz: -speedZ,
        dir: -1,
        flapOffset: Math.random() * 10,
      });
    }
  }
}

function updateMenuBirds(world: GameWorld, dt: number) {
  for (let i = world.birds.length - 1; i >= 0; i--) {
    const bird = world.birds[i];
    bird.x += bird.vx * dt;
    bird.z += bird.vz * dt;
    if (bird.x < -145 || bird.z < -130) {
      world.birds.splice(i, 1);
    }
  }

  world.birdSpawnTimer -= dt;
  if (world.birdSpawnTimer <= 0) {
    world.birdSpawnTimer = 5;
    world.birds.length = 0;

    // Pair of 2 foreground birds gliding diagonally from top-right corner to bottom-left corner
    world.birds.push(
      {
        id: world.nextId++,
        x: 114,
        y: 32,
        z: 74,
        vx: -58,
        vz: -38,
        dir: -1,
        flapOffset: 0.3,
      },
      {
        id: world.nextId++,
        x: 132,
        y: 35,
        z: 56,
        vx: -59,
        vz: -38,
        dir: -1,
        flapOffset: 2.0,
      }
    );
  }
}

export function stepMenuDemo(world: GameWorld, dt: number) {
  world.time += dt;
  world.cameraZ = -32;
  world.playerX = 48; // Stand on the right side of the golden beach land

  // Gentle breeze on the beach
  world.windTarget = Math.sin(world.time * 0.4) * 5;
  world.wind += (world.windTarget - world.wind) * Math.min(1, dt * 1.5);

  updateCrabs(world, dt);
  updateMenuBirds(world, dt);

  // Update Davin in menu if Davin's Slumber is selected
  if (world.davin && world.davin.active) {
    world.davin.breathPhase += dt * 2.2;
    world.davin.x += Math.sin(world.time * 0.9) * 8 * dt;
    world.davin.snoreTimer -= dt;
    if (world.davin.snoreTimer <= 0) {
      world.davin.isSnoring = true;
      world.davin.snoreWaveRadius = 2;
      world.davin.snoreWaveAlpha = 1.0;
      world.davin.snoreTimer = 3.2;
    }
    if (world.davin.snoreWaveAlpha > 0) {
      world.davin.snoreWaveRadius += 45 * dt;
      world.davin.snoreWaveAlpha -= dt * 0.65;
      if (world.davin.snoreWaveAlpha <= 0) {
        world.davin.isSnoring = false;
      }
    }
  }

  // Update ducks gently on the calm sea
  for (const h of world.hazards) {
    if (h.kind === 'DUCK' && h.z < 180) {
      h.x += h.vx * dt * 0.6;
      if (h.x > 65) h.vx = -Math.abs(h.vx);
      if (h.x < -65) h.vx = Math.abs(h.vx);
    }
  }

  // Update ripples
  for (let i = world.ripples.length - 1; i >= 0; i--) {
    world.ripples[i].age += dt;
    if (world.ripples[i].age >= world.ripples[i].maxAge) {
      world.ripples.splice(i, 1);
    }
  }

  // Update splash particles
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.age += dt;
    if (p.age >= p.maxAge) {
      world.particles.splice(i, 1);
      continue;
    }
    p.vy -= 90 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0) p.y = 0;
  }

  // Looping character throwing animation on the beach
  const prevTimer = world.demoCycleTimer;
  world.demoCycleTimer = (world.demoCycleTimer + dt) % 3.2;
  const t = world.demoCycleTimer;

  if (t < 0.95) {
    world.player.pose = 'IDLE';
  } else if (t < 1.5) {
    world.player.pose = 'WINDUP';
  } else if (t < 1.85) {
    world.player.pose = 'THROW';
    // Launch a peaceful demo stone once per cycle
    if (prevTimer < 1.5) {
      world.stone = {
        x: world.playerX - 2,
        y: 10,
        z: -8,
        vx: -14,
        vy: 15,
        vz: 122,
        spin: 22,
        rotation: 0,
        flinchTimer: 0,
        mashCooldown: 0,
        skipGraceTimer: 0,
        skipBufferTimer: 0,
        inSkipWindow: false,
        inPerfectWindow: false,
        tti: 99,
        isHoldingJump: false,
        jumpHoldTimer: 0,
        alive: true,
      };
    }
  } else if (t < 2.75) {
    world.player.pose = 'WATCH';
  } else {
    world.player.pose = 'CHEER';
  }

  // Simulate demo stone skipping softly across the calm waves
  if (world.stone.alive) {
    const stone = world.stone;
    stone.vy -= 115 * dt;
    stone.x += stone.vx * dt;
    stone.y += stone.vy * dt;
    stone.z += stone.vz * dt;
    stone.rotation += stone.spin * dt;

    if (stone.z > 0 && stone.y <= 0 && stone.vy < 0) {
      if (stone.vz > 72) {
        stone.y = 0.4;
        stone.vy = 22 + Math.random() * 4;
        stone.vz *= 0.8;
        world.ripples.push({
          x: stone.x,
          z: stone.z,
          age: 0,
          maxAge: 0.9,
          maxRadius: 11,
          isPerfect: true,
        });
        spawnSplashParticles(world, stone.x, 0.5, stone.z, 6, 13, ['#ffffff', '#bae6fd']);
      } else {
        stone.alive = false;
        world.ripples.push({
          x: stone.x,
          z: stone.z,
          age: 0,
          maxAge: 1.0,
          maxRadius: 14,
          isPerfect: false,
        });
        spawnSplashParticles(world, stone.x, 0.5, stone.z, 10, 16, ['#ffffff', '#bae6fd', '#7dd3fc']);
      }
    }
    if (stone.z > 130) {
      stone.alive = false;
    }
  }
}
