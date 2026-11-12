import {
  Hand,
  ImagePlus,
  Maximize,
  MousePointer2,
  Settings2,
  FilePlus2,
  ZoomIn,
  ZoomOut,
  PaintBucket,
  Undo2,
  Redo2,
} from "lucide-react";
import { IconButton } from "../shared/components/IconButton";
import { clampZoom, MIN_ZOOM, MAX_ZOOM } from "../canvas/useCanvasViewport";
import { useBucket } from "../canvas/bucketStore";
import { BucketPalette } from "../canvas/BucketPalette";
import { useEditor } from "../layers/store";
export function CanvasToolbar({
  pan,
  setPan,
  zoom,
  setZoom,
  importBase,
  settings,
  newCanvas,
  fit,
  disabled = false,
}: {
  pan: boolean;
  setPan: (v: boolean) => void;
  zoom: number;
  setZoom: (v: number) => void;
  importBase: () => void;
  settings: () => void;
  newCanvas: () => void;
  fit: () => void;
  disabled?: boolean;
}) {
  const bucketActive = useBucket((state) => state.active);
  const { undo, redo, past, future } = useEditor();
  return (
    <div className="canvas-toolbar">
      <div className="tool-group">
        <div className="segmented">
          <IconButton
            label="选择工具"
            disabled={disabled}
            aria-pressed={!pan}
            className={!pan ? "icon-button active" : "icon-button"}
            onClick={() => {
              useBucket.getState().clear();
              setPan(false);
            }}
          >
            <MousePointer2 size={17} />
          </IconButton>
          <IconButton
            label="平移画布"
            disabled={disabled}
            aria-pressed={pan}
            className={pan ? "icon-button active" : "icon-button"}
            onClick={() => {
              useBucket.getState().clear();
              setPan(true);
            }}
          >
            <Hand size={17} />
          </IconButton>
        </div>
        <div className="bucket-tool">
          <IconButton
            label="水桶填色"
            aria-pressed={bucketActive}
            disabled={disabled}
            className={bucketActive ? "icon-button active" : "icon-button"}
            onClick={() => {
              useBucket.getState().toggle();
            }}
          >
            <PaintBucket size={17} />
          </IconButton>
          <BucketPalette />
        </div>
        <span className="toolbar-divider" />
        <IconButton label="新建画布" onClick={newCanvas}>
          <FilePlus2 size={18} />
        </IconButton>
        <button
          className="text-button"
          aria-label="导入底图"
          title="导入底图"
          onClick={importBase}
          disabled={disabled}
        >
          <ImagePlus size={16} />
          <span className="toolbar-import-label">导入底图</span>
        </button>
      </div>
      <div className="tool-group">
        <IconButton
          label="撤销"
          disabled={disabled || !past.length}
          onClick={undo}
        >
          <Undo2 size={18} />
        </IconButton>
        <IconButton
          label="重做"
          disabled={disabled || !future.length}
          onClick={redo}
        >
          <Redo2 size={18} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton
          label="缩小画布"
          disabled={disabled || zoom <= MIN_ZOOM}
          onClick={() => setZoom(clampZoom(zoom / 1.25))}
        >
          <ZoomOut size={16} />
        </IconButton>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <IconButton
          label="放大画布"
          disabled={disabled || zoom >= MAX_ZOOM}
          onClick={() => setZoom(clampZoom(zoom * 1.25))}
        >
          <ZoomIn size={16} />
        </IconButton>
        <IconButton label="适应画布" onClick={fit} disabled={disabled}>
          <Maximize size={16} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton label="画布尺寸" onClick={settings} disabled={disabled}>
          <Settings2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}
