import * as THREE from 'three';
import { ModelRenderer } from 'war3-model';
import { mat4, vec3 } from 'gl-matrix';
import { billboardCameraRotation } from '../renderer/camera';
import { modelBounds, renderModel, rgb, sequenceFor } from '../renderer/engine';
import type { LoadedModel } from '../types';
import type { Settings } from '../workspace/store';
import { managedRenderer } from '../renderer/lifecycle';
import { cameraViewPan, groundFootprint, groundPoint, selectionFrustum } from './geometry';
import { loadModel } from '../resources/models';
import { ExhibitGround } from './ground';
export interface ItemOptions { x: number; y: number; height: number; scale: number; speed: number; sequence: number }
interface Item { renderer?: ModelRenderer; loaded: LoadedModel; transform: THREE.Matrix4; position: THREE.Vector3; bounds: ReturnType<typeof modelBounds>; options: ItemOptions; touched: number; ready: boolean; hydrating: boolean }
export class ExhibitScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(45, 1, .1, 100000);
  readonly scene = new THREE.Scene(); readonly target = new THREE.Vector3();
  private items: Item[] = []; private pausedFrame?: string; private frameCount = 0;
  private version = 0; private selected: number[] = []; private rings: THREE.LineLoop[] = [];
  private loadingTextures = 0; private destroyed = false;
  private groundSurface: ExhibitGround;
  yaw = 0; pitch = .75; distance = 1200; renderError?: string;
  get pose() { return { yaw: this.yaw, pitch: this.pitch, distance: this.distance, target: this.target.toArray() }; }
  restore(pose: { yaw: number; pitch: number; distance: number; target: number[] }) { this.yaw = pose.yaw; this.pitch = pose.pitch; this.distance = pose.distance; this.target.fromArray(pose.target); }
  constructor(canvas: HTMLCanvasElement, private total: number) {
    const context = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!context) throw new Error('无法建立模型地图渲染上下文');
    this.renderer = new THREE.WebGLRenderer({ canvas, context }); this.camera.up.set(0, 0, 1);
    this.groundSurface = new ExhibitGround(); this.scene.add(this.groundSurface.mesh);
  }
  add(loaded: LoadedModel, action: string, index: number) {
    const bounds = modelBounds(renderModel(loaded.model));
    this.items[index] = { loaded, transform: new THREE.Matrix4(), position: new THREE.Vector3(), bounds, options: { x: 0, y: 0, height: 0, scale: 1, speed: 1, sequence: sequenceFor(renderModel(loaded.model), action) }, touched: 0, ready: !loaded.model.Textures.some(texture => texture.Image), hydrating: false }; this.version++;
  }
  private transform(item: Item, index: number, settings: Settings) {
    const { options, bounds } = item, scale = options.scale;
    item.position.set(-Math.floor(index / settings.rows) * settings.spacing + options.x, index % settings.rows * settings.spacing + options.y, settings.height + options.height);
    const minimum = Number.isFinite(item.loaded.model.Info.MinimumExtent[2]) ? item.loaded.model.Info.MinimumExtent[2] : 0;
    item.transform.makeScale(scale, scale, scale).setPosition(item.position.x - bounds.center[0] * scale, item.position.y - bounds.center[1] * scale, item.position.z - minimum * scale);
  }
  layout(settings: Settings, fit = false) {
    this.items.forEach((item, index) => this.transform(item, index, settings)); this.version++;
    const extent = Math.max(settings.spacing * Math.min(settings.rows, this.total), settings.spacing * Math.ceil(this.total / settings.rows), 300);
    this.groundSurface.layout(extent, settings.height, -(Math.ceil(this.total / settings.rows) - 1) * settings.spacing / 2, (Math.min(settings.rows, this.total) - 1) * settings.spacing / 2);
    this.selection(this.selected); if (fit) this.fit(settings);
  }
  initialView(settings: Settings) {
    const rows = Math.min(3, Math.ceil(this.total / settings.rows));
    this.yaw = 0; this.pitch = .75;
    this.target.set(-(rows - 1) * settings.spacing / 2, (Math.min(settings.rows, this.total) - 1) * settings.spacing / 2, settings.height);
    this.distance = Math.max(300, settings.spacing * Math.max(rows, Math.min(settings.rows, this.total)) * 1.6);
  }
  fit(settings: Settings, index?: number) {
    const item = index === undefined ? undefined : this.items[index];
    if (item) { const sphere = this.sphere(item); this.target.copy(sphere.center); this.distance = sphere.radius * 4; }
    else { this.target.set(-(Math.ceil(this.total / settings.rows) - 1) * settings.spacing / 2, (Math.min(settings.rows, this.total) - 1) * settings.spacing / 2, settings.height); this.distance = Math.max(300, settings.spacing * Math.max(Math.min(settings.rows, this.total), Math.ceil(this.total / settings.rows)) * 1.6); }
  }
  action(action: string) { this.items.forEach(item => { item.options.sequence = sequenceFor(renderModel(item.loaded.model), action); item.renderer?.setSequence(item.options.sequence); }); this.version++; }
  item(index: number) { const item = this.items[index]; return item ? { loaded: item.loaded, options: { ...item.options }, position: item.position.clone() } : undefined; }
  change(index: number, value: Partial<ItemOptions>, settings: Settings, updateSelection = true) {
    const item = this.items[index]; if (!item) return;
    Object.assign(item.options, value);
    item.options.sequence = Math.max(0, Math.min(renderModel(item.loaded.model).Sequences.length - 1, item.options.sequence));
    if (value.sequence !== undefined) item.renderer?.setSequence(item.options.sequence);
    this.transform(item, index, settings); if (updateSelection) this.selection(this.selected); this.version++;
  }
  changeMany(changes: { index: number; value: Partial<ItemOptions> }[], settings: Settings) { changes.forEach(({ index, value }) => this.change(index, value, settings, false)); this.selection(this.selected); }
  selection(indices: number | number[]) {
    this.selected = typeof indices === 'number' ? indices < 0 ? [] : [indices] : indices;
    this.rings.forEach(ring => { this.scene.remove(ring); ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); }); this.rings = [];
    for (const index of this.selected) {
      const item = this.items[index]; if (!item) continue;
      const radius = Math.max(20, item.bounds.radius * item.options.scale * .65);
      const points = Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 32) * radius, Math.sin(i * Math.PI / 32) * radius, 0));
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x62baff, depthTest: false }));
      ring.position.copy(item.position).add(new THREE.Vector3(0, 0, 1)); this.scene.add(ring); this.rings.push(ring);
    }
    this.version++;
  }
  marquee(left: number, top: number, right: number, bottom: number) {
    const frustum = selectionFrustum(this.camera, Math.min(left, right), Math.max(top, bottom), Math.max(left, right), Math.min(top, bottom));
    return this.items.flatMap((item, index) => item && frustum.intersectsSphere(this.sphere(item)) ? [index] : []);
  }
  private sphere(item: Item) { return new THREE.Sphere(new THREE.Vector3().fromArray(item.bounds.center).applyMatrix4(item.transform), item.bounds.radius * item.options.scale); }
  ground(x: number, y: number, height: number) { return groundPoint(this.camera, x, y, height); }
  pan(dx: number, dy: number, origin = this.target.clone()) { this.target.copy(origin).add(cameraViewPan(this.camera, this.distance, dx, dy, this.renderer.domElement.clientHeight)); }
  floor(image?: ImageData) { this.groundSurface.image(image); this.version++; }
  minimap(settings: Settings) {
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const positions = this.items.flatMap((item, index) => item ? [{ index, x: item.position.x, y: item.position.y, visible: frustum.intersectsSphere(this.sphere(item)) }] : []), half = settings.spacing / 2;
    const bounds = { minX: -Math.max(half, (Math.ceil(this.total / settings.rows) - .5) * settings.spacing), minY: -half, maxX: half, maxY: Math.max(half, (Math.min(settings.rows, this.total) - .5) * settings.spacing) };
    for (const point of positions) { bounds.minX = Math.min(bounds.minX, point.x - half); bounds.minY = Math.min(bounds.minY, point.y - half); bounds.maxX = Math.max(bounds.maxX, point.x + half); bounds.maxY = Math.max(bounds.maxY, point.y + half); }
    return { bounds, positions, footprint: groundFootprint(this.camera, bounds, settings.height).map(p => ({ x: p.x, y: p.y })), camera: { x: this.camera.position.x, y: this.camera.position.y } };
  }
  draw(settings: Settings, delta: number, playing: boolean) {
    const canvas = this.renderer.domElement, width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    const pausedFrame = JSON.stringify([this.pose, settings, this.version, width, height]);
    if (!playing && pausedFrame === this.pausedFrame) return;
    canvas.dataset.playing = String(playing); canvas.dataset.renderedFrames = String(++this.frameCount);
    if (canvas.width !== width || canvas.height !== height) this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.camera.position.set(this.target.x + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance, this.target.y + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance, this.target.z + Math.sin(this.pitch) * this.distance); this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    gl.bindVertexArray(null); gl.depthMask(true); gl.colorMask(true, true, true, true); this.renderer.resetState(); this.renderer.setClearColor(settings.background); this.renderer.render(this.scene, this.camera); gl.bindVertexArray(null);
    const view = new Float32Array(this.camera.matrixWorldInverse.elements), projection = new Float32Array(this.camera.projectionMatrix.elements);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    let created = 0, visible = 0, pending = false;
    for (const item of this.items) {
      if (!item || item.touched === -1 || !frustum.intersectsSphere(this.sphere(item))) continue; visible++; item.touched = this.frameCount;
      try {
        if (!item.ready) {
          pending = true;
          if (!item.hydrating && this.loadingTextures < 4) {
            item.hydrating = true; this.loadingTextures++;
            void loadModel(item.loaded.ref, true, 256).then(loaded => { if (!this.destroyed) { item.loaded = loaded; item.ready = true; this.version++; } }, error => { if (!this.destroyed) { item.touched = -1; this.renderError = item.loaded.ref.path + '：' + String(error); } }).finally(() => { item.hydrating = false; this.loadingTextures--; });
          } continue;
        }
        if (!item.renderer) {
          if (created >= 2) { pending = true; continue; } created++;
          const renderer = managedRenderer(renderModel(item.loaded.model), gl); item.renderer = renderer;
          for (const [path, image] of item.loaded.images) renderer.setTextureImageData(path, image);
          renderer.setLightPosition(vec3.fromValues(1000, -1000, 2000)); renderer.setLightColor(vec3.fromValues(1, 1, 1)); renderer.setSequence(item.options.sequence); renderer.update(0);
        }
        const renderer = item.renderer, localView = mat4.multiply(mat4.create(), view, new Float32Array(item.transform.elements));
        const localEye = this.camera.position.clone().applyMatrix4(item.transform.clone().invert()), eye = vec3.fromValues(localEye.x, localEye.y, localEye.z);
        const rotation = billboardCameraRotation(this.yaw, this.pitch);
        renderer.setCamera(eye, rotation);
        if (playing) { const seq = renderModel(item.loaded.model).Sequences[renderer.getSequence()], speed = delta * settings.speed * item.options.speed; renderer.update(settings.loop ? speed : Math.min(speed, Math.max(0, seq.Interval[1] - renderer.getFrame()))); }
        else renderer.update(0);
        renderer.setTeamColor(rgb(settings.team)); renderer.render(localView, projection, {});
      } catch (error) { item.renderer?.destroy(); item.renderer = undefined; item.touched = -1; this.renderError = item.loaded.ref.path + '：' + String(error); }
    }
    let resident = this.items.filter(item => item?.renderer).length;
    for (const item of this.items.filter(item => item?.renderer && item.touched !== this.frameCount).sort((a, b) => a.touched - b.touched)) { if (resident <= 120) break; item.renderer!.destroy(); item.renderer = undefined; item.loaded = { ...item.loaded, images: new Map() }; item.ready = !item.loaded.model.Textures.some(texture => texture.Image); resident--; }
    this.pausedFrame = playing || pending ? undefined : pausedFrame;
    canvas.dataset.visibleModels = String(visible); canvas.dataset.gpuModels = String(resident);
  }
  pick(x: number, y: number) {
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x, y), this.camera); let index = -1, distance = Infinity;
    this.items.forEach((item, i) => { const hit = ray.ray.intersectSphere(this.sphere(item), new THREE.Vector3()); if (hit && hit.distanceTo(ray.ray.origin) < distance) { index = i; distance = hit.distanceTo(ray.ray.origin); } }); return index;
  }
  destroy() { this.destroyed = true; this.items.forEach(i => i.renderer?.destroy()); this.items = []; this.selection(-1); this.groundSurface.destroy(); this.renderer.dispose(); }
}
