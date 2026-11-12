import type { TerrainMapInfo, TerrainSelection } from './types';
import { rotatedDimensions, type Point, type Rotation } from './selectionGeometry';

// UI rows run north to south; W3E, pathing and entity coordinates run south to north.
export function worldSelection(rect: TerrainSelection, map: Pick<TerrainMapInfo, 'width' | 'height'>): TerrainSelection {
  const mask = rect.mask ? Array<boolean>(rect.mask.length) : null;
  if (mask && rect.mask) for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    mask[(map.height - 1 - y) * map.width + x] = rect.mask[y * map.width + x];
  }
  return { ...rect, y0: map.height - 1 - rect.y1, y1: map.height - 1 - rect.y0, mask };
}

export function worldPlacement(point: Point, rect: TerrainSelection, targetHeight: number, rotation: Rotation = 0): Point {
  const [, height] = rotatedDimensions(rect, rotation);
  return [point[0], targetHeight - point[1] - height];
}

export function heightSelection(rect: TerrainSelection, placement: Point, source: TerrainMapInfo, target: TerrainMapInfo): TerrainSelection {
  const [x0, y0] = placement, width = rect.x1 - rect.x0 + 1, height = rect.y1 - rect.y0 + 1;
  const mask = rect.mask ? Array<boolean>(target.width * target.height).fill(false) : null;
  if (mask && rect.mask) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    mask[(y0 + y) * target.width + x0 + x] = rect.mask[(rect.y0 + y) * source.width + rect.x0 + x];
  }
  return worldSelection({ x0, y0, x1: x0 + width - 1, y1: y0 + height - 1, mask }, target);
}
