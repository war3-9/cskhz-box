import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { LoadedModel } from '../types';
import { useViewer } from '../workspace/store';
import { War3Engine } from './engine';
import { CaptureFrameOverlay } from '../inspector/CaptureFrameOverlay';
import { captureCanvasRegion } from '../inspector/captureFrame';
import { appearanceNote } from '../resources/appearance';
export function ModelCanvas({ loaded, active, captureRef }: { loaded: LoadedModel; active: boolean; captureRef: MutableRefObject<(() => Promise<Blob>) | undefined> }) {
  const canvas = useRef<HTMLCanvasElement>(null), instance = useRef<War3Engine | undefined>(undefined);
  const drag = useRef<{ x: number; y: number; pan: boolean } | undefined>(undefined);
  const settings = useViewer(s => s.settings);
  const [error, setError] = useState(''), [generation, setGeneration] = useState(0);
  const seek = useViewer(s => s.seek), sequence = useViewer(s => s.sequence);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    captureRef.current = () => {
      const engine = instance.current;
      if (!engine || engine.gl.isContextLost()) return Promise.reject(new Error('模型尚未完成渲染，请稍后重试'));
      const state = useViewer.getState();
      engine.draw(state.camera, state.settings.background, state.settings.team);
      return captureCanvasRegion(target, state.captureFrame);
    };
    return () => { captureRef.current = undefined; };
  }, [captureRef, loaded]);
  useEffect(() => {
    const target = canvas.current!;
    const lost = (event: Event) => { event.preventDefault(); setError('渲染上下文丢失'); };
    const restored = () => setGeneration(n => n + 1);
    target.addEventListener('webglcontextlost', lost);
    target.addEventListener('webglcontextrestored', restored);
    return () => { target.removeEventListener('webglcontextlost', lost); target.removeEventListener('webglcontextrestored', restored); };
  }, []);
  useEffect(() => {
    if (!active || !canvas.current) return;
    let raf = 0, last = performance.now(), frameTime = 0;
    const target = canvas.current;
    try {
      const engine = new War3Engine(target, loaded); instance.current = engine; setError('');
      engine.sequence(useViewer.getState().sequence, useViewer.getState().frame || undefined);
      const tick = (now: number) => {
        const state = useViewer.getState(), delta = Math.min(50, now - last); last = now;
        const width = Math.max(1, Math.round(target.clientWidth * Math.min(2, devicePixelRatio))), height = Math.max(1, Math.round(target.clientHeight * Math.min(2, devicePixelRatio)));
        if (target.width !== width || target.height !== height) { target.width = width; target.height = height; }
        if (state.playing && engine.update(delta * state.settings.speed, state.settings.loop)) state.patch({ playing: false, frame: engine.renderer.getFrame() });
        engine.draw(state.camera, state.settings.background, state.settings.team);
        if (now - frameTime > 100) { state.patch({ frame: engine.renderer.getFrame() }); frameTime = now; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => { cancelAnimationFrame(raf); const state = useViewer.getState(); if (state.seek === seek && state.sequence === sequence && state.current?.sourceId === loaded.ref.sourceId && state.current.path === loaded.ref.path) state.patch({ frame: engine.renderer.getFrame() }); engine.destroy(); instance.current = undefined; };
    } catch (failure) { setError(String(failure)); }
  }, [loaded, active, generation, sequence, seek]);
  useEffect(() => { const engine = instance.current; if (engine) engine.renderer.setTeamColor((() => { const n = Number.parseInt(settings.team.slice(1), 16); return new Float32Array([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]); })()); }, [settings.team]);
  const note = appearanceNote(loaded.model);
  const missing = loaded.dependencies.filter(d => d.error);
  return <div className="viewer-canvas-host">{(note || missing.length > 0) && <div className="viewer-appearance-note" role="status">{note || `缺少 ${missing.length} 个贴图资源：${missing.map(d => d.path).join('、')}。请在右侧资源依赖中查看原因。`}</div>}{error && <div className="viewer-render-error">{error}<button onClick={() => setGeneration(n => n + 1)}>重试</button></div>}<canvas ref={canvas} aria-label="模型预览" onContextMenu={e => e.preventDefault()}
    onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}
    onPointerMove={e => { if (!drag.current) return; const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; const state = useViewer.getState(), camera = { ...state.camera };
      if (drag.current.pan) { camera.panX -= dx / 200; camera.panY += dy / 200; } else { camera.yaw -= dx * .008; camera.pitch = Math.max(-1.4, Math.min(1.4, camera.pitch + dy * .008)); }
      state.patch({ camera }); drag.current.x = e.clientX; drag.current.y = e.clientY; }}
    onWheel={e => { const state = useViewer.getState(); state.patch({ camera: { ...state.camera, distance: Math.max(1, Math.min(25, state.camera.distance * Math.exp(e.deltaY * .001))) } }); }} /><CaptureFrameOverlay /></div>;
}
