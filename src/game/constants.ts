import type { DifficultyConfig, DifficultyId, StoneKind, StoneProfile } from './types';

export const VIRTUAL_WIDTH = 320;
export const VIRTUAL_HEIGHT = 180;

export const HORIZON_Y = 66;
export const SHORE_Y = 148;
export const CAMERA_FOCAL = 72;
export const WORLD_LATERAL_SCALE = 2.6;
export const WORLD_HEIGHT_SCALE = 2.35;

export const THROW_MIN_VZ = 78;
export const THROW_MAX_VZ = 235;
export const THROW_SWEET_SPOT = 0.84;
export const MAX_JUMP_HOLD_SEC = 0.4;

export const METERS_PER_WORLD_Z = 0.28;
export const LEVEL_2_START_METERS = 500;
export const LEVEL_2_START_Z = LEVEL_2_START_METERS / METERS_PER_WORLD_Z;

// 5 progressive levels (Lv 1: 0-500m, Lv 2: 500-1100m, Lv 3: 1100-1800m, Lv 4: 1800-2600m, Lv 5: 2600-3500m)
export const MAX_LEVEL = 5;
export const LEVEL_START_METERS: Record<number, number> = {
  1: 0,
  2: 500,
  3: 1100,
  4: 1800,
  5: 2600,
};
export const LEVELS_VICTORY_METERS = 3500;

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  CALM_CREEK: {
    id: 'CALM_CREEK',
    label: 'Calm Creek',
    tagline: 'Easy breeze, floaty arcs, wide skip timing.',
    unlockCost: 0,
    bamboosPer100m: 5,
    gravity: 86,
    baseDrag: 0.975,
    waveAmplitude: 0.25,
    waveFrequency: 0.08,
    windStrength: 2,
    windShiftRate: 0.05,
    perfectWindowSec: 0.13,
    goodWindowSec: 0.3,
    hazardDensity: 0.28,
  },
  CHOPPY_BAY: {
    id: 'CHOPPY_BAY',
    label: 'Choppy Bay',
    tagline: 'Rolling swells, mild crosswinds, smug buoys.',
    unlockCost: 25,
    bamboosPer100m: 10,
    gravity: 112,
    baseDrag: 0.95,
    waveAmplitude: 1.4,
    waveFrequency: 0.11,
    windStrength: 10,
    windShiftRate: 0.18,
    perfectWindowSec: 0.09,
    goodWindowSec: 0.22,
    hazardDensity: 0.6,
  },
  RAGE_RAPIDS: {
    id: 'RAGE_RAPIDS',
    label: 'Rage Rapids',
    tagline: 'Violent chop, gale gusts, zero mercy.',
    unlockCost: 65,
    bamboosPer100m: 18,
    gravity: 136,
    baseDrag: 0.92,
    waveAmplitude: 2.6,
    waveFrequency: 0.15,
    windStrength: 20,
    windShiftRate: 0.34,
    perfectWindowSec: 0.065,
    goodWindowSec: 0.165,
    hazardDensity: 0.95,
  },
  TEMPEST_REEF: {
    id: 'TEMPEST_REEF',
    label: 'Tempest Reef',
    tagline: 'Volcanic reef swells, fierce gusts, richest bamboo yield.',
    unlockCost: 120,
    bamboosPer100m: 28,
    gravity: 152,
    baseDrag: 0.9,
    waveAmplitude: 3.1,
    waveFrequency: 0.17,
    windStrength: 25,
    windShiftRate: 0.4,
    perfectWindowSec: 0.058,
    goodWindowSec: 0.145,
    hazardDensity: 1.1,
  },
  DAVIN_SLUMBER: {
    id: 'DAVIN_SLUMBER',
    label: 'Daven Slaps',
    tagline: '🔥 RAGE BAIT: Daven blocks the entire path while his snore vortex sends Pabble to the depths.',
    unlockCost: 0,
    bamboosPer100m: 45,
    gravity: 125,
    baseDrag: 0.93,
    waveAmplitude: 2.5,
    waveFrequency: 0.16,
    windStrength: 24,
    windShiftRate: 0.42,
    perfectWindowSec: 0.065,
    goodWindowSec: 0.165,
    hazardDensity: 0.85,
  },
};

