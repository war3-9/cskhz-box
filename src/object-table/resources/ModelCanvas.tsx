import { useEffect, useRef, useState } from 'react';
import type { LoadedModel } from '../../model-viewer/types';
import { War3Engine } from '../../model-viewer/renderer/engine';
import type { ResourceSession } from './session';
import { importCamera } from './camera';

export function useResourceModel(session: ResourceSession, path: string) {
  const [loaded, setLoaded] = useState<LoadedModel>(), [error, setError] = useState('');
  useEffect(() => {
    let active = true; setLoaded(undefined); setError('');
    void session.model(path).then(value => { if (active) setLoaded(value); }, error => { if (active) setError(String(error)); });
    return () => { active = false; };
  }, [session, path]);
  return { loaded, error };
}
export const previewSequence = (loaded: LoadedModel) => Math.max(0, loaded.model.Sequences.findIndex(sequence => /^stand\b/i.test(sequence.Name)));

/** Only the hovered/focused card and the inspected model own animation loops. */
export function ModelCanvas({ loaded, sequence, label }: { loaded: LoadedModel; sequence?: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null), engine = useRef<War3Engine | undefined>(undefined);
  const [error, setError] = useState('');
  const camera = useRef({ yaw: 0, pitch: .12, distance: 3.6, panX: 0, panY: 0 });
  const drag = useRef<{ x: number; y: number } | undefined>(undefined), moved = useRef(false);
  const selected = sequence ?? previewSequence(loaded), currentSequence = useRef(selected); currentSequence.current = selected;
  useEffect(() => {
    const target = canvas.current; if (!target) return;
    let frame = 0, last = 0, active: War3Engine | undefined; setError('');
    try {
      active = new War3Engine(target, loaded); engine.current = active;
      camera.current = importCamera(active, Math.max(1, target.clientWidth) / Math.max(1, target.clientHeight));
      active.sequence(currentSequence.current);
      const tick = (now: number) => {
        if (!active) return;
        try {
          // 30 fps and pause hidden documents; all other cards keep their cached thumbnail.
          if (!document.hidden && now - last >= 1000 / 30) {
            const width = Math.max(1, target.clientWidth), height = Math.max(1, target.clientHeight);
            if (target.width !== width) target.width = width;
            if (target.height !== height) target.height = height;
            const step = last ? Math.min(100, now - last) : 0; last = now;
            active.update(step, true);
            const anim = active.data.Sequences[active.renderer.getSequence()];
            if (active.renderer.getFrame() >= anim.Interval[1]) active.sequence(currentSequence.current);
            active.draw(camera.current, '#20252b', '#ed3434');
          } else if (document.hidden) last = now;
          frame = requestAnimationFrame(tick);
        } catch (error) { setError(String(error)); }
      };
      frame = requestAnimationFrame(tick);
    } catch (error) { setError(String(error)); }
    return () => {
      cancelAnimationFrame(frame); engine.current = undefined; active?.destroy();
      const gl = active?.gl;
      queueMicrotask(() => { if (!target.isConnected) gl?.getExtension('WEBGL_lose_context')?.loseContext(); });
    };
  }, [loaded]);
  useEffect(() => { try { engine.current?.sequence(selected); } catch (error) { setError(String(error)); } }, [selected]);
  useEffect(() => {
    const target = canvas.current; if (!target) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); camera.current.distance = Math.max(1.5, Math.min(40, camera.current.distance * Math.exp(event.deltaY * .001))); };
    target.addEventListener('wheel', wheel, { passive: false });
    return () => target.removeEventListener('wheel', wheel);
  }, []);
  return <><canvas ref={canvas} aria-label={label}
    onPointerDown={event => { moved.current = false; drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (!drag.current) return;
      const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) moved.current = true;
      camera.current.yaw -= dx * .008; camera.current.pitch = Math.max(-1.4, Math.min(1.4, camera.current.pitch + dy * .008));
      drag.current = { x: event.clientX, y: event.clientY };
    }}
    onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }} onLostPointerCapture={() => { drag.current = undefined; }}
    onClick={event => { if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false; } }} />
    {error && <small role="alert">{error}</small>}</>;
}

export function LiveResourceCard({ session, path }: { session: ResourceSession; path: string }) {
  const { loaded, error } = useResourceModel(session, path);
  return loaded ? <ModelCanvas loaded={loaded} label={`模型交互预览 ${path}`} /> : <span>{error || '加载动态预览…'}</span>;
}
