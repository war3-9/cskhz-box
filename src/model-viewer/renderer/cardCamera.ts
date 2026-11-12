import type { Camera } from '../workspace/store';
import type { War3Engine } from './engine';

export function cardCamera(engine: War3Engine, aspect: number): Camera {
  const { center, radius } = engine.bounds;
  const yaw = engine.bounds.initialYaw, pitch = engine.bounds.planarUI ? 1.4 : .12, tangent = Math.tan(Math.PI / 8);
  let distance = radius * 2.5;
  if (engine.data.Geosets.some(geoset => geoset.Vertices.length)) {
    distance = 0;
    // Warcraft models face +X; fit the projected geometry rather than a diagonal sphere.
    for (const geoset of engine.data.Geosets) for (let i = 0; i < geoset.Vertices.length; i += 3) {
      const vertices = geoset.Vertices;
      const dx = vertices[i] - center[0], dy = vertices[i + 1] - center[1], z = vertices[i + 2] - center[2];
      const x = Math.cos(yaw) * dx + Math.sin(yaw) * dy, y = -Math.sin(yaw) * dx + Math.cos(yaw) * dy;
      const depth = Math.cos(pitch) * x + Math.sin(pitch) * z;
      const vertical = -Math.sin(pitch) * x + Math.cos(pitch) * z;
      distance = Math.max(distance, depth + Math.max(Math.abs(y) / (tangent * aspect), Math.abs(vertical) / tangent) * 1.16);
    }
  }
  return { yaw, pitch, distance: Math.max(1, distance / radius) * Math.min(1, aspect), panX: 0, panY: 0 };
}
