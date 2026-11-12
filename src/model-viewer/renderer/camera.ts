import { quat } from 'gl-matrix';

// war3-model billboards use +X as their normal and +Z as their up axis.
// A WebGL camera's inverse view instead uses +Z as its backward axis.
export function billboardCameraRotation(yaw: number, pitch: number) {
  const rotation = quat.create();
  quat.rotateZ(rotation, rotation, yaw);
  return quat.rotateY(rotation, rotation, -pitch);
}
