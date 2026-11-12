import type { TerrainMapInfo, TerrainSelection } from './types';

export type Point = [number, number];
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export interface Transform { scale: number; left: number; top: number }
export type Rotation = 0 | 90 | 180 | 270;

export function rotatedDimensions(selection: TerrainSelection, rotation: Rotation): Point {
  const width = selection.x1 - selection.x0 + 1, height = selection.y1 - selection.y0 + 1;
  return rotation === 90 || rotation === 270 ? [height, width] : [width, height];
}

export function mapTransform(map: TerrainMapInfo, width: number, height: number, zoom: number, pan: Point): Transform {
  const scale = Math.max(.1, Math.min((width - 28) / map.width, (height - 28) / map.height) * zoom);
  return { scale, left: (width - map.width * scale) / 2 + pan[0], top: (height - map.height * scale) / 2 + pan[1] };
}

export function handles(rect: TerrainSelection): [Handle, number, number][] {
  const { x0, y0 } = rect, x1 = rect.x1 + 1, y1 = rect.y1 + 1;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return [['nw', x0, y0], ['n', cx, y0], ['ne', x1, y0], ['e', x1, cy], ['se', x1, y1], ['s', cx, y1], ['sw', x0, y1], ['w', x0, cy]];
}

export function hitHandle(rect: TerrainSelection, point: Point, transform: Transform): Handle | null {
  const { scale, left, top } = transform;
  return handles(rect).find(([, x, y]) => Math.abs(left + x * scale - point[0]) <= 7 && Math.abs(top + y * scale - point[1]) <= 7)?.[0] ?? null;
}

export function contains(rect: TerrainSelection, [x, y]: Point): boolean {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

export function moveSelection(rect: TerrainSelection, delta: Point, width: number, height: number): TerrainSelection {
  const dx = Math.max(-rect.x0, Math.min(width - 1 - rect.x1, delta[0]));
  const dy = Math.max(-rect.y0, Math.min(height - 1 - rect.y1, delta[1]));
  return { x0: rect.x0 + dx, y0: rect.y0 + dy, x1: rect.x1 + dx, y1: rect.y1 + dy, mask: null };
}

export function resizeSelection(rect: TerrainSelection, handle: Handle, delta: Point, width: number, height: number): TerrainSelection {
  const next = { ...rect, mask: null };
  if (handle.includes('w')) next.x0 = Math.max(0, Math.min(rect.x1, rect.x0 + delta[0]));
  if (handle.includes('e')) next.x1 = Math.min(width - 1, Math.max(rect.x0, rect.x1 + delta[0]));
  if (handle.includes('n')) next.y0 = Math.max(0, Math.min(rect.y1, rect.y0 + delta[1]));
  if (handle.includes('s')) next.y1 = Math.min(height - 1, Math.max(rect.y0, rect.y1 + delta[1]));
  return next;
}

export function placementRect(selection: TerrainSelection | null, placement: Point | null, rotation: Rotation = 0): TerrainSelection | null {
  if (!selection || !placement) return null;
  const [width, height] = rotatedDimensions(selection, rotation);
  return { x0: placement[0], y0: placement[1], x1: placement[0] + width - 1, y1: placement[1] + height - 1, mask: null };
}

export function clampPlacement(point: Point, selection: TerrainSelection | null, map: TerrainMapInfo, rotation: Rotation = 0): Point {
  const [width, height] = selection ? rotatedDimensions(selection, rotation) : [1, 1];
  return [Math.max(0, Math.min(map.width - width, point[0])), Math.max(0, Math.min(map.height - height, point[1]))];
}

export function paint(mask: boolean[], width: number, height: number, point: Point, size: number, shape: 'square' | 'circle', erase: boolean) {
  const [cx, cy] = point, radius = Math.max(0, Math.floor(size / 2));
  for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (shape === 'circle' && (x - cx) ** 2 + (y - cy) ** 2 > (radius + .25) ** 2) continue;
    mask[y * width + x] = !erase;
  }
}

export function boundsFromMask(mask: boolean[], width: number, height: number): TerrainSelection | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < x0 || y1 < y0 ? null : { x0, y0, x1, y1, mask };
}
