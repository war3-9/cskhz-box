import { useRef } from 'react';
import { Move, Scan } from 'lucide-react';
import { useViewer } from '../workspace/store';
import { clampCaptureFrame, dragResizeCaptureFrame, type CaptureFrame } from './captureFrame';

type Drag = { pointerId: number; x: number; y: number; frame: CaptureFrame; resize: boolean };

export function CaptureFrameOverlay() {
  const frame = useViewer(s => s.captureFrame), patch = useViewer(s => s.patch);
  const drag = useRef<Drag | undefined>(undefined);
  const start = (event: React.PointerEvent<HTMLButtonElement>, resize: boolean) => {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, frame, resize };
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.closest('.viewer-canvas-host')?.getBoundingClientRect() ?? event.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const dx = (event.clientX - current.x) / bounds.width, dy = (event.clientY - current.y) / bounds.height;
    const next = current.resize
      ? dragResizeCaptureFrame(current.frame, dx, dy)
      : { ...current.frame, x: current.frame.x + dx, y: current.frame.y + dy };
    patch({ captureFrame: clampCaptureFrame(next) });
  };
  const stop = (event: React.PointerEvent<HTMLButtonElement>) => { if (drag.current?.pointerId === event.pointerId) drag.current = undefined; };
  return <div className="viewer-capture-frame" style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.width * 100}%`, height: `${frame.height * 100}%` }} aria-label="PNG 截图范围">
    <button className="viewer-capture-move" title="拖动以移动截图区域" aria-label="移动截图区域" onPointerDown={event => start(event, false)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}><Move size={14} /></button>
    <button className="viewer-capture-resize" title="拖动以调整截图大小" aria-label="调整截图大小" onPointerDown={event => start(event, true)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}><Scan size={14} /></button>
  </div>;
}
