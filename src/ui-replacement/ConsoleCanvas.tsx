import { useEffect, useRef, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { canvasSize } from './native';
import { useConsole } from './store';
import { ConsoleScene } from './ConsoleScene';

export function ConsoleCanvas({ active, onReplace, onReset }: {
  active: boolean; onReplace: (id: string) => void; onReset: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.5);
  const layers = useConsole(state => state.layers);
  const map = useConsole(state => state.map);
  useEffect(() => {
    const node = container.current;
    if (!node || !active) return;
    const observer = new ResizeObserver(([entry]) => setFit(Math.max(0.05,
      Math.min((entry.contentRect.width - 24) / canvasSize.width, (entry.contentRect.height - 24) / canvasSize.height, 1))));
    observer.observe(node); return () => observer.disconnect();
  }, [active]);
  return <div ref={container} className="console-canvas-wrap" data-testid="console-canvas-wrap">
    <div className="console-canvas-scroll">
      <div className="console-artboard" style={{ width: canvasSize.width * fit, height: canvasSize.height * fit }}
        data-testid="console-artboard" data-width={canvasSize.width} data-height={canvasSize.height}>
        {map ? <Stage width={canvasSize.width * fit} height={canvasSize.height * fit} scaleX={fit} scaleY={fit} listening={active}>
          <Layer><ConsoleScene side="main" layers={layers} active={active} onReplace={onReplace} onReset={onReset} /></Layer>
        </Stage> : <div className="console-empty-state">
          <p>请打开你的地图</p>
          <span>支持地图格式：.w3x / .w3m</span>
        </div>}
      </div>
    </div>
  </div>;
}
