import { ModelRenderer, type model } from 'war3-model';
import { mat4, quat, vec3 } from 'gl-matrix';
import type { LoadedModel } from '../types';
import type { Camera } from '../workspace/store';
import { managedRenderer } from './lifecycle';
import { discreteTextureAnimations } from './textureAnimation';
import { compatibleSkinning } from './skinning';
import { billboardCameraRotation } from './camera';

export function modelBounds(data: model.Model) {
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  for (const geoset of data.Geosets) for (let i = 0; i < geoset.Vertices.length; i += 3) for (let k = 0; k < 3; k++) {
    const value = geoset.Vertices[i + k];
    if (Number.isFinite(value)) { minimum[k] = Math.min(minimum[k], value); maximum[k] = Math.max(maximum[k], value); }
  }
  if (!minimum.every(Number.isFinite)) {
    for (let k = 0; k < 3; k++) { minimum[k] = data.Info.MinimumExtent[k]; maximum[k] = data.Info.MaximumExtent[k]; }
  }
  const center = vec3.fromValues(...minimum.map((v, i) => Number.isFinite(v + maximum[i]) ? (v + maximum[i]) / 2 : 0) as [number, number, number]);
  const geometricRadius = Math.hypot(...minimum.map((v, i) => Number.isFinite(v) ? (maximum[i] - v) / 2 : 0));
  const radius = geometricRadius > 0 ? Math.max(1e-5, geometricRadius) : 100;
  // Tiny UI meshes are authored in the XY plane; the ordinary +X view is edge-on.
  const planarUI = radius < 1 && maximum[2] - minimum[2] < radius * .01;
  const initialYaw = radius < 1 && !planarUI && maximum[0] - minimum[0] > (maximum[1] - minimum[1]) * 2 ? Math.PI / 2 : 0;
  return { center, radius, planarUI, initialYaw };
}
export function initialCamera(data: model.Model): Camera {
  const bounds = modelBounds(data);
  return { yaw: bounds.initialYaw, pitch: bounds.planarUI ? 1.4 : .16, distance: 2.7, panX: 0, panY: 0 };
}
const renderCopies = new WeakMap<model.Model, model.Model>();
export function renderModel(data: model.Model): model.Model {
  const cached = renderCopies.get(data); if (cached) return cached;
  const original = data;
  data = compatibleSkinning(discreteTextureAnimations(data));
  if (!data.Sequences.length) data = { ...data, Sequences: [{ Name: '静态', Interval: new Uint32Array([0, 1]), NonLooping: true, MinimumExtent: data.Info.MinimumExtent, MaximumExtent: data.Info.MaximumExtent, BoundsRadius: data.Info.BoundsRadius, MoveSpeed: 0, Rarity: 0 }] };
  renderCopies.set(original, data); return data;
}
export function sequenceFor(data: model.Model, action: string) {
  const normalized = action.toLowerCase();
  const exact = data.Sequences.findIndex(s => s.Name.toLowerCase() === normalized);
  return Math.max(0, exact >= 0 ? exact : data.Sequences.findIndex(s => s.Name.toLowerCase().startsWith(normalized)));
}
export function rgb(color: string) { const n = Number.parseInt(color.replace('#', ''), 16); return vec3.fromValues(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }

export class War3Engine {
  readonly gl: WebGL2RenderingContext;
  readonly renderer: ModelRenderer;
  readonly data: model.Model;
  readonly bounds;
  private cameraRotation?: quat;
  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas, readonly loaded: LoadedModel) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('无法建立 WebGL 渲染上下文');
    this.gl = gl; this.data = renderModel(loaded.model); this.bounds = modelBounds(this.data);
    this.renderer = managedRenderer(this.data, gl);
    try {
      for (const [path, images] of loaded.images) this.renderer.setTextureImageData(path, images);
      this.renderer.setLightPosition(vec3.fromValues(1000, -1000, 2000)); this.renderer.setLightColor(vec3.fromValues(1, 1, 1));
      this.renderer.update(0);
    } catch (error) { this.renderer.destroy(); throw error; }
  }
  sequence(index: number, frame?: number) {
    const i = Math.max(0, Math.min(index, this.data.Sequences.length - 1)); this.renderer.setSequence(i);
    if (frame !== undefined) {
      const interval = this.data.Sequences[i].Interval, target = Math.max(interval[0], Math.min(interval[1], frame));
      this.renderer.setFrame(Math.max(interval[0], target - 1000));
      while (this.renderer.getFrame() < target) this.renderer.update(Math.min(40, target - this.renderer.getFrame()));
    }
    this.renderer.update(0);
  }
  update(delta: number, loop: boolean) {
    const sequence = this.data.Sequences[this.renderer.getSequence()];
    const end = sequence.Interval[1];
    // Viewer playback is controlled by the user; NonLooping is an in-game hint.
    if (!loop) {
      const dt = Math.min(delta, Math.max(0, end - this.renderer.getFrame())); this.renderer.update(dt); return this.renderer.getFrame() >= end;
    }
    this.renderer.update(delta); return false;
  }
  draw(camera: Camera, background: string, team: string, transparent = false, target?: { framebuffer: WebGLFramebuffer; size: number }) {
    const { gl, canvas, renderer } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null); gl.depthMask(true); gl.colorMask(true, true, true, true);
    gl.viewport(0, 0, target?.size ?? canvas.width, target?.size ?? canvas.height); gl.clearColor(...rgb(background) as [number, number, number], transparent ? 0 : 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const { view, projection, eye, rotation } = this.matrices(camera, target ? 1 : canvas.width / canvas.height);
    renderer.setTeamColor(rgb(team)); renderer.setCamera(eye, rotation);
    if (!this.cameraRotation || !quat.exactEquals(this.cameraRotation, rotation)) {
      // Refresh billboard nodes immediately, including while animation is paused.
      renderer.update(0); this.cameraRotation = quat.clone(rotation);
    }
    renderer.render(view, projection, {});
  }
  matrices(camera: Camera, aspect: number) {
    const radius = this.bounds.radius, center = vec3.clone(this.bounds.center);
    center[0] += camera.panX * radius; center[2] += camera.panY * radius;
    const distance = radius * camera.distance / Math.min(1, aspect);
    const eye = vec3.fromValues(center[0] + Math.cos(camera.yaw) * Math.cos(camera.pitch) * distance, center[1] + Math.sin(camera.yaw) * Math.cos(camera.pitch) * distance, center[2] + Math.sin(camera.pitch) * distance);
    const view = mat4.create(), projection = mat4.create(), rotation = billboardCameraRotation(camera.yaw, camera.pitch);
    mat4.lookAt(view, eye, center, [0, 0, 1]); mat4.perspective(projection, Math.PI / 4, aspect, Math.max(1e-6, radius / 1000), radius * 100);
    return { view, projection, eye, rotation };
  }
  destroy() { this.renderer.destroy(); }
}
