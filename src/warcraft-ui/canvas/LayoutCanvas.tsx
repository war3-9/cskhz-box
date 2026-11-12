import { useEffect, useRef, useState, type ReactNode } from 'react';
import type Konva from 'konva';
import { Stage, Layer } from 'react-konva';
import { stageSize, useLayoutStore } from '../state/layout';
import { CanvasToolbar } from './CanvasToolbar';
import { useCanvasView } from './view';
import { effectiveVisible } from '../document/relations';
import { useLayoutGesture, previewNodes } from '../state/gesture';
import { PreviewNode } from './PreviewNode';
import { useCanvasNavigation } from './useCanvasNavigation';

export function LayoutCanvas({ footer, header, saveControl }: { footer?: ReactNode; header?: ReactNode; saveControl?: ReactNode }) {
  const committed = useLayoutStore((state) => state.nodes);
  const drag = useLayoutGesture(state => state.drag);
  const nodes = previewNodes(committed, drag);
  const select = useLayoutStore((state) => state.select);
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const [scale, setScale] = useState(1);
  const view = useCanvasView();
  const background = useLayoutStore(state => state.background);
  useEffect(() => {
    const cancel = () => {
      useLayoutGesture.getState().clear();
      stage.current?.find('Transformer').forEach(node => (node as Konva.Transformer).stopTransform());
      stage.current?.find('Group,Rect,Text,Image').forEach(node => { if (node.isDragging()) node.stopDrag(); });
    };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('keydown', keydown); cancel(); };
  }, []);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, Math.max(0.05, Math.min((entry.contentRect.width - 64) / stageSize.width,
        (entry.contentRect.height - 64) / stageSize.height))));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const actualScale = view.zoom ?? scale;
  useCanvasNavigation(container, stage, actualScale);
  return <section className="canvas-panel">
    {header}
    <CanvasToolbar scale={actualScale} saveControl={saveControl} />
    <div className="stage-wrap" ref={container} data-testid="canvas-wrap" title="空白处按住左键拖动画布；未选中组件时滚轮缩放">
      <div className={`game-canvas ${view.grid ? 'with-grid' : ''} ${view.boundary ? 'with-boundary' : ''}`}
        style={{ width: stageSize.width * actualScale, height: stageSize.height * actualScale,
          transform: `translate(calc(-50% + ${view.panX}px), calc(-50% + ${view.panY}px))`,
          backgroundSize: background ? '100% 100%' : `${24 * actualScale}px ${24 * actualScale}px`,
          backgroundImage: background ? `url(${background})` : undefined }}>
      <Stage ref={stage} width={stageSize.width * actualScale} height={stageSize.height * actualScale} scaleX={actualScale} scaleY={actualScale}
        onMouseDown={(event) => { if (event.target === stage.current) select(null); }}
        onTouchStart={(event) => { if (event.target === stage.current) select(null); }}>
        <Layer>{nodes.filter(node => effectiveVisible(node, nodes) && (!view.hiddenFrames || node.kind === 'text')).map((node) => <PreviewNode key={node.id} node={node} scale={actualScale} />)}</Layer>
      </Stage>
      <span className="canvas-size">游戏画布　1920 × 1080</span>
      </div>
    </div>
    {footer && <footer className="canvas-footer">{footer}</footer>}
  </section>;
}
