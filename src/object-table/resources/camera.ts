import { cardCamera } from '../../model-viewer/renderer/cardCamera';
import type { War3Engine } from '../../model-viewer/renderer/engine';
export function importCamera(engine: War3Engine, aspect: number) {
  const camera = cardCamera(engine, aspect);
  return { ...camera, distance: Math.max(3.6, camera.distance * 1.4) };
}
