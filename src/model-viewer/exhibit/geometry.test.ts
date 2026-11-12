import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cameraViewPan, groundFootprint, selectionFrustum } from './geometry';
const bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
it('marquee selects overlapping visible bounds and rejects models outside the box or behind the camera', () => {
  const camera = new THREE.PerspectiveCamera(45, 1.5, 1, 1000);
  camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const box = selectionFrustum(camera, -.25, .25, .25, -.25);
  expect(box.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1))).toBe(true);
  expect(box.intersectsSphere(new THREE.Sphere(new THREE.Vector3(60, 0, 0), 1))).toBe(false);
  expect(box.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0, 0, 110), 1))).toBe(false);
  expect(box.intersectsSphere(new THREE.Sphere(new THREE.Vector3(16, 0, 0), 2))).toBe(true);
  camera.position.x = 40; camera.lookAt(40, 0, 0); camera.updateMatrixWorld();
  const moved = selectionFrustum(camera, -.25, .25, .25, -.25);
  expect(moved.intersectsSphere(new THREE.Sphere(new THREE.Vector3(40, 0, 0), 1))).toBe(true);
  expect(moved.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1))).toBe(false);
});
describe('camera ground footprint', () => {
  it('clips the map to the camera view and moves with the camera', () => { const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000); camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); const a = groundFootprint(camera, bounds, 0); expect(a).toHaveLength(4); expect(Math.max(...a.map(p => p.x))).toBeCloseTo(41.421, 2); camera.position.x = 40; camera.lookAt(40, 0, 0); camera.updateMatrixWorld(); const b = groundFootprint(camera, bounds, 0); expect(Math.max(...b.map(p => p.x))).toBeCloseTo(81.421, 2); });
  it('returns no ground area when the camera faces away and stays finite near the horizon', () => { const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000); camera.position.set(0, 0, 100); camera.lookAt(0, 0, 200); camera.updateMatrixWorld(); expect(groundFootprint(camera, bounds, 0)).toEqual([]); camera.lookAt(100, 0, 100); camera.updateMatrixWorld(); expect(groundFootprint(camera, bounds, 0).every(point => [point.x, point.y].every(Number.isFinite))).toBe(true); });
});
it('right-drag moves only the camera opposite to the pointer so the fixed scene follows the drag at every yaw and tilt', () => {
  for (const yaw of [-2.4, -.8, 0, .6, 2.1]) for (const pitch of [.05, .12, .75, 1.4]) for (const [dx, dy] of [[-60, 40], [60, -40], [60, 40], [-60, -40], [60, 0], [-60, 0], [0, 60], [0, -60]]) {
    const target = new THREE.Vector3(), camera = new THREE.PerspectiveCamera(45, 1.6, .1, 10000), height = 800, distance = 1200;
    camera.up.set(0, 0, 1); camera.position.set(Math.cos(yaw) * Math.cos(pitch) * distance, Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance); camera.lookAt(target); camera.updateMatrixWorld();
    const before = new THREE.Vector3().project(camera), delta = cameraViewPan(camera, distance, dx, dy, height);
    expect(delta.dot(camera.getWorldDirection(new THREE.Vector3()))).toBeCloseTo(0, 8);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    if (dx) expect(Math.sign(delta.dot(right))).toBe(-Math.sign(dx));
    if (dy) expect(Math.sign(delta.dot(up))).toBe(Math.sign(dy));
    target.add(delta); camera.position.add(delta); camera.lookAt(target); camera.updateMatrixWorld();
    const after = new THREE.Vector3().project(camera), screenX = (after.x - before.x) * height * camera.aspect / 2, screenY = -(after.y - before.y) * height / 2;
    expect(screenX).toBeCloseTo(dx, 6); expect(screenY).toBeCloseTo(dy, 6);
  }
});
