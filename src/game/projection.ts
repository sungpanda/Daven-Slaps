import { SHORE_Y, VIRTUAL_WIDTH } from './constants';

export const TOP_DOWN_SCALE_X = 1.55;
export const TOP_DOWN_SCALE_Z = 0.92;
export const TOP_DOWN_HEIGHT_LIFT = 1.15;

export interface ProjectedPoint {
  screenX: number;
  screenY: number;
  waterPlaneY: number;
  scale: number;
}

export function projectWorld(
  x: number,
  y: number,
  z: number,
  cameraZ = 0
): ProjectedPoint {
  const relZ = z - cameraZ;
  const waterPlaneY = SHORE_Y - relZ * TOP_DOWN_SCALE_Z;
  const screenX = VIRTUAL_WIDTH * 0.5 + x * TOP_DOWN_SCALE_X;
  const screenY = waterPlaneY - y * TOP_DOWN_HEIGHT_LIFT;
  const scale = 1 + Math.max(0, y) * 0.012;

  return {
    screenX,
    screenY,
    waterPlaneY,
    scale,
  };
}
