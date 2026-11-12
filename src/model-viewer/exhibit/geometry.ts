import * as THREE from 'three';
export interface MapBounds { minX: number; minY: number; maxX: number; maxY: number }
export function selectionFrustum(camera: THREE.Camera, left: number, top: number, right: number, bottom: number) {
  const width = Math.max(.00001, Math.abs(right - left)), height = Math.max(.00001, Math.abs(top - bottom));
  const crop = new THREE.Matrix4().set(2 / width, 0, 0, -(left + right) / width, 0, 2 / height, 0, -(top + bottom) / height, 0, 0, 1, 0, 0, 0, 0, 1);
  return new THREE.Frustum().setFromProjectionMatrix(crop.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse));
}
export function groundFootprint(camera: THREE.Camera, bounds: MapBounds, height: number) {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let polygon = [new THREE.Vector3(bounds.minX, bounds.minY, height), new THREE.Vector3(bounds.maxX, bounds.minY, height), new THREE.Vector3(bounds.maxX, bounds.maxY, height), new THREE.Vector3(bounds.minX, bounds.maxY, height)];
  for (const plane of frustum.planes) {
    const output: THREE.Vector3[] = [];
    polygon.forEach((point, index) => {
      const previous = polygon[(index + polygon.length - 1) % polygon.length], a = plane.distanceToPoint(previous), b = plane.distanceToPoint(point);
      if ((a >= 0) !== (b >= 0)) output.push(previous.clone().lerp(point, a / (a - b)));
      if (b >= 0) output.push(point);
    }); polygon = output;
  }
  return polygon;
}
export function groundPoint(camera: THREE.Camera, x: number, y: number, height: number) {
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x, y), camera);
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -height), new THREE.Vector3());
}
export function cameraViewPan(camera: THREE.PerspectiveCamera, distance: number, dx: number, dy: number, viewportHeight: number) {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  // Translate parallel to the screen, without depth change or tilt-dependent gain.
  // Move the camera opposite to the pointer so the fixed scene follows the drag.
  const pixelScale = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, viewportHeight);
  return right.multiplyScalar(-dx).addScaledVector(up, dy).multiplyScalar(pixelScale);
}
