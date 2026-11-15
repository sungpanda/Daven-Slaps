export type AppScreenState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

export type PlayPhase = 'READY' | 'CHARGING' | 'IN_FLIGHT' | 'SINKING';

export type GameMode = 'LEVELS' | 'ENDLESS';

export type DifficultyId =
  | 'CALM_CREEK'
  | 'CHOPPY_BAY'
  | 'RAGE_RAPIDS'
  | 'TEMPEST_REEF'
  | 'DAVIN_SLUMBER';

export type StoneKind = 'FLAT_SLATE' | 'ROUND_PEBBLE' | 'THE_BRICK';

export type HazardKind =
  | 'DUCK'
  | 'LOG'
  | 'BUOY'
  | 'WRECKAGE'
  | 'LARGE_WRECK'
  | 'BAMBOO_BOAT'
  | 'DAVIN'
  | 'SNORE_BUBBLE';

export type PowerupKind = 'SPRING' | 'POWER_BUOY' | 'BAMBOO';

export type SkipQuality = 'PERFECT' | 'GOOD' | 'DUCK_BOUNCE';

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  tagline: string;
  unlockCost: number;
  bamboosPer100m: number;
  gravity: number;
  baseDrag: number;
  waveAmplitude: number;
  waveFrequency: number;
  windStrength: number;
  windShiftRate: number;
  perfectWindowSec: number;
  goodWindowSec: number;
  hazardDensity: number;
}

export interface StoneProfile {
  id: StoneKind;
  name: string;
  description: string;
  radius: number;
  mass: number;
  liftFactor: number;
  speedRetention: number;
  maxThrowSpeed: number;
  colorLight: string;
  colorMid: string;
  colorDark: string;
}

export interface StoneState {
  x: number; // lateral world position (0 = center)
  y: number; // height above base water plane (0 = water level)
  z: number; // forward distance from shore (0 = player shore)
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rotation: number;
  flinchTimer: number;
  mashCooldown: number;
  skipGraceTimer: number;
  skipBufferTimer: number;
  inSkipWindow: boolean;
  inPerfectWindow: boolean;
  tti: number; // estimated time to water impact in seconds
  isHoldingJump: boolean;
  jumpHoldTimer: number;
  alive: boolean;
}

export interface Ripple {
  x: number;
  z: number;
  age: number;
  maxAge: number;
  maxRadius: number;
  isPerfect: boolean;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  color: string;
  size: number;
}

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  z: number;
  age: number;
  maxAge: number;
  color: string;
}

export interface Hazard {
  id: number;
  kind: HazardKind;
  x: number;
  z: number;
  vx: number;
  width: number;
  hitCooldown: number;
  angryTimer: number;
}

export interface Powerup {
  id: number;
  kind: PowerupKind;
  x: number;
  z: number;
  bobPhase: number;
  collected: boolean;
}

export interface DavinState {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  breathPhase: number;
  snoreTimer: number;
  isSnoring: boolean;
  snoreWaveRadius: number;
  snoreWaveAlpha: number;
  sleepZzzTimer: number;
  pabbleEaten: boolean;
  throwTimer: number;
  snoreCycleCount: number;
  lastQuip: string;
}

export interface PlayerAnimState {
  pose: 'IDLE' | 'WINDUP' | 'THROW' | 'WATCH' | 'RAGE' | 'CHEER';
  poseTimer: number;
  aimAngle: number; // -1..1 lateral aim
}

export interface BeachCrab {
  id: number;
  x: number;
  z: number;
  vx: number;
  pauseTimer: number;
  moveTimer: number;
  color: string;
  phaseOffset: number;
}

export interface FlyingBird {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  dir: 1 | -1;
  flapOffset: number;
}

export interface RunStats {
  mode: GameMode;
  level: number;
  clearedLevels: boolean;
  skips: number;
  perfectSkips: number;
  distanceMeters: number;
  peakSpeed: number;
  mashFlinches: number;
  ducksBonked: number;
  powerupsHit: number;
  bamboosEarned: number;
  bamboosFromDistance: number;
  bamboosFromPickups: number;
  bamboosFromClear: number;
  causeOfSink: string;
  quip: string;
}

export interface InputSnapshot {
  spaceHeld: boolean;
  spaceJustPressed: boolean;
  spaceJustReleased: boolean;
  leftHeld: boolean;
  rightHeld: boolean;
}

export interface GameWorld {
  mode: GameMode;
  targetMeters: number;
  startLevel: number;
  phase: PlayPhase;
  difficulty: DifficultyId;
  stoneKind: StoneKind;
  time: number;
  charge: number; // 0..1 hold power meter
  chargeDir: 1 | -1;
  overholdTimer: number;
  wind: number; // lateral acceleration
  windTarget: number;
  stone: StoneState;
  player: PlayerAnimState;
  playerX: number;
  demoCycleTimer: number;
  crabs: BeachCrab[];
  birds: FlyingBird[];
  birdSpawnTimer: number;
  davin: DavinState;
  ripples: Ripple[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  hazards: Hazard[];
  powerups: Powerup[];
  shieldCharges: number;
  springBoostTimer: number;
  nextSpawnZ: number;
  nextBambooMilestoneMeters: number;
  nextId: number;
  sinkTimer: number;
  cameraZ: number;
  cameraShake: number;
  cameraZoomOffset: number;
  flashAlpha: number;
  stats: RunStats;
  lastEventText: string;
}
