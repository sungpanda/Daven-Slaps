import {
  LEVEL_2_START_METERS,
  LEVEL_2_START_Z,
  LEVEL_START_METERS,
  MAX_JUMP_HOLD_SEC,
  METERS_PER_WORLD_Z,
  SHORE_Y,
  STONE_PROFILES,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
} from './constants';
import { getWaterHeight } from './engine';
import { projectWorld } from './projection';
import { getWaterTextures } from './waterTexture';
import type { GameWorld, Hazard, Powerup } from './types';

interface BiomePalette {
  waterDeep: string;
  waterBase: string;
  waterShallow: string;
  waterFoam: string;
  waterSparkle: string;
  submergedDark: string;
  submergedLight: string;
  rockDark: string;
  rockMid: string;
  rockLight: string;
  shoreWet: string;
  shoreDry: string;
  shoreHighlight: string;
  grassDark: string;
  grassMid: string;
  grassLight: string;
}

const BIOME_PALETTES: Record<GameWorld['difficulty'], BiomePalette> = {
  CALM_CREEK: {
    waterDeep: '#04509c',
    waterBase: '#0673c4',
    waterShallow: '#0ea5e9',
    waterFoam: '#f8fafc',
    waterSparkle: '#7dd3fc',
    submergedDark: '#044282',
    submergedLight: '#148ee0',
    rockDark: '#334155',
    rockMid: '#64748b',
    rockLight: '#94a3b8',
    shoreWet: '#9b5f16',
    shoreDry: '#f6bd3a',
    shoreHighlight: '#fbd05b',
    grassDark: '#264a36',
    grassMid: '#376947',
    grassLight: '#548c58',
  },
  CHOPPY_BAY: {
    waterDeep: '#0d2e4a',
    waterBase: '#144166',
    waterShallow: '#1f5a85',
    waterFoam: '#e0f2fe',
    waterSparkle: '#93c5fd',
    submergedDark: '#0b263d',
    submergedLight: '#194d73',
    rockDark: '#1e293b',
    rockMid: '#475569',
    rockLight: '#94a3b8',
    shoreWet: '#475569',
    shoreDry: '#78716c',
    shoreHighlight: '#a8a29e',
    grassDark: '#1e3838',
    grassMid: '#2d524c',
    grassLight: '#437365',
  },
  RAGE_RAPIDS: {
    waterDeep: '#0f262b',
    waterBase: '#173a40',
    waterShallow: '#225259',
    waterFoam: '#fecdd3',
    waterSparkle: '#fda4af',
    submergedDark: '#0b1e22',
    submergedLight: '#1e484f',
    rockDark: '#1c1917',
    rockMid: '#44403c',
    rockLight: '#78716c',
    shoreWet: '#3b2d30',
    shoreDry: '#634f51',
    shoreHighlight: '#8a7375',
    grassDark: '#1c2b26',
    grassMid: '#2a4038',
    grassLight: '#3f5e52',
  },
  TEMPEST_REEF: {
    waterDeep: '#0c1836',
    waterBase: '#142a52',
    waterShallow: '#1e4578',
    waterFoam: '#fef3c7',
    waterSparkle: '#fcd34d',
    submergedDark: '#081126',
    submergedLight: '#1b3b6b',
    rockDark: '#18181b',
    rockMid: '#3f3f46',
    rockLight: '#71717a',
    shoreWet: '#292524',
    shoreDry: '#57534e',
    shoreHighlight: '#a8a29e',
    grassDark: '#1e293b',
    grassMid: '#334155',
    grassLight: '#475569',
  },
  DAVIN_SLUMBER: {
    waterDeep: '#180c2b',
    waterBase: '#2a164a',
    waterShallow: '#4a257d',
    waterFoam: '#fbcfe8',
    waterSparkle: '#f472b6',
    submergedDark: '#130824',
    submergedLight: '#391b61',
    rockDark: '#1c102a',
    rockMid: '#3c2254',
    rockLight: '#68408a',
    shoreWet: '#382046',
    shoreDry: '#5c386e',
    shoreHighlight: '#9b6aa8',
    grassDark: '#1a102b',
    grassMid: '#341f52',
    grassLight: '#553280',
  },
};

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function hash2D(a: number, b: number): number {
  let n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function drawPixelCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  filled = true
) {
  const irx = Math.max(1, Math.round(rx));
  const iry = Math.max(1, Math.round(ry));
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  ctx.fillStyle = color;

  if (filled) {
    for (let dy = -iry; dy <= iry; dy++) {
      const ratio = 1 - (dy * dy) / (iry * iry + 0.01);
      const span = Math.round(irx * Math.sqrt(Math.max(0, ratio)));
      ctx.fillRect(icx - span, icy + dy, span * 2 + 1, 1);
    }
  } else {
    const steps = Math.max(16, (irx + iry) * 5);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(icx + Math.cos(a) * irx);
      const y = Math.round(icy + Math.sin(a) * iry);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign = 'center'
) {
  ctx.font = 'bold 8px "Silkscreen", monospace';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const rx = Math.round(x);
  const ry = Math.round(y);
  ctx.fillStyle = '#090d16';
  ctx.fillText(text, rx + 1, ry + 1);
  ctx.fillText(text, rx - 1, ry);
  ctx.fillText(text, rx, ry - 1);
  ctx.fillStyle = color;
  ctx.fillText(text, rx, ry);
}

function drawRiverRock(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  rx: number,
  ry: number,
  pal: BiomePalette,
  foamPulse: number,
  hasMoss: boolean
) {
  // Subtle foam ring around rock base
  if (foamPulse > 0) {
    drawPixelCircle(ctx, sx, sy + 1, rx + 1 + foamPulse, ry + 1, pal.waterFoam, false);
  } else {
    drawPixelCircle(ctx, sx, sy + 1, rx + 1, ry + 1, pal.submergedDark, false);
  }
  // 3-tone pixel boulder
  drawPixelCircle(ctx, sx, sy, rx, ry, pal.rockDark, true);
  drawPixelCircle(ctx, sx, sy - 1, Math.max(1, rx - 1), Math.max(1, ry - 1), pal.rockMid, true);
  px(ctx, sx - Math.max(1, rx - 2), sy - Math.max(1, ry - 1), Math.max(2, rx), 1, pal.rockLight);
  if (hasMoss) {
    px(ctx, sx - 1, sy - Math.max(1, ry - 1), 2, 1, pal.grassLight);
  }
}

function drawBoundaryCone(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  pal: BiomePalette,
  bob: number,
  foamPulse: boolean
) {
  const cy = sy + bob;
  // Sea-foam ripple collar under floating cone
  drawPixelCircle(
    ctx,
    sx,
    sy + 2,
    foamPulse ? 6 : 5,
    foamPulse ? 4 : 3,
    foamPulse ? pal.waterFoam : pal.submergedLight,
    false
  );
  // Dark float base
  px(ctx, sx - 4, cy + 1, 8, 3, '#1e293b');
  px(ctx, sx - 3, cy + 1, 6, 2, '#334155');
  // Stepped orange traffic/boundary cone
  px(ctx, sx - 3, cy - 1, 6, 2, '#ea580c');
  px(ctx, sx - 2, cy - 3, 4, 2, '#f8fafc'); // white reflective stripe
  px(ctx, sx + 1, cy - 3, 1, 2, '#cbd5e1'); // shaded stripe edge
  px(ctx, sx - 2, cy - 5, 4, 2, '#f97316');
  px(ctx, sx - 1, cy - 7, 2, 2, '#fb923c');
  px(ctx, sx + 1, cy - 5, 1, 4, '#c2410c');
}

function drawBoundaryChain(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  time: number,
  seed: number
) {
  const steps = 7;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const sway = Math.round(Math.sin(t * Math.PI) * Math.sin(time * 2.4 + seed) * 1.4);
    const lx = Math.round(x1 + (x2 - x1) * t + sway);
    const ly = Math.round(y1 + (y2 - y1) * t);
    if (ly < -4 || ly > VIRTUAL_HEIGHT + 4) continue;
    // Alternating metal chain link pixels
    px(ctx, lx - 1, ly - 1, 2, 2, '#334155');
    px(ctx, lx - 1 + (s % 2), ly - 1, 1, 2, s % 2 === 0 ? '#cbd5e1' : '#94a3b8');
  }
}

