const WATER_IMAGE_URL = '/assets/textures/water_caustics.png';

export interface WaterTextures {
  baseCanvas: HTMLCanvasElement;
  causticTile: HTMLCanvasElement;
}

let cachedTextures: WaterTextures | null = null;
let isLoading = false;

function buildCausticTile(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sCtx = src.getContext('2d')!;
  sCtx.drawImage(img, 0, 0);
  const srcData = sCtx.getImageData(0, 0, w, h).data;

  // Build smoothed background luminance via tight blur to extract crisp caustic filaments
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = w;
  blurCanvas.height = h;
  const bCtx = blurCanvas.getContext('2d')!;
  bCtx.filter = 'blur(6px)';
  bCtx.drawImage(src, 0, 0);
  const blurData = bCtx.getImageData(0, 0, w, h).data;

  const single = document.createElement('canvas');
  single.width = w;
  single.height = h;
  const cCtx = single.getContext('2d')!;
  const out = cCtx.createImageData(w, h);

  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    const lum = srcData[p] * 0.25 + srcData[p + 1] * 0.55 + srcData[p + 2] * 0.2;
    const avgLum = blurData[p] * 0.25 + blurData[p + 1] * 0.55 + blurData[p + 2] * 0.2;
    const delta = lum - avgLum;

    if (delta > 2) {
      const intensity = Math.min(1, (delta - 2) / 26);
      const whiteMix = Math.max(0, Math.min(1, (delta - 18) / 28));
      out.data[p] = Math.round(110 + 145 * whiteMix);
      out.data[p + 1] = Math.round(220 + 35 * whiteMix);
      out.data[p + 2] = 255;
      out.data[p + 3] = Math.round(intensity * 235);
    } else {
      out.data[p + 3] = 0;
    }
  }
  cCtx.putImageData(out, 0, 0);

  // Mirror-tile 2x2 so scrolling in any direction is completely seamless
  const tile = document.createElement('canvas');
  tile.width = w * 2;
  tile.height = h * 2;
  const tCtx = tile.getContext('2d')!;

  // Top-left (normal)
  tCtx.drawImage(single, 0, 0);
  // Top-right (flip X)
  tCtx.save();
  tCtx.translate(w * 2, 0);
  tCtx.scale(-1, 1);
  tCtx.drawImage(single, 0, 0);
  tCtx.restore();
  // Bottom-left (flip Y)
  tCtx.save();
  tCtx.translate(0, h * 2);
  tCtx.scale(1, -1);
  tCtx.drawImage(single, 0, 0);
  tCtx.restore();
  // Bottom-right (flip X & Y)
  tCtx.save();
  tCtx.translate(w * 2, h * 2);
  tCtx.scale(-1, -1);
  tCtx.drawImage(single, 0, 0);
  tCtx.restore();

  return tile;
}

function processWaterImage(img: HTMLImageElement) {
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = 320;
  baseCanvas.height = 180;
  const bCtx = baseCanvas.getContext('2d');
  if (!bCtx) return;

  bCtx.imageSmoothingEnabled = false;
  bCtx.drawImage(img, 0, 0, 320, 180);

  const causticTile = buildCausticTile(img);
  cachedTextures = { baseCanvas, causticTile };
}

export function initWaterTextures() {
  if (cachedTextures || isLoading || typeof Image === 'undefined') return;
  isLoading = true;
  const img = new Image();
  img.onload = () => {
    processWaterImage(img);
    isLoading = false;
  };
  img.onerror = () => {
    isLoading = false;
  };
  img.src = WATER_IMAGE_URL;
}

if (typeof window !== 'undefined') {
  initWaterTextures();
}

export function getWaterTextures(): WaterTextures | null {
  if (!cachedTextures && !isLoading) {
    initWaterTextures();
  }
  return cachedTextures;
}
