import { expect, it } from 'vitest';
import { ModelRenderer, parseMDL } from 'war3-model';
import { mat4, vec3 } from 'gl-matrix';
import { billboardCameraRotation } from './camera';
import { initialCamera, modelBounds, War3Engine } from './engine';
import { cardCamera } from './cardCamera';

it('fits tiny XY UI meshes face-on without changing ordinary model cameras', () => {
  const data = parseMDL('Version { FormatVersion 800, } Model "Tiny" {}');
  data.Geosets = [{ Vertices: new Float32Array([-.2,-.1,0, .2,-.1,0, .2,.1,0, -.2,.1,0]) }] as typeof data.Geosets;
  const bounds = modelBounds(data);
  expect(bounds.radius).toBeCloseTo(Math.hypot(.2,.1));
  expect(initialCamera(data).pitch).toBe(1.4);
  const camera = cardCamera({ data, bounds } as War3Engine, 1);
  const engine = Object.assign(Object.create(War3Engine.prototype) as War3Engine, { bounds });
  const { view, projection } = engine.matrices(camera, 1);
  const matrix = mat4.multiply(mat4.create(), projection, view);
  const projected = Array.from({length:4}, (_,i) => vec3.transformMat4(vec3.create(), data.Geosets[0].Vertices.slice(i*3,i*3+3), matrix));
  expect(Math.max(...projected.map(v=>v[0]))-Math.min(...projected.map(v=>v[0]))).toBeGreaterThan(.5);
  expect(Math.max(...projected.map(v=>v[1]))-Math.min(...projected.map(v=>v[1]))).toBeGreaterThan(.5);
  for (const point of projected) for (const value of point) expect(Math.abs(value)).toBeLessThan(1);
  data.Geosets[0].Vertices = new Float32Array([-.2,0,-.1, .2,0,-.1, .2,0,.1, -.2,0,.1]);
  expect(initialCamera(data).yaw).toBeCloseTo(Math.PI/2);
  expect(initialCamera(data).pitch).toBe(.16);
  data.Geosets[0].Vertices = new Float32Array([0,-100,0, 0,100,200]);
  expect(initialCamera(data).pitch).toBe(.16);
});

function renderer(billboard: boolean) {
  return new ModelRenderer(parseMDL(`Version { FormatVersion 800, }
    Model "Plane" {} Sequences 1 { Anim "Stand" { Interval { 0, 1000 }, } }
    Bone "Plane" { ObjectId 0, ${billboard ? 'Billboarded,' : ''}
      GeosetId Multiple, GeosetAnimId None, }
    PivotPoints 1 { { 0, 0, 0 }, }`));
}
type Internals = { rendererData: { nodes: { matrix: mat4 }[] } };

it('keeps actual billboard geometry face-on and upright across camera orbits', () => {
  const model = renderer(true);
  for (const yaw of [0, .7, Math.PI / 2, Math.PI, -2.4]) for (const pitch of [-1.4, 0, .12, .75, 1.4]) {
    const rotation = billboardCameraRotation(yaw, pitch);
    const eye = vec3.fromValues(Math.cos(yaw) * Math.cos(pitch) * 100, Math.sin(yaw) * Math.cos(pitch) * 100, Math.sin(pitch) * 100);
    model.setCamera(eye, rotation); model.update(0);
    const matrix = (model as unknown as Internals).rendererData.nodes[0].matrix;
    const normal = vec3.transformMat4(vec3.create(), [1, 0, 0], matrix);
    expect(vec3.dot(normal, vec3.normalize(vec3.create(), eye))).toBeCloseTo(1, 5);
    const view = mat4.lookAt(mat4.create(), eye, [0, 0, 0], [0, 0, 1]);
    const up = vec3.transformMat4(vec3.create(), [0, 0, 1], mat4.multiply(mat4.create(), view, matrix));
    const origin = vec3.transformMat4(vec3.create(), [0, 0, 0], view);
    expect(vec3.subtract(up, up, origin)[1]).toBeCloseTo(1, 5);
  }
});

it('preserves ordinary node transforms when the camera rotates', () => {
  const model = renderer(false);
  model.setCamera(vec3.fromValues(10, 20, 30), billboardCameraRotation(1.2, .7)); model.update(0);
  expect(Array.from((model as unknown as Internals).rendererData.nodes[0].matrix)).toEqual(Array.from(mat4.create()));
});

it('refreshes paused billboard nodes before the first draw and after an orbit without advancing time', () => {
  const model = renderer(true), canvas = { width: 176, height: 176 };
  let updates = 0;
  const update = model.update.bind(model);
  model.update = delta => { expect(delta).toBe(0); updates++; update(delta); };
  model.render = () => {};
  const gl = { bindFramebuffer() {}, depthMask() {}, colorMask() {}, viewport() {}, clearColor() {}, clear() {} };
  const engine = Object.assign(Object.create(War3Engine.prototype) as War3Engine, { canvas, gl, renderer: model, bounds: { center: vec3.create(), radius: 100 } });
  const camera = { yaw: 0, pitch: .12, distance: 2.7, panX: 0, panY: 0 };
  engine.draw(camera, '#000000', '#ffffff');
  engine.draw(camera, '#000000', '#ffffff');
  expect(updates).toBe(1);
  engine.draw({ ...camera, yaw: 1 }, '#000000', '#ffffff');
  expect(updates).toBe(2);
  expect(model.getFrame()).toBe(0);
});
