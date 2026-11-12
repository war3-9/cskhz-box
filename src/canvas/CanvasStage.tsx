import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Layer, Stage, Transformer } from "react-konva";
import { FilePlus2 } from "lucide-react";
import { useEditor } from "../layers/store";
import { useLibrary } from "../assets/store";
import { ASSET_MIME } from "../assets/components/AssetPanel";
import { ImageNode } from "./ImageNode";
import { requireCanvas } from "./requireCanvas";
import { useCanvasViewport } from "./useCanvasViewport";
import { useViewportDrag } from "./useViewportDrag";
import { useCanvasGestures } from "./useCanvasGestures";
import { useCanvasInteraction } from "./interactionStore";
import { useBucket } from "./bucketStore";
import { bucketCursor, useBucketGesture } from "./useBucketGesture";
import { useFeatureActive } from '../app/FeatureActivity';
interface Props {
  zoom: number;
  setZoom: (value: number) => void;
  pan: boolean;
  newCanvas: () => void;
}
export function CanvasStage({ zoom, setZoom, pan, newCanvas }: Props) {
  const active = useFeatureActive();
  const { document, selectedId } = useEditor();
  const fixedId = useCanvasInteraction((state) => state.fixedId);
  const bucketActive = useBucket((state) => state.active);
  const stage = useRef<Konva.Stage>(null);
  const transformer = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Image>());
  const [over, setOver] = useState(false);
  const { host, size, content, scroll, offset, setOffset, setScroll, x, y } =
    useCanvasViewport(document.width, document.height, zoom, setZoom);
  const { dragging, begin } = useViewportDrag(offset, setOffset);
  const mouseDown = useCanvasGestures(stage, nodes, pan, begin);
  const bucketDown = useBucketGesture(stage, mouseDown);
  const register = useCallback((id: string, node: Konva.Image | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);
  useEffect(() => {
    const selected = document.layers.find(
      (l) => l.id === selectedId && l.visible && !l.locked,
    );
    const node = selected ? nodes.current.get(selected.id) : undefined;
    transformer.current?.nodes(node && (!pan || fixedId) ? [node] : []);
    transformer.current?.getLayer()?.batchDraw();
  }, [selectedId, document, pan, fixedId]);
  const scale = zoom;
  useEffect(() => {
    if (!active) return;
    const drop = (event: Event) => {
      const { assetId, x: pointerX, y: pointerY } = (event as CustomEvent<{ assetId: string; x: number; y: number }>).detail;
      const asset = useLibrary.getState().library.assets.find(a => a.id === assetId), rect = host.current?.getBoundingClientRect();
      if (!asset || !rect || pointerX < rect.left || pointerX > rect.right || pointerY < rect.top || pointerY > rect.bottom) return;
      const px = (pointerX - rect.left - x) / scale, py = (pointerY - rect.top - y) / scale;
      if (px >= 0 && py >= 0 && px <= document.width && py <= document.height && requireCanvas()) useEditor.getState().addAsset(asset, { x: px, y: py });
    };
    window.addEventListener('box-asset-drop', drop);
    return () => window.removeEventListener('box-asset-drop', drop);
  }, [active, document.width, document.height, x, y, scale, host]);
  return (
    <div
      ref={host}
      className={`canvas-viewport ${over ? "drag-over" : ""} ${pan || dragging ? "panning" : ""}`}
      style={bucketActive ? { cursor: bucketCursor } : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        useBucket.getState().clear();
      }}
      data-testid="canvas-dropzone"
      onWheel={() => useCanvasInteraction.getState().touch()}
      onScroll={(event) =>
        setScroll({
          x: event.currentTarget.scrollLeft,
          y: event.currentTarget.scrollTop,
        })
      }
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(ASSET_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const asset = useLibrary
          .getState()
          .library.assets.find(
            (a) => a.id === e.dataTransfer.getData(ASSET_MIME),
          );
        if (!asset) return;
        if (!requireCanvas()) return;
        const rect = host.current!.getBoundingClientRect();
        const px = (e.clientX - rect.left - x) / scale;
        const py = (e.clientY - rect.top - y) / scale;
        if (px < 0 || py < 0 || px > document.width || py > document.height)
          return;
        useEditor.getState().addAsset(asset, { x: px, y: py });
      }}
    >
      <div
        className="canvas-scroll-space"
        style={{ width: content.width, height: content.height }}
      />
      <div
        className="canvas-render-surface"
        style={{
          left: scroll.x,
          top: scroll.y,
          width: size.width,
          height: size.height,
        }}
      >
        {document.canvasCreated !== false && (
          <div
            className="artboard-background"
            style={{
              left: x,
              top: y,
              width: document.width * scale,
              height: document.height * scale,
            }}
          />
        )}
        <Stage
          ref={stage}
          width={size.width}
          height={size.height}
          x={x}
          y={y}
          scaleX={scale}
          scaleY={scale}
          draggable={false}
          onMouseDown={bucketDown}
        >
          <Layer
            clipX={0}
            clipY={0}
            clipWidth={document.width}
            clipHeight={document.height}
          >
            {document.layers.map((layer) => (
              <ImageNode key={layer.id} layer={layer} register={register} />
            ))}
          </Layer>
          <Layer>
            <Transformer
              ref={transformer}
              keepRatio
              flipEnabled={false}
              rotateEnabled
              borderStroke="#2563eb"
              anchorStroke="#2563eb"
              anchorFill="#ffffff"
              anchorSize={8}
              boundBoxFunc={(oldBox, newBox) =>
                Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8
                  ? oldBox
                  : newBox
              }
            />
          </Layer>
        </Stage>
        {document.canvasCreated === false && (
          <button className="canvas-empty canvas-uncreated" onClick={newCanvas}>
            <FilePlus2 size={26} />
            <strong>新建画布</strong>
          </button>
        )}
        {document.canvasCreated !== false && (
          <div className="canvas-dimension">
            {document.width} × {document.height}
          </div>
        )}
      </div>
    </div>
  );
}
