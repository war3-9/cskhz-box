import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { loadModel } from '../resources/models';
import { readResource } from '../resources/providers';
import { decodeTexture } from '../resources/textures';
import { isTexture, type ResourceRef } from '../types';
import { War3Engine, sequenceFor } from '../renderer/engine';
import type { Camera, Settings } from '../workspace/store';
export interface CaptureOptions { format: 'raw' | 'png' | 'gif'; size: number; transparent: boolean; fps: number; seconds: number; settings: Settings; camera: Camera; sequence?: number; frame?: number }
export const breathe = () => new Promise<void>(resolve => setTimeout(resolve, 0));
export async function capture(ref: ResourceRef, options: CaptureOptions, stopped: () => boolean) {
  if (stopped()) throw new Error('导出已取消');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = options.size;
  if (isTexture(ref.path)) {
    const [image] = await decodeTexture(await readResource(ref), ref.path);
    const original = document.createElement('canvas'); original.width = image.width; original.height = image.height; original.getContext('2d')!.putImageData(image, 0, 0);
    canvas.getContext('2d')!.drawImage(original, 0, 0, canvas.width, canvas.height);
    return png(canvas);
  }
  const loaded = await loadModel(ref), engine = new War3Engine(canvas, loaded);
  try {
    engine.sequence(options.sequence ?? sequenceFor(engine.data, options.settings.action), options.frame);
    const draw = () => engine.draw(options.camera, options.settings.background, options.settings.team, options.transparent);
    if (options.format === 'png') { draw(); return await png(canvas); }
    const encoder = GIFEncoder(), interval = engine.data.Sequences[engine.renderer.getSequence()].Interval;
    const duration = Math.min(options.seconds * 1000, Math.max(1, interval[1] - interval[0]));
    const count = Math.max(2, Math.ceil(duration * options.fps / 1000)), delay = 1000 / options.fps;
    const sample = document.createElement('canvas'); sample.width = sample.height = options.size;
    const context = sample.getContext('2d', { willReadFrequently: true })!;
    for (let i = 0; i < count; i++) {
      if (stopped()) throw new Error('导出已取消');
      draw(); context.clearRect(0, 0, sample.width, sample.height); context.drawImage(canvas, 0, 0);
      const rgba = new Uint8Array(context.getImageData(0, 0, sample.width, sample.height).data);
      const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(rgba, palette, 'rgba4444');
      const transparentIndex = palette.findIndex(c => c[3] === 0);
      encoder.writeFrame(index, sample.width, sample.height, { palette, delay, repeat: 0, transparent: options.transparent && transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex) });
      engine.update(delay * options.settings.speed, options.settings.loop); await breathe();
    }
    encoder.finish(); return Uint8Array.from(encoder.bytes());
  } finally { engine.destroy(); }
}
function png(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) reject(new Error('PNG 编码失败'));
    else void blob.arrayBuffer().then(bytes => resolve(new Uint8Array(bytes)), reject);
  }, 'image/png'));
}