export const STONE_PROFILES: Record<StoneKind, StoneProfile> = {
  FLAT_SLATE: {
    id: 'FLAT_SLATE',
    name: 'Flat Slate',
    description: 'Easy river-skipping geometry. High lift & long glide.',
    radius: 3.5,
    mass: 1.0,
    liftFactor: 1.08,
    speedRetention: 0.985,
    maxThrowSpeed: 225,
    colorLight: '#cbd5e1',
    colorMid: '#64748b',
    colorDark: '#334155',
  },
  ROUND_PEBBLE: {
    id: 'ROUND_PEBBLE',
    name: 'Floaty Biscuit',
    description: 'Light, bouncy, and wildly susceptible to side winds.',
    radius: 3.0,
    mass: 0.75,
    liftFactor: 1.18,
    speedRetention: 0.93,
    maxThrowSpeed: 205,
    colorLight: '#fde68a',
    colorMid: '#d97706',
    colorDark: '#78350f',
  },
  THE_BRICK: {
    id: 'THE_BRICK',
    name: 'Actual Brick',
    description: 'Zero aerodynamics. Pure comedy. Respect if you get 3 skips.',
    radius: 4.5,
    mass: 1.65,
    liftFactor: 0.76,
    speedRetention: 0.85,
    maxThrowSpeed: 175,
    colorLight: '#fca5a5',
    colorMid: '#b91c1c',
    colorDark: '#7f1d1d',
  },
};

export const SINK_QUIPS_ZERO: string[] = [
  'Did you just drop it at your own shoes?',
  'The fish did not even flinch.',
  'Technically, that counts as feeding the river.',
  'Gravity: 1. Your wrist: 0.',
  'A majestic vertical dive.',
];

export const SINK_QUIPS_LOW: string[] = [
  'A polite splash. Your ancestors are mildly disappointed.',
  'Almost skipped! Just missed the entire water part.',
  'That stone had dreams. You drowned them.',
  'Short, tragic, unforgettable.',
];

export const SINK_QUIPS_MID: string[] = [
  'Respectable wrist flick! Still sank though.',
  'The local ducks took notes and rated it 6/10.',
  'So close to legend, so wet in reality.',
  'Nice rhythm until your thumb betrayed you.',
];

export const SINK_QUIPS_HIGH: string[] = [
  'Poseidon himself is sweating right now.',
  'That pebble broke three maritime speed limits.',
  'Absolute wrist sorcery.',
  'Built different. Still sank at the end.',
];

export const DUCK_QUIPS: string[] = [
  'DUCK ASSAULT! Feather tax collected.',
  'You woke up Gerald. Gerald chooses violence.',
  'QUACK! No fly zone enforced.',
  'Duck parry! Unbelievable defense.',
];

export const LOG_QUIPS: string[] = [
  'BONK! Driftwood says no.',
  'Outsmarted by a dead tree.',
  'Solid wood. Hollow victory.',
];

export const BUOY_QUIPS: string[] = [
  'CLANG! Coast Guard notified.',
  'That buoy has been undefeated since 1994.',
  'Wrong kind of metal.',
];

export const WRECK_QUIPS: string[] = [
  'SCRAPPED! Hit a rusting hull plate.',
  'Tangled in century-old shipwreck debris.',
  'That iron bulkhead was harder than your stone.',
];

export const SHIP_WRECK_QUIPS: string[] = [
  'Crashed into a massive half-sunken galleon hull!',
  'A colossal shipwreck stopped your skip dead.',
];

export const BAMBOO_BOAT_QUIPS: string[] = [
  'Tangled with a drifting bamboo fishing raft.',
  'Smacked right into an old bamboo boat.',
];

export const DAVIN_RAGE_QUIPS: string[] = [
  'Daven snored so hard your pabble took a 90-degree dive into the abyss.',
  'Daven twitched in his sleep and casually erased all your momentum.',
  'PABBLE STATUS: Slept away. Daven didn’t even wake up.',
  'Daven’s snooze vortex pulled your pabble straight down to the seafloor.',
  'You disturbed Daven’s sacred nap. The river chose vengeance.',
  'Daven rolled over. Your stone was smothered instantly.',
  'Honk... shoooo... *sploosh*. Another pabble claimed by the nap.',
  'Daven is dreaming about winning while you are drowning pebbles.',
  'He is literally just sleeping and you still lost.',
];

export const DAVIN_SNORE_QUIPS: string[] = [
  'HONK... SHOOOO... Zzz...',
  'Zzz... pabble detected...',
  'SLEEPY PABBLE SWALLOWED!',
  'Daven rolls over...',
  'SNORE VORTEX ACTIVE!',
];