function drawTopDownWater(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  pal: BiomePalette
) {
  const textures = getWaterTextures();

  const zMin = world.cameraZ - 35;
  const zMax = world.cameraZ + 195;
  const shorePlaneY = projectWorld(0, 0, 0, world.cameraZ).waterPlaneY;

  // 1. Caustic ocean depth backdrop matching the uploaded water texture
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  if (textures) {
    ctx.drawImage(textures.baseCanvas, 0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    if (world.difficulty === 'CHOPPY_BAY') {
      ctx.fillStyle = 'rgba(10, 32, 64, 0.32)';
      ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    } else if (world.difficulty === 'RAGE_RAPIDS') {
      ctx.fillStyle = 'rgba(8, 36, 42, 0.42)';
      ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    } else if (world.difficulty === 'TEMPEST_REEF') {
      ctx.fillStyle = 'rgba(12, 20, 56, 0.48)';
      ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    }
  } else {
    ctx.fillStyle = pal.waterBase;
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    ctx.fillStyle = pal.waterDeep;
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, Math.round(VIRTUAL_HEIGHT * 0.32));
    ctx.fillStyle = pal.waterShallow;
    ctx.fillRect(0, Math.round(VIRTUAL_HEIGHT * 0.76), VIRTUAL_WIDTH, Math.round(VIRTUAL_HEIGHT * 0.24));
  }
  ctx.restore();
  ctx.imageSmoothingEnabled = false;

  // 2. Underwater seabed depth: dark shoal pockets & submerged stones beneath the water surface
  const bedCellZ = 14;
  const firstBedZ = Math.floor(Math.max(8, zMin) / bedCellZ) * bedCellZ;
  for (let z = firstBedZ; z <= zMax; z += bedCellZ) {
    const cellRow = Math.floor(z / bedCellZ);
    const pRow = projectWorld(0, 0, z, world.cameraZ);
    if (pRow.waterPlaneY < -14 || pRow.waterPlaneY > VIRTUAL_HEIGHT + 14) continue;

    for (let col = -4; col <= 4; col++) {
      const r1 = hash2D(col * 19 + 7, cellRow * 37 + 13);
      const r2 = hash2D(col * 31 + 5, cellRow * 17 + 11);
      const wx = col * 22 + (r2 - 0.5) * 18;
      const wz = z + (r1 - 0.5) * 8;
      const sp = projectWorld(wx, 0, wz, world.cameraZ);
      if (sp.screenX < -10 || sp.screenX > VIRTUAL_WIDTH + 10) continue;

      if (r1 > 0.72) {
        // Soft deep seabed hollow shadow
        drawPixelCircle(
          ctx,
          sp.screenX,
          sp.waterPlaneY,
          7 + Math.round(r2 * 5),
          4 + Math.round(r1 * 2),
          'rgba(2, 42, 92, 0.24)',
          true
        );
      } else if (r1 > 0.34) {
        // Submerged sea stones seen through translucent blue water
        const rx = r1 > 0.58 ? 3 : 2;
        const ry = r2 > 0.55 ? 2 : 1;
        drawPixelCircle(ctx, sp.screenX + 1, sp.waterPlaneY + 1, rx, ry, 'rgba(2, 40, 88, 0.36)', true);
        drawPixelCircle(ctx, sp.screenX, sp.waterPlaneY, rx, ry, 'rgba(14, 108, 186, 0.32)', true);
      }
    }
  }

  // 3. Dual-layer scrolling caustic light webs refracting over the seabed
  if (textures) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const tile = textures.causticTile;
    const tw = tile.width;
    const th = tile.height;

    const y1 = (((shorePlaneY + world.time * 6) % th) + th) % th;
    const x1 = (((Math.sin(world.time * 0.55) * 10 + world.time * 2.5) % tw) + tw) % tw;
    ctx.globalAlpha = 0.52;
    for (let y = y1 - th; y < VIRTUAL_HEIGHT; y += th) {
      for (let x = x1 - tw; x < VIRTUAL_WIDTH; x += tw) {
        ctx.drawImage(tile, x, y);
      }
    }

    // Secondary finer caustic shimmer moving slightly slower for underwater parallax depth
    const tw2 = Math.round(tw * 0.65);
    const th2 = Math.round(th * 0.65);
    const y2 = (((shorePlaneY * 0.85 - world.time * 4.5) % th2) + th2) % th2;
    const x2 = (((Math.cos(world.time * 0.45) * 12 - world.time * 3) % tw2) + tw2) % tw2;
    ctx.globalAlpha = 0.3;
    for (let y = y2 - th2; y < VIRTUAL_HEIGHT; y += th2) {
      for (let x = x2 - tw2; x < VIRTUAL_WIDTH; x += tw2) {
        ctx.drawImage(tile, x, y, tw2, th2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  // 4. Little rolling waves & sunlit surface glints across the sea
  const waveStepZ = 15;
  const firstWaveZ = Math.floor(Math.max(10, zMin) / waveStepZ) * waveStepZ;
  for (let z = firstWaveZ; z <= zMax; z += waveStepZ) {
    const wRow = Math.floor(z / waveStepZ);
    const waveCount = world.difficulty === 'CALM_CREEK' ? 4 : world.difficulty === 'CHOPPY_BAY' ? 6 : 8;

    for (let i = 0; i < waveCount; i++) {
      const h1 = hash2D(wRow * 23 + i, i * 47 + 7);
      const h2 = hash2D(i * 31 + 3, wRow * 53 + 11);
      const wx = -92 + h1 * 184 + Math.sin(world.time * 0.9 + wRow + i) * 5;
      // Gently drift little waves toward shore (-z)
      const driftZ = ((world.time * (world.difficulty === 'CALM_CREEK' ? 5 : 9) + h2 * waveStepZ) % waveStepZ);
      const wz = z - driftZ;
      if (wz < 6) continue;

      const wp = projectWorld(wx, 0, wz, world.cameraZ);
      const sx = Math.round(wp.screenX);
      const sy = Math.round(wp.waterPlaneY);
      if (sy < -6 || sy > VIRTUAL_HEIGHT + 6) continue;

      const life = Math.sin((driftZ / waveStepZ) * Math.PI);
      if (life < 0.08) continue;

      const arcW = 6 + Math.round(h2 * 8);
      const halfW = Math.floor(arcW * 0.5);

      ctx.save();
      ctx.globalAlpha = life * 0.85;

      // Subtle dark wave trough below crest for 3D depth
      px(ctx, sx - halfW + 1, sy + 1, arcW - 2, 1, 'rgba(2, 46, 102, 0.42)');
      px(ctx, sx - halfW + 2, sy + 2, Math.max(2, arcW - 4), 1, 'rgba(2, 46, 102, 0.25)');

      // Curved cyan-white little wave crest
      px(ctx, sx - halfW, sy, arcW, 1, pal.waterSparkle);
      px(ctx, sx - halfW + 2, sy - 1, Math.max(2, arcW - 4), 1, '#bae6fd');

      // Occasional tiny whitecap / sunlight sparkle glint
      if (life > 0.5 && Math.sin(world.time * 3.4 + wRow * 1.7 + i * 2.3) > 0.45) {
        px(ctx, sx - 1, sy - 1, 2, 1, '#ffffff');
      }

      ctx.restore();
    }
  }

  // Level 1 boundary rocks, cones/chains, and 5m distance markers (only when starting in Level 1)
  if (world.startLevel === 1) {
    const rockStepZ = 22;
    const firstRockZ = Math.floor(Math.max(14, zMin) / rockStepZ) * rockStepZ;
    const maxL1Z = Math.min(zMax, LEVEL_2_START_Z);
    for (let z = firstRockZ; z < maxL1Z; z += rockStepZ) {
      const rIdx = Math.floor(z / rockStepZ);
      const leftRoll = hash2D(rIdx, 101);
      const rightRoll = hash2D(rIdx, 202);
      const foamPulse = Math.sin(world.time * 3.1 + rIdx) > 0.15 ? 1 : 0;

      if (leftRoll > 0.45) {
        const wx = -96 + (leftRoll - 0.5) * 14;
        const rp = projectWorld(wx, 0, z + (leftRoll - 0.5) * 6, world.cameraZ);
        if (rp.waterPlaneY > -10 && rp.waterPlaneY < VIRTUAL_HEIGHT + 10) {
          drawRiverRock(ctx, rp.screenX, rp.waterPlaneY, 4, 3, pal, foamPulse, false);
        }
      }

      if (rightRoll > 0.45) {
        const wx = 96 - (rightRoll - 0.5) * 14;
        const rp = projectWorld(wx, 0, z + (rightRoll - 0.5) * 6, world.cameraZ);
        if (rp.waterPlaneY > -10 && rp.waterPlaneY < VIRTUAL_HEIGHT + 10) {
          drawRiverRock(ctx, rp.screenX, rp.waterPlaneY, 4, 3, pal, foamPulse, false);
        }
      }
    }

    const coneStepZ = 42;
    const firstConeZ = Math.max(12, Math.floor(zMin / coneStepZ) * coneStepZ);
    const maxConeZ = Math.min(zMax + coneStepZ, LEVEL_2_START_Z);
    for (let z = firstConeZ; z <= maxConeZ; z += coneStepZ) {
      const cIdx = Math.floor(z / coneStepZ);
      const bob = Math.round(Math.sin(world.time * 3.2 + cIdx * 0.9) * 1);
      const nextBob = Math.round(Math.sin(world.time * 3.2 + (cIdx + 1) * 0.9) * 1);
      const foamPulse = Math.sin(world.time * 2.8 + cIdx) > 0.1;

      const pL = projectWorld(-88, 0, z, world.cameraZ);
      const pR = projectWorld(88, 0, z, world.cameraZ);

      if (z + coneStepZ <= maxConeZ) {
        const pLNext = projectWorld(-88, 0, z + coneStepZ, world.cameraZ);
        const pRNext = projectWorld(88, 0, z + coneStepZ, world.cameraZ);
        drawBoundaryChain(ctx, pL.screenX, pL.waterPlaneY + bob, pLNext.screenX, pLNext.waterPlaneY + nextBob, world.time, cIdx);
        drawBoundaryChain(ctx, pR.screenX, pR.waterPlaneY + bob, pRNext.screenX, pRNext.waterPlaneY + nextBob, world.time, cIdx + 17);
      }

      if (pL.waterPlaneY > -12 && pL.waterPlaneY < VIRTUAL_HEIGHT + 12) {
        drawBoundaryCone(ctx, pL.screenX, pL.waterPlaneY, pal, bob, foamPulse);
      }
      if (pR.waterPlaneY > -12 && pR.waterPlaneY < VIRTUAL_HEIGHT + 12) {
        drawBoundaryCone(ctx, pR.screenX, pR.waterPlaneY, pal, bob, foamPulse);
      }
    }

    const markerStepMeters = 5;
    const minMeters = Math.max(
      markerStepMeters,
      Math.ceil((zMin * METERS_PER_WORLD_Z) / markerStepMeters) * markerStepMeters
    );
    const maxMeters = Math.min(
      LEVEL_2_START_METERS,
      Math.floor((zMax * METERS_PER_WORLD_Z) / markerStepMeters) * markerStepMeters
    );
    for (let m = minMeters; m <= maxMeters; m += markerStepMeters) {
      const z = m / METERS_PER_WORLD_Z;
      const p = projectWorld(-88, 0, z, world.cameraZ);
      const sy = Math.round(p.waterPlaneY);
      if (sy < 8 || sy > VIRTUAL_HEIGHT - 8) continue;
      drawPixelText(ctx, `${m}m`, p.screenX + 10, sy - 6, '#e2e8f0', 'left');
    }
  }

  // Level 2 Toxic Trash Piles are spaced out along alternating banks.
  const mapOffsetZ =
    world.mode === 'LEVELS' && world.startLevel > 1
      ? (LEVEL_START_METERS[world.startLevel] ?? 0) / METERS_PER_WORLD_Z
      : 0;
  const wreckBorderZ1 = LEVEL_2_START_Z;
  const wreckBorderZ2 = LEVEL_START_METERS[3] / METERS_PER_WORLD_Z;
  const mapZMin = zMin + mapOffsetZ;
  const mapZMax = zMax + mapOffsetZ;
  if (mapZMin <= wreckBorderZ2 && mapZMax >= wreckBorderZ1) {
    const pileStepZ = 54;
    const startPZ = Math.max(wreckBorderZ1, Math.floor(mapZMin / pileStepZ) * pileStepZ);
    const endPZ = Math.min(wreckBorderZ2, mapZMax);
    for (let mapZ = startPZ; mapZ <= endPZ; mapZ += pileStepZ) {
      const z = mapZ - mapOffsetZ;
      const pIdx = Math.floor(mapZ / pileStepZ);
      const leftH = hash2D(pIdx, 333);
      const rightH = hash2D(pIdx, 444);

      const useLeft = pIdx % 2 === 0;
      const pL = projectWorld(-88 + (leftH - 0.5) * 6, 0, z, world.cameraZ);
      const pR = projectWorld(88 + (rightH - 0.5) * 6, 0, z, world.cameraZ);
      const p = useLeft ? pL : pR;

      if (p.waterPlaneY > -20 && p.waterPlaneY < VIRTUAL_HEIGHT + 20) {
        drawBoundaryCone(ctx, p.screenX, p.waterPlaneY, pal, 0, true);
      }
    }
  }
}

let davinImage: HTMLImageElement | null = null;
let davinImageLoaded = false;

function getDavinImage(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!davinImage) {
    davinImage = new Image();
    davinImage.onload = () => {
      davinImageLoaded = true;
    };
    davinImage.src = '/assets/davin.webp';
  }
  return davinImageLoaded ? davinImage : null;
}

function drawDavinSleeping(ctx: CanvasRenderingContext2D, world: GameWorld) {
  const davin = world.davin;
  if (!davin || !davin.active) return;

  const waterY = getWaterHeight(world, davin.x, davin.z);
  const p = projectWorld(davin.x, waterY * 0.4, davin.z, world.cameraZ);
  const sx = Math.round(p.screenX);
  const sy = Math.round(p.screenY);

  if (sy < -40 || sy > VIRTUAL_HEIGHT + 40) return;

  const bob = Math.round(Math.sin(world.time * 2.6) * 1.5);
  const breath = 1 + Math.sin(davin.breathPhase) * 0.06;

  // Daven's chase marker stretches across the whole playable lane.
  ctx.fillStyle = 'rgba(244, 114, 182, 0.28)';
  ctx.fillRect(8, sy + bob - 2, VIRTUAL_WIDTH - 16, 5);
  for (let x = 12; x < VIRTUAL_WIDTH - 12; x += 12) {
    px(ctx, x, sy + bob - 4, 5, 2, '#fbcfe8');
  }

  // 1. Water ripple base under Daven
  drawPixelCircle(ctx, sx, sy + bob + 3, 22, 11, 'rgba(244, 114, 182, 0.45)', false);
  drawPixelCircle(ctx, sx, sy + bob + 3, 18, 9, 'rgba(251, 207, 232, 0.6)', false);

  // 2. Plush floating sleeping cushion / water lily pillow under Davin
  drawPixelCircle(ctx, sx, sy + bob + 1, 16, 9, '#f472b6', true);
  drawPixelCircle(ctx, sx, sy + bob + 1, 14, 7, '#fbcfe8', true);
  drawPixelCircle(ctx, sx, sy + bob, 12, 6, '#fff1f2', true);

  // 3. Render Daven sprite
  const img = getDavinImage();
  const dWidth = Math.round(26 * breath);
  const dHeight = Math.round(26 * breath);
  const dx = sx - Math.round(dWidth / 2);
  const dy = sy + bob - Math.round(dHeight / 2) - 3;

  if (img) {
    ctx.drawImage(img, dx, dy, dWidth, dHeight);
  } else {
    // Pixel fallback while loading
    drawPixelCircle(ctx, sx, dy + 10, 8, 8, '#b45309', true); // spines
    drawPixelCircle(ctx, sx, dy + 11, 6, 6, '#fed7aa', true); // belly
    px(ctx, sx - 3, dy + 9, 2, 1, '#1e293b'); // closed eyes
    px(ctx, sx + 2, dy + 9, 2, 1, '#1e293b');
    px(ctx, sx - 1, dy + 11, 2, 1, '#ea580c'); // cute nose
    // Little paws up
    px(ctx, sx - 6, dy + 7, 2, 2, '#fed7aa');
    px(ctx, sx + 5, dy + 7, 2, 2, '#fed7aa');
  }

  // 4. Snore Shockwave rings when active
  if (davin.snoreWaveAlpha > 0.05) {
    const waveR = Math.round(davin.snoreWaveRadius);
    const alpha = Math.max(0, Math.min(1, davin.snoreWaveAlpha));
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(244, 114, 182, ${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, waveR, Math.round(waveR * 0.48), 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(192, 132, 252, ${(alpha * 0.7).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, Math.max(2, waveR - 6), Math.round(Math.max(2, waveR - 6) * 0.48), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (davin.throwTimer > 0) {
    drawPixelText(ctx, 'THROW!', sx, sy - 20, '#fb7185');
    return;
  }

  // 5. Rising "Zzz" sleep letters
  for (let i = 0; i < 3; i++) {
    const zAge = (world.time * 1.8 + i * 1.1) % 3.0;
    const zX = sx + 12 + Math.sin(world.time * 3 + i) * 4 + i * 4;
    const zY = sy - 10 - zAge * 9;
    const zAlpha = Math.max(0, 1 - zAge / 3.0);
    if (zY > 0 && zAlpha > 0.1) {
      drawPixelText(ctx, i === 0 ? 'Z' : 'z', zX, zY, `rgba(244, 114, 182, ${zAlpha.toFixed(2)})`);
    }
  }

  // 6. Nameplate with rage bait badge
  drawPixelText(ctx, 'DAVEN [Zzz]', sx, sy + bob + 13, '#fbcfe8', 'center');
}

function drawHazardTopDown(ctx: CanvasRenderingContext2D, h: Hazard, world: GameWorld) {
  const waterY = getWaterHeight(world, h.x, h.z);
  const p = projectWorld(h.x, waterY * 0.4, h.z, world.cameraZ);
  const sx = Math.round(p.screenX);
  const sy = Math.round(p.screenY);

  if (sy < -16 || sy > VIRTUAL_HEIGHT + 16) return;

  if (h.kind === 'SNORE_BUBBLE') {
    const bob = Math.round(Math.sin(world.time * 4 + h.id) * 1.5);
    drawPixelCircle(ctx, sx, sy + bob, 5, 5, 'rgba(244, 114, 182, 0.5)', false);
    drawPixelCircle(ctx, sx, sy + bob, 4, 4, 'rgba(251, 207, 232, 0.35)', true);
    px(ctx, sx - 2, sy + bob - 2, 2, 1, '#ffffff');
    return;
  }

  if (h.kind === 'DUCK') {
    const dir = h.vx >= 0 ? 1 : -1;
    // Water V-wake trailing behind swim direction
    px(ctx, sx - dir * 8, sy - 2, 3, 1, '#bae6fd');
    px(ctx, sx - dir * 8, sy + 2, 3, 1, '#bae6fd');
    // Top-down oval body
    drawPixelCircle(ctx, sx, sy, 5, 3, h.angryTimer > 0 ? '#fca5a5' : '#f8fafc', true);
    // Wing detail
    px(ctx, sx - 2, sy - 2, 4, 1, '#cbd5e1');
    px(ctx, sx - 2, sy + 1, 4, 1, '#cbd5e1');
    // Top-down green head & orange bill
    const hx = sx + dir * 4;
    drawPixelCircle(ctx, hx, sy, 2, 2, '#15803d', true);
    px(ctx, hx + dir * 2, sy - 1, 2, 2, '#f59e0b');
    if (h.angryTimer > 0) {
      drawPixelText(ctx, 'QUACK!', sx, sy - 10, '#fde047');
    }
  } else if (h.kind === 'LOG') {
    // Top-down floating timber with foam rim
    px(ctx, sx - 12, sy - 3, 24, 6, '#bae6fd');
    px(ctx, sx - 11, sy - 2, 22, 4, '#5c3a21');
    px(ctx, sx - 10, sy - 1, 20, 2, '#8b5a2b');
    px(ctx, sx - 5, sy - 2, 3, 1, '#451a03');
    px(ctx, sx + 4, sy + 1, 4, 1, '#451a03');
  } else if (h.kind === 'WRECKAGE') {
    // Floating Level 2 cone hazard, kept visually consistent with the course markers.
    const bob = Math.round(Math.sin(world.time * 3 + h.id) * 1);
    drawBoundaryCone(ctx, sx, sy, BIOME_PALETTES[world.difficulty], bob, true);
  } else {
    // Top-down harbor buoy ring + beacon light
    const bob = Math.round(Math.sin(world.time * 4 + h.id) * 1);
    drawPixelCircle(ctx, sx, sy + bob, 6, 6, '#bae6fd', false);
    drawPixelCircle(ctx, sx, sy + bob, 5, 5, '#dc2626', true);
    drawPixelCircle(ctx, sx, sy + bob, 3, 3, '#f8fafc', true);
    drawPixelCircle(
      ctx,
      sx,
      sy + bob,
      1,
      1,
      Math.sin(world.time * 5 + h.id) > 0.3 ? '#fde047' : '#991b1b',
      true
    );
  }
}

function drawPowerupTopDown(ctx: CanvasRenderingContext2D, pUp: Powerup, world: GameWorld) {
  if (pUp.collected) return;
  const waterY = getWaterHeight(world, pUp.x, pUp.z);
  const p = projectWorld(pUp.x, waterY * 0.4, pUp.z, world.cameraZ);
  const sx = Math.round(p.screenX);
  const sy = Math.round(p.screenY);

  if (sy < -18 || sy > VIRTUAL_HEIGHT + 18) return;

  const bob = Math.round(Math.sin(world.time * 4.5 + pUp.bobPhase) * 1.3);

  if (pUp.kind === 'SPRING') {
    // Glowing water ring + wooden/aqua float pad + coiled golden spring
    drawPixelCircle(ctx, sx, sy + 1, 9, 6, '#7dd3fc', false);
    px(ctx, sx - 7, sy - 2 + bob, 14, 5, '#0369a1');
    px(ctx, sx - 6, sy - 1 + bob, 12, 3, '#38bdf8');
    // Coiled metal/gold spring rings
    px(ctx, sx - 4, sy - 3 + bob, 8, 2, '#94a3b8');
    px(ctx, sx - 3, sy - 5 + bob, 6, 2, '#e2e8f0');
    px(ctx, sx - 5, sy - 7 + bob, 10, 2, '#fde047');
    px(ctx, sx - 4, sy - 8 + bob, 8, 1, '#ffffff');
  } else if (pUp.kind === 'POWER_BUOY') {
    // Pulsing emerald/cyan ripple ring + glowing Power Buoy
    const pulseR = Math.sin(world.time * 5 + pUp.bobPhase) > 0 ? 9 : 8;
    drawPixelCircle(ctx, sx, sy + 1, pulseR, pulseR - 2, '#6ee7b7', false);
    drawPixelCircle(ctx, sx, sy + bob, 6, 6, '#059669', true);
    drawPixelCircle(ctx, sx, sy + bob, 4, 4, '#34d399', true);
    drawPixelCircle(ctx, sx, sy + bob, 2, 2, '#fde047', true);
    px(ctx, sx - 1, sy - 2 + bob, 2, 2, '#ffffff');
  } else {
    // Floating Bamboo Bundle pickup
    drawPixelCircle(ctx, sx, sy + 1, 7, 5, '#a7f3d0', false);
    // 3 green segmented bamboo stalks tied with gold rope
    px(ctx, sx - 5, sy - 3 + bob, 10, 2, '#16a34a');
    px(ctx, sx - 5, sy - 1 + bob, 10, 2, '#22c55e');
    px(ctx, sx - 5, sy + 1 + bob, 10, 2, '#15803d');
    px(ctx, sx - 1, sy - 3 + bob, 2, 6, '#facc15'); // gold tie band
    px(ctx, sx - 3, sy - 3 + bob, 1, 6, '#14532d'); // bamboo node
    px(ctx, sx + 2, sy - 3 + bob, 1, 6, '#14532d'); // bamboo node
  }
}

function drawStoneAndTimingRingTopDown(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  isMenu: boolean
) {
  const stone = world.stone;
  if (!stone.alive) return;

  const profile = STONE_PROFILES[world.stoneKind];
  const waterY = getWaterHeight(world, stone.x, stone.z);
  const waterProj = projectWorld(stone.x, waterY * 0.3, stone.z, world.cameraZ);
  const stoneProj = projectWorld(stone.x, stone.y, stone.z, world.cameraZ);

  const gx = Math.round(waterProj.screenX);
  const gy = Math.round(waterProj.screenY);
  const sx = Math.round(stoneProj.screenX);
  const sy = Math.round(stoneProj.screenY);

  // Water shadow directly below stone
  const shadowR = Math.max(2, Math.round(profile.radius * 0.95));
  drawPixelCircle(ctx, gx, gy, shadowR, shadowR, '#092033', true);

  // Top-down circular Timing Ring centered on the shadow (hidden in calm menu demo)
  if (!isMenu && stone.vy < 0 && stone.tti < 0.55) {
    const ratio = Math.max(0, Math.min(1, stone.tti / 0.5));
    const ringR = Math.max(shadowR + 2, Math.round(shadowR + 2 + ratio * 15));

    let ringColor = '#7dd3fc';
    if (stone.inPerfectWindow) {
      ringColor = '#fde047';
    } else if (stone.inSkipWindow) {
      ringColor = '#ffffff';
    }

    drawPixelCircle(ctx, gx, gy, ringR, ringR, ringColor, false);

    if (stone.inSkipWindow) {
      px(ctx, gx - ringR - 3, gy, 2, 1, ringColor);
      px(ctx, gx + ringR + 2, gy, 2, 1, ringColor);
      px(ctx, gx, gy - ringR - 3, 1, 2, ringColor);
      px(ctx, gx, gy + ringR + 2, 1, 2, ringColor);
      if (stone.inPerfectWindow) {
        drawPixelCircle(ctx, gx, gy, Math.max(2, ringR - 1), Math.max(2, ringR - 1), '#ffffff', false);
      }
    }
  } else if (!isMenu && stone.vy >= 0) {
    drawPixelCircle(ctx, gx, gy, shadowR + 3, shadowR + 3, '#38bdf8', false);
  }

  // Top-down Stone Sprite (scales up slightly with altitude + spins)
  const altScale = Math.min(1.45, stoneProj.scale);
  const r = Math.max(2, Math.round(profile.radius * altScale));
  const spinSquash = Math.max(0.65, Math.abs(Math.cos(stone.rotation)));
  const rx = r;
  const ry = Math.max(2, Math.round(r * (world.stoneKind === 'THE_BRICK' ? 0.72 : spinSquash)));

  const wobbleX = stone.flinchTimer > 0 ? Math.round(Math.sin(world.time * 60) * 2) : 0;
  const light = stone.flinchTimer > 0 ? '#fb923c' : profile.colorLight;
  const mid = stone.flinchTimer > 0 ? '#ea580c' : profile.colorMid;
  const dark = stone.flinchTimer > 0 ? '#7c2d12' : profile.colorDark;

  drawPixelCircle(ctx, sx + wobbleX, sy, rx, ry, dark, true);
  drawPixelCircle(ctx, sx + wobbleX, sy - 1, Math.max(1, rx - 1), Math.max(1, ry - 1), mid, true);
  px(ctx, sx + wobbleX - Math.max(1, rx - 2), sy - Math.max(1, ry - 1), Math.max(2, rx), 1, light);

  // Glowing Buoyancy Shield aura when protected by a Power Buoy
  if (!isMenu && world.shieldCharges > 0) {
    const pulse = Math.sin(world.time * 8) > 0 ? 1 : 0;
    drawPixelCircle(
      ctx,
      sx + wobbleX,
      sy,
      rx + 3 + pulse,
      ry + 3 + pulse,
      world.shieldCharges > 1 ? '#fde047' : '#34d399',
      false
    );
  }

  // Miniature Jump-Hold Boost Meter next to stone while holding SPACE after a skip
  if (!isMenu && stone.isHoldingJump) {
    const ratio = Math.min(1, stone.jumpHoldTimer / MAX_JUMP_HOLD_SEC);
    const barX = sx + rx + 4;
    const barY = sy - 7;
    const barH = 12;
    const fillH = Math.max(1, Math.round(ratio * barH));
    px(ctx, barX - 1, barY - 1, 5, barH + 2, '#090d16');
    px(ctx, barX, barY, 3, barH, '#1e293b');
    px(ctx, barX, barY + barH - fillH, 3, fillH, ratio > 0.7 ? '#fde047' : '#38bdf8');
  }
}

function drawBeachCrabs(ctx: CanvasRenderingContext2D, world: GameWorld) {
  for (const crab of world.crabs) {
    const p = projectWorld(crab.x, 0, crab.z, world.cameraZ);
    const sx = Math.round(p.screenX);
    const sy = Math.round(p.waterPlaneY);
    if (sy < 0 || sy > VIRTUAL_HEIGHT + 8) continue;

    const isMoving = crab.pauseTimer <= 0;
    const walkStep = isMoving ? Math.floor(world.time * 14 + crab.phaseOffset) % 2 : 0;
    const clawSnap = !isMoving && Math.sin(world.time * 9 + crab.phaseOffset) > 0.35 ? 1 : 0;

    // Sand shadow
    px(ctx, sx - 3, sy + 2, 6, 1, '#9b5f16');

    // Scuttling legs (3 per side)
    const legColor = '#9a3412';
    const legOffset = walkStep === 0 ? 0 : 1;
    px(ctx, sx - 4, sy - 1 + legOffset, 1, 1, legColor);
    px(ctx, sx - 5, sy + 1 - legOffset, 2, 1, legColor);
    px(ctx, sx - 4, sy + 2 + legOffset, 1, 1, legColor);

    px(ctx, sx + 3, sy - 1 + (1 - legOffset), 1, 1, legColor);
    px(ctx, sx + 3, sy + 1 - (1 - legOffset), 2, 1, legColor);
    px(ctx, sx + 3, sy + 2 + (1 - legOffset), 1, 1, legColor);

    // Shell body
    px(ctx, sx - 3, sy - 1, 6, 3, crab.color);
    px(ctx, sx - 2, sy - 2, 4, 1, crab.color);
    px(ctx, sx - 1, sy - 1, 2, 1, '#fed7aa');

    // Pincers facing up toward water (-y)
    px(ctx, sx - 4, sy - 3 - clawSnap, 2, 2, crab.color);
    px(ctx, sx + 2, sy - 3 - clawSnap, 2, 2, crab.color);

    // Tiny eyes
    px(ctx, sx - 2, sy - 2, 1, 1, '#0f172a');
    px(ctx, sx + 1, sy - 2, 1, 1, '#0f172a');
  }
}

function drawShoreAndPlayerTopDown(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  pal: BiomePalette,
  isMenu: boolean
) {
  const shoreProj = projectWorld(0, 0, 0, world.cameraZ);
  const shoreY = Math.round(shoreProj.waterPlaneY);

  // If shore has scrolled completely below viewport, skip drawing it
  if (shoreY > VIRTUAL_HEIGHT + 50) return;

  // Bright golden-yellow sandy ground base
  px(ctx, 0, shoreY + 1, VIRTUAL_WIDTH, VIRTUAL_HEIGHT - shoreY + 55, pal.shoreDry);

  // Crisp pixel sand grain stipple texture across the beach (calm sunny yellow feel)
  const sandBottom = Math.min(VIRTUAL_HEIGHT + 10, shoreY + 75);
  const grainDark = world.difficulty === 'CALM_CREEK' ? '#e09b24' : pal.shoreWet;
  for (let gy = Math.max(0, shoreY + 3); gy < sandBottom; gy += 2) {
    const worldRow = Math.round(gy - shoreY);
    for (let gx = 0; gx < VIRTUAL_WIDTH; gx += 2) {
      const h = hash2D(gx * 7 + 3, worldRow * 13 + 5);
      const rippleDiag = Math.sin((gx + worldRow * 1.5) * 0.16);
      if (h > 0.85 || (rippleDiag > 0.78 && h > 0.65)) {
        px(ctx, gx, gy, 1, 1, grainDark);
      } else if (h < 0.12) {
        px(ctx, gx, gy, 1, 1, pal.shoreHighlight);
      }
    }
  }

  // Rolling textured surf waves touching the bright yellow beach
  const tideCycle = Math.sin(world.time * 1.55);
  const tidePhase = (tideCycle + 1) * 0.5; // 0 (receding) -> 1 (surging up beach)
  const wetMidColor = world.difficulty === 'CALM_CREEK' ? '#c78322' : pal.shoreWet;
  const surfTurquoise = world.difficulty === 'CALM_CREEK' ? '#0ea5e9' : pal.waterShallow;
  const surfCrest = world.difficulty === 'CALM_CREEK' ? '#38bdf8' : pal.waterSparkle;

  for (let x = 0; x < VIRTUAL_WIDTH; x++) {
    const swell =
      Math.sin(x * 0.032 + 0.4) * 3.2 +
      Math.sin(x * 0.075 + world.time * 1.2) * 1.6 +
      Math.cos(x * 0.13 - world.time * 1.7) * 0.9;

    // Peak high-tide wet sand line + current surging wave front
    const wetLimitY = Math.round(shoreY + 6 + swell * 0.85);
    const waveFrontY = Math.round(shoreY - 2 + tidePhase * 6.5 + swell);

    // 1. Textured soaking wet-sand border & receding drainage streaks
    if (wetLimitY >= waveFrontY) {
      for (let wy = waveFrontY; wy <= wetLimitY; wy++) {
        const depth = wy - waveFrontY;
        const n = hash2D(x * 11, Math.round(wy - shoreY) * 17);
        if (depth < 2) {
          px(ctx, x, wy, 1, 1, pal.shoreWet);
        } else if (wy < wetLimitY - 1) {
          px(ctx, x, wy, 1, 1, n > 0.65 ? wetMidColor : pal.shoreWet);
        } else {
          px(ctx, x, wy, 1, 1, n > 0.45 ? wetMidColor : grainDark);
        }
      }
    }

    // 2. Turquoise shallow surf sheet & textured foam bubbles behind wave front
    const surfDepth = 7 + Math.round(tidePhase * 4);
    for (let dy = 0; dy < surfDepth; dy++) {
      const sy = waveFrontY - dy;
      if (dy <= 1) {
        // Crisp bright white breaking foam lip
        const edgeN = hash2D(x * 5, dy + Math.floor(world.time * 5));
        px(ctx, x, sy, 1, 1, dy === 0 || edgeN > 0.25 ? pal.waterFoam : '#d6f4f8');
      } else if (dy < 6) {
        // Lacy cellular surf foam pockets with turquoise water peeking through
        const cell =
          Math.sin(x * 0.34 + dy * 0.45 + world.time * 1.4) +
          Math.cos(dy * 0.6 - x * 0.22);
        if (cell > 0.72) {
          px(ctx, x, sy, 1, 1, pal.waterFoam);
        } else if (cell > 0.35) {
          px(ctx, x, sy, 1, 1, '#d6f4f8');
        } else {
          px(ctx, x, sy, 1, 1, surfCrest);
        }
      } else {
        // Textured turquoise wave tail blending back into coastal sea
        const tailWave = Math.sin(x * 0.12 - dy * 0.4 + world.time * 2.1);
        px(ctx, x, sy, 1, 1, tailWave > 0.3 ? surfCrest : surfTurquoise);
      }
    }

    // Occasional stray foam droplets on the wet sand
    if (tidePhase > 0.35 && hash2D(x * 19, Math.floor(world.time * 2)) > 0.94) {
      px(ctx, x, waveFrontY + 2, 1, 1, pal.waterFoam);
    }
  }

  // Calm beach vibes props on the sandy land (shells, starfish, beach towel)
  const towelProj = projectWorld(-66, 0, -24, world.cameraZ);
  const tx0 = Math.round(towelProj.screenX);
  const ty0 = Math.round(towelProj.waterPlaneY);
  if (ty0 < VIRTUAL_HEIGHT + 16) {
    // Striped coral & cream beach towel + tiny sun hat/cooler corner
    px(ctx, tx0 - 11, ty0 - 6, 22, 13, '#fef3c7');
    px(ctx, tx0 - 11, ty0 - 3, 22, 3, '#fb7185');
    px(ctx, tx0 - 11, ty0 + 2, 22, 3, '#14b8a6');
    // Small straw sun-hat on towel
    drawPixelCircle(ctx, tx0 + 5, ty0 - 1, 4, 3, '#fcd34d', true);
    drawPixelCircle(ctx, tx0 + 5, ty0 - 1, 2, 2, '#f59e0b', true);
  }

  // Seashells & starfish scattered on sand
  const shells = [
    { x: -38, z: -15, c: '#fecdd3' },
    { x: -12, z: -26, c: '#fef9c3' },
    { x: 18, z: -11, c: '#fbcfe8' },
    { x: 74, z: -26, c: '#fed7aa' },
  ];
  for (const s of shells) {
    const sp = projectWorld(s.x, 0, s.z, world.cameraZ);
    px(ctx, sp.screenX, sp.waterPlaneY, 3, 2, s.c);
    px(ctx, sp.screenX + 1, sp.waterPlaneY, 1, 1, '#ffffff');
  }
  // Cute coral starfish
  const starP = projectWorld(28, 0, -20, world.cameraZ);
  px(ctx, starP.screenX, starP.waterPlaneY - 1, 1, 3, '#fb7185');
  px(ctx, starP.screenX - 1, starP.waterPlaneY, 3, 1, '#fb7185');

  // Pebbles & shore grass along bottom beach
  const pebbles = [28, 60, 96, 126, 206, 242, 282, 302];
  for (let i = 0; i < pebbles.length; i++) {
    const pxX = pebbles[i];
    const pxY = shoreY + 10 + ((i * 7) % 22);
    px(ctx, pxX, pxY, 4, 2, pal.shoreWet);
    px(ctx, pxX, pxY, 3, 1, pal.shoreHighlight);
  }

  const tufts = [12, 34, 274, 296];
  for (let i = 0; i < tufts.length; i++) {
    const tx = tufts[i];
    const ty = shoreY + 10 + (i % 2) * 10;
    drawPixelCircle(ctx, tx, ty, 4, 3, pal.grassDark, true);
    drawPixelCircle(ctx, tx - 1, ty - 1, 2, 2, pal.grassLight, true);
  }

  // Scuttling beach crabs on the sand
  drawBeachCrabs(ctx, world);

  // Top-down Wind Flag planted near player
  const playerProj = projectWorld(world.playerX, 0, -15, world.cameraZ);
  const cx = Math.round(playerProj.screenX);
  const py = Math.round(playerProj.waterPlaneY);

  const flagX = cx + 44;
  const flagY = py - 2;
  drawPixelCircle(ctx, flagX + 1, flagY + 1, 2, 2, '#3f342c', true);
  px(ctx, flagX, flagY, 2, 2, '#78350f');
  const windDir = world.wind >= 0 ? 1 : -1;
  const windMag = Math.min(1, Math.abs(world.wind) / 22);
  const flagLen = Math.round(5 + windMag * 10);
  const flutter = Math.round(Math.sin(world.time * (6 + windMag * 12)) * 1.5);
  px(
    ctx,
    windDir > 0 ? flagX + 2 : flagX - flagLen,
    flagY + flutter,
    flagLen,
    3,
    '#ef4444'
  );
  px(
    ctx,
    windDir > 0 ? flagX + 2 : flagX - Math.max(2, Math.floor(flagLen * 0.6)),
    flagY + flutter,
    Math.max(2, Math.floor(flagLen * 0.6)),
    2,
    '#fca5a5'
  );

  // Top-down Aim Line out onto the water when READY or CHARGING during gameplay
  if (!isMenu && (world.phase === 'READY' || world.phase === 'CHARGING')) {
    for (let i = 1; i <= 8; i++) {
      const az = i * 15;
      const ax = world.player.aimAngle * (6 + az * 0.34);
      const ap = projectWorld(ax, 0, az, world.cameraZ);
      if (ap.waterPlaneY > 4 && ap.waterPlaneY < shoreY) {
        px(ctx, ap.screenX - 1, ap.waterPlaneY, 2, 2, i % 2 === 0 ? '#fde047' : '#ffffff');
      }
    }
  }

  // Top-Down Player Character standing on the land
  const pose = world.player.pose;
  const bob = pose === 'IDLE' ? Math.round(Math.sin(world.time * 3.2) * 0.6) : 0;
  const rageShake = pose === 'RAGE' ? Math.round(Math.sin(world.time * 48) * 2) : 0;
  const crouchShift = pose === 'WINDUP' ? 2 : 0;
  const pxX = cx + rageShake;
  const pxY = py + bob + crouchShift;

  // Ground shadow
  drawPixelCircle(ctx, cx, py + 3, 9, 5, '#855112', true);

  // Feet peeking slightly forward
  px(ctx, pxX - 5, pxY - 6, 4, 4, '#0f172a');
  px(ctx, pxX + 1, pxY - 6, 4, 4, '#0f172a');

  // Top-down shoulders / Indie Jacket
  drawPixelCircle(ctx, pxX, pxY, 9, 5, '#92400e', true);
  drawPixelCircle(ctx, pxX, pxY, 8, 4, '#d97706', true);
  // Jacket hood resting behind neck
  px(ctx, pxX - 4, pxY + 2, 8, 4, '#b45309');

  // Arms by Pose (Top-Down)
  const stoneProf = STONE_PROFILES[world.stoneKind];
  if (pose === 'IDLE') {
    px(ctx, pxX - 10, pxY - 3, 3, 6, '#d97706');
    px(ctx, pxX + 7, pxY - 5, 4, 6, '#d97706');
    px(ctx, pxX + 8, pxY - 7, 3, 3, '#f1c27d');
    px(ctx, pxX + 8, pxY - 9, 4, 2, stoneProf.colorLight);
  } else if (pose === 'WINDUP') {
    px(ctx, pxX - 11, pxY - 6, 4, 5, '#d97706');
    // Right arm pulled far back-right
    px(ctx, pxX + 8, pxY + 1, 7, 4, '#d97706');
    px(ctx, pxX + 14, pxY + 2, 3, 3, '#f1c27d');
    px(ctx, pxX + 16, pxY + 2, 4, 3, stoneProf.colorLight);
  } else if (pose === 'THROW') {
    px(ctx, pxX - 10, pxY - 2, 3, 5, '#d97706');
    // Right arm whipped forward toward river with crisp pixel swoosh arc!
    px(ctx, pxX + 4, pxY - 11, 4, 8, '#f59e0b');
    px(ctx, pxX + 3, pxY - 14, 4, 3, '#f1c27d');
    px(ctx, pxX + 10, pxY - 5, 2, 1, 'rgba(255, 255, 255, 0.75)');
    px(ctx, pxX + 12, pxY - 9, 2, 3, 'rgba(255, 255, 255, 0.65)');
    px(ctx, pxX + 9, pxY - 13, 3, 1, 'rgba(254, 240, 138, 0.85)');
  } else if (pose === 'CHEER') {
    px(ctx, pxX - 11, pxY - 8, 3, 7, '#d97706');
    px(ctx, pxX - 11, pxY - 11, 3, 3, '#f1c27d');
    px(ctx, pxX + 8, pxY - 8, 3, 7, '#d97706');
    px(ctx, pxX + 8, pxY - 11, 3, 3, '#f1c27d');
  } else if (pose === 'RAGE') {
    // Hands clutching sides of head
    px(ctx, pxX - 8, pxY - 4, 3, 6, '#d97706');
    px(ctx, pxX - 7, pxY - 5, 3, 3, '#f1c27d');
    px(ctx, pxX + 5, pxY - 4, 3, 6, '#d97706');
    px(ctx, pxX + 4, pxY - 5, 3, 3, '#f1c27d');
  } else {
    // WATCH pose
    px(ctx, pxX - 10, pxY - 3, 3, 6, '#d97706');
    px(ctx, pxX + 7, pxY - 8, 3, 6, '#d97706');
    px(ctx, pxX + 5, pxY - 10, 4, 3, '#f1c27d');
  }

  // Top-down Head & Beanie (centered over shoulders)
  drawPixelCircle(ctx, pxX, pxY - 1, 5, 5, '#0284c7', true);
  drawPixelCircle(ctx, pxX, pxY - 1, 4, 4, '#0ea5e9', true);
  px(ctx, pxX - 1, pxY - 1, 2, 2, '#38bdf8'); // beanie crown pom-pom
  // Tiny peek of nose/forehead facing river (-y)
  px(ctx, pxX - 2, pxY - 6, 4, 1, '#f1c27d');

  // Hold-to-Power Throw Meter beside player (longer hold = farther throw)
  if (world.phase === 'CHARGING') {
    const strainShake = world.overholdTimer > 0.3 ? Math.round(Math.sin(world.time * 55) * 1.5) : 0;
    const barX = 188 + strainShake;
    const barY = shoreY - 18;
    const barW = 8;
    const barH = 38;
    px(ctx, barX - 1, barY - 1, barW + 2, barH + 2, '#090d16');
    px(ctx, barX, barY, barW, barH, '#1e293b');

    const fillH = Math.round(world.charge * barH);
    const fillColor =
      world.overholdTimer > 0.45
        ? '#ef4444'
        : world.charge >= 0.82
          ? '#fde047'
          : world.charge >= 0.45
            ? '#f59e0b'
            : '#38bdf8';
    px(ctx, barX + 1, barY + barH - fillH, barW - 2, fillH, fillColor);

    const cursorY = barY + barH - fillH;
    px(ctx, barX - 2, cursorY - 1, barW + 4, 2, '#ffffff');
  }
}

function drawWindStreaks(ctx: CanvasRenderingContext2D, world: GameWorld) {
  const windMag = Math.abs(world.wind);
  if (windMag < 4) return;
  const dir = world.wind >= 0 ? 1 : -1;
  const count = Math.min(10, Math.floor(windMag * 0.4));
  for (let i = 0; i < count; i++) {
    const speed = 35 + windMag * 4;
    const x = (((i * 97 + world.time * speed * dir) % VIRTUAL_WIDTH) + VIRTUAL_WIDTH) % VIRTUAL_WIDTH;
    const y = 14 + ((i * 29 + Math.round(world.cameraZ * 0.3)) % 135);
    px(ctx, x, y, 6 + Math.round(windMag * 0.3), 1, 'rgba(226, 232, 240, 0.32)');
  }
}

function drawAmbientCloudsAndFoam(ctx: CanvasRenderingContext2D, world: GameWorld) {
  // 1. Subtle drifting sea foam motes across the water surface (world-anchored)
  const cellZ = 18;
  const zMin = Math.max(8, world.cameraZ - 20);
  const zMax = world.cameraZ + 195;
  const firstZ = Math.floor(zMin / cellZ) * cellZ;

  ctx.save();
  for (let z = firstZ; z <= zMax; z += cellZ) {
    const row = Math.floor(z / cellZ);
    for (let i = 0; i < 2; i++) {
      const h1 = hash2D(row * 17 + i, i * 31 + 5);
      const h2 = hash2D(i * 43 + 9, row * 23 + 3);
      const driftX = Math.sin(world.time * 0.8 + row + i * 2.1) * 6 + world.time * (world.wind * 0.18 + 1.5);
      const wx = ((((h1 * 210 - 105 + driftX) + 105) % 210 + 210) % 210) - 105;
      const wz = z + (h2 - 0.5) * 12 + Math.cos(world.time * 0.9 + row) * 1.5;
      const p = projectWorld(wx, 0, wz, world.cameraZ);
      const sx = Math.round(p.screenX);
      const sy = Math.round(p.waterPlaneY);
      if (sx < 2 || sx > VIRTUAL_WIDTH - 4 || sy < 4 || sy > VIRTUAL_HEIGHT - 8) continue;

      const twinkle = (Math.sin(world.time * 2.1 + row * 1.3 + i * 2.7) + 1) * 0.5;
      if (twinkle < 0.15) continue;

      ctx.globalAlpha = 0.16 + twinkle * 0.22;
      px(ctx, sx, sy, h2 > 0.6 ? 2 : 1, 1, h1 > 0.5 ? '#e0f2fe' : '#bae6fd');
      if (h1 > 0.72 && twinkle > 0.55) {
        px(ctx, sx + 2, sy - 1, 1, 1, '#ffffff');
      }
    }
  }

  // 2. Soft high-altitude pixel-art cloud wisps & gentle water shadows drifting lazily
  const cloudCount = 4;
  const cloudDriftDir = world.wind >= -1 ? 1 : -1;
  const cloudSpeed = 4.2 + Math.min(4, Math.abs(world.wind) * 0.18);
  for (let i = 0; i < cloudCount; i++) {
    const span = VIRTUAL_WIDTH + 90;
    const rawX = i * 98 + world.time * cloudSpeed * cloudDriftDir;
    const cx = Math.round((((rawX % span) + span) % span) - 45);
    const baseY = 18 + ((i * 37) % 105);
    const parallaxY = Math.round(((baseY + world.cameraZ * 0.14) % (VIRTUAL_HEIGHT - 36) + (VIRTUAL_HEIGHT - 36)) % (VIRTUAL_HEIGHT - 36)) + 10;
    const w = 22 + (i % 2) * 8;

    // Faint cool cloud shadow on the water below
    ctx.globalAlpha = 0.1;
    px(ctx, cx + 4, parallaxY + 10, w, 4, '#022c62');
    px(ctx, cx + 8, parallaxY + 9, w - 8, 6, '#022c62');

    // Stepped pixel-art translucent cloud puff above
    ctx.globalAlpha = 0.13;
    px(ctx, cx, parallaxY + 2, w, 4, '#e0f2fe');
    px(ctx, cx + 4, parallaxY, w - 8, 7, '#f8fafc');
    px(ctx, cx + 8, parallaxY - 2, w - 16, 3, '#ffffff');
  }
  ctx.restore();
}

function drawAmbientBirds(ctx: CanvasRenderingContext2D, world: GameWorld, isMenu: boolean) {
  if (world.birds.length === 0) return;

  ctx.save();
  for (const bird of world.birds) {
    const sp = projectWorld(bird.x, bird.y, bird.z, world.cameraZ);
    const sx = Math.round(sp.screenX);
    const sy = Math.round(sp.screenY);
    if (sx < -32 || sx > VIRTUAL_WIDTH + 32 || sy < -28 || sy > VIRTUAL_HEIGHT + 28) continue;

    if (isMenu) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(2.2, 2.2);
      ctx.translate(-sx, -sy);
    }

    // Distant shadow cast far below onto the water/sand to sell close-to-camera altitude
    const sh = projectWorld(bird.x + 10, 0, bird.z - 12, world.cameraZ);
    ctx.globalAlpha = 0.16;
    drawPixelCircle(ctx, sh.screenX, sh.screenY, 4, 2, '#02224e', true);

    // Animated 3-frame coastal gull wing flap & glide cycle
    const flapCycle = Math.sin(world.time * 6.8 + bird.flapOffset);
    const isGlide = Math.abs(flapCycle) < 0.38;
    const wingsUp = flapCycle >= 0.38;

    ctx.globalAlpha = 0.96;

    // Large, close-to-camera pixel gull angled diagonally (top-right -> bottom-left)
    // Streamlined body & tail
    px(ctx, sx - 3, sy, 6, 3, '#f8fafc');
    px(ctx, sx + 1, sy - 1, 5, 3, '#f1f5f9');
    px(ctx, sx - 2, sy + 2, 5, 1, '#cbd5e1'); // soft belly shading
    px(ctx, sx + 5, sy - 2, 3, 2, '#e2e8f0'); // tail base
    px(ctx, sx + 7, sy - 3, 2, 2, '#94a3b8'); // tail tip

    // Head, eye & orange beak facing down-left
    px(ctx, sx - 5, sy + 1, 4, 3, '#ffffff');
    px(ctx, sx - 4, sy + 2, 1, 1, '#0f172a');
    px(ctx, sx - 8, sy + 2, 3, 2, '#f97316');
    px(ctx, sx - 9, sy + 3, 1, 1, '#ea580c');

    if (isGlide) {
      // Wide foreground soaring wings (~26px wingspan)
      px(ctx, sx - 2, sy - 5, 4, 5, '#ffffff');
      px(ctx, sx - 4, sy - 9, 4, 4, '#f8fafc');
      px(ctx, sx - 6, sy - 12, 3, 3, '#475569');
      px(ctx, sx + 1, sy + 2, 4, 5, '#f8fafc');
      px(ctx, sx + 3, sy + 6, 4, 4, '#e2e8f0');
      px(ctx, sx + 5, sy + 9, 3, 3, '#475569');
    } else if (wingsUp) {
      // High foreground upstroke
      px(ctx, sx - 1, sy - 6, 4, 6, '#ffffff');
      px(ctx, sx - 2, sy - 11, 3, 5, '#f8fafc');
      px(ctx, sx - 3, sy - 14, 2, 3, '#334155');
      px(ctx, sx + 2, sy + 2, 4, 5, '#ffffff');
      px(ctx, sx + 4, sy + 6, 3, 5, '#f8fafc');
      px(ctx, sx + 6, sy + 10, 2, 3, '#334155');
    } else {
      // Swept-back downstroke
      px(ctx, sx, sy - 4, 4, 4, '#e2e8f0');
      px(ctx, sx + 2, sy - 8, 4, 4, '#cbd5e1');
      px(ctx, sx + 4, sy - 10, 3, 2, '#334155');
      px(ctx, sx + 2, sy + 2, 4, 4, '#e2e8f0');
      px(ctx, sx + 5, sy + 5, 4, 4, '#cbd5e1');
      px(ctx, sx + 8, sy + 8, 3, 2, '#334155');
    }

    if (isMenu) ctx.restore();
  }
  ctx.restore();
}

export function renderGameWorld(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  options: { isMenu?: boolean } = {}
) {
  const isMenu = Boolean(options.isMenu);
  ctx.imageSmoothingEnabled = false;
  const pal = BIOME_PALETTES[world.difficulty];

  ctx.save();
  const shakeX = world.cameraShake > 0.1 ? Math.round((Math.random() - 0.5) * world.cameraShake * 2) : 0;
  const shakeY = world.cameraShake > 0.1 ? Math.round((Math.random() - 0.5) * world.cameraShake * 2) : 0;
  ctx.translate(shakeX, shakeY);

  drawTopDownWater(ctx, world, pal);
  drawAmbientCloudsAndFoam(ctx, world);
  drawWindStreaks(ctx, world);

  // Ripples on water (top-down circles!)
  for (const r of world.ripples) {
    const p = projectWorld(r.x, 0, r.z, world.cameraZ);
    if (p.waterPlaneY < -20 || p.waterPlaneY > VIRTUAL_HEIGHT + 20) continue;
    const t = r.age / r.maxAge;
    const radius = Math.max(2, Math.round(2 + t * r.maxRadius));
    const color = r.isPerfect
      ? t < 0.45
        ? '#fde047'
        : '#ffffff'
      : t < 0.5
        ? '#e0f2fe'
        : '#7dd3fc';
    drawPixelCircle(ctx, p.screenX, p.waterPlaneY, radius, radius, color, false);
  }

  // Hazards sorted back-to-front by z (top-to-bottom on screen)
  const sortedHazards = [...world.hazards].sort((a, b) => b.z - a.z);
  for (const h of sortedHazards) {
    drawHazardTopDown(ctx, h, world);
  }

  // Davin sleeping & snoring on the water (Rage Bait)
  drawDavinSleeping(ctx, world);

  // Endless Mode powerups (Springs, Power Buoys, Bamboo floats)
  if (!isMenu && world.powerups.length > 0) {
    const sortedPowerups = [...world.powerups].sort((a, b) => b.z - a.z);
    for (const pUp of sortedPowerups) {
      drawPowerupTopDown(ctx, pUp, world);
    }
  }

  // Foreground shoreline, crabs & player
  drawShoreAndPlayerTopDown(ctx, world, pal, isMenu);

  // Active stone & water timing ring
  drawStoneAndTimingRingTopDown(ctx, world, isMenu);

  // Splash & feather particles
  for (const pt of world.particles) {
    const p = projectWorld(pt.x, pt.y, pt.z, world.cameraZ);
    if (p.screenY < -10 || p.screenY > VIRTUAL_HEIGHT + 10) continue;
    px(ctx, p.screenX, p.screenY, pt.size, pt.size, pt.color);
  }

  // Seagulls flying overhead across the entire map
  drawAmbientBirds(ctx, world, isMenu);

  // Floating pixel callouts
  for (const ft of world.floatingTexts) {
    const p = projectWorld(ft.x, ft.y, ft.z, world.cameraZ);
    const drawY = Math.max(12, Math.min(VIRTUAL_HEIGHT - 14, p.screenY));
    const drawX = Math.max(42, Math.min(VIRTUAL_WIDTH - 42, p.screenX));
    drawPixelText(ctx, ft.text, drawX, drawY, ft.color);
  }

  // Ready prompt above player during active gameplay
  if (!isMenu && world.phase === 'READY') {
    const pulse = Math.sin(world.time * 4.5) > 0;
    const shorePromptY = Math.round(projectWorld(0, 0, 0, world.cameraZ).waterPlaneY) - 16;
    drawPixelText(
      ctx,
      'HOLD SPACE TO THROW',
      160,
      Math.max(24, shorePromptY),
      pulse ? '#fef08a' : '#f8fafc'
    );
  }

  // Perfect skip screen flash
  if (world.flashAlpha > 0.01) {
    ctx.fillStyle = `rgba(254, 240, 138, ${world.flashAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
  }

  ctx.restore();
}
