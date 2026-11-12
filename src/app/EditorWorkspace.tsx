import { useCallback, useRef, useState } from "react";
import { CategoryPanel } from "../assets/components/CategoryPanel";
import { AssetPanel } from "../assets/components/AssetPanel";
import { CanvasStage } from "../canvas/CanvasStage";
import { CanvasSettings } from "../canvas/CanvasSettings";
import { CanvasToolbar } from "../tools/CanvasToolbar";
import { LayerPanel } from "../layers/components/LayerPanel";
import { useEditor } from "../layers/store";
import { useUi } from "./uiStore";
import { ExportDialog } from "../export/ExportDialog";
import { importImage } from "../shared/image";
import { TitleBar } from "./TitleBar";
import { useShortcuts } from "../shortcuts/useShortcuts";
import "./styles.css";
import "../assets/categories.css";
import "../canvas/canvas.css";
import "../layers/layers.css";
import "../assets/assets.css";
import "../shared/dialog.css";
import "../project/templates.css";
import "./responsive.css";
import { requireCanvas } from "../canvas/requireCanvas";
import { clampZoom } from "../canvas/useCanvasViewport";
import { EditorStatus } from "../canvas/EditorStatus";
import { TaskBar } from "../tasks/TaskBar";
import { useTasks } from "../tasks/store";
import { useAssetDrag } from '../assets/pointerDrag';

export function EditorWorkspace({ goHome, active }: { goHome: () => void; active: boolean }) {
  const { document } = useEditor();
  const activeTaskId = useTasks((state) => state.activeId);
  const [pan, setPan] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitKey, setFitKey] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewCanvas, setShowNewCanvas] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const assetDrag = useAssetDrag();
  const activateSelection = useCallback(() => setPan(false), []);
  useShortcuts(activateSelection, active);
  const importBase = () => {
    if (requireCanvas()) input.current?.click();
  };
  const onImport = async (file?: File) => {
    if (!file) return;
    if (!requireCanvas()) return;
    try {
      useEditor.getState().setBase(await importImage(file));
      useUi.getState().notify("底图已添加");
    } catch (error) {
      useUi.getState().notify(String(error), "error");
    } finally {
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <TitleBar exportArtwork={() => setShowExport(true)} goHome={goHome} />
      <main className="main-layout">
        <CategoryPanel />
        <section className="editor-area">
          <div className="editor-toolbar-row">
            <button
              className="task-create"
              onClick={() => setShowNewCanvas(true)}
            >
              <span aria-hidden="true">＋</span> 新建任务
            </button>
            <CanvasToolbar
              disabled={!activeTaskId}
              pan={pan}
              setPan={setPan}
              zoom={zoom}
              setZoom={setZoom}
              fit={() => {
                const viewport =
                  window.document.querySelector<HTMLElement>(
                    ".canvas-viewport",
                  );
                if (viewport)
                  setZoom(
                    clampZoom(
                      Math.min(
                        (viewport.clientWidth - 80) / document.width,
                        (viewport.clientHeight - 80) / document.height,
                      ),
                    ),
                  );
                setPan(false);
                setFitKey((value) => value + 1);
              }}
              importBase={importBase}
              settings={() => setShowSettings(true)}
              newCanvas={() => setShowNewCanvas(true)}
            />
          </div>
          <div className="task-row">
            <TaskBar />
          </div>
          {activeTaskId ? (
            <>
              <div className="canvas-area">
                <CanvasStage
                  key={`${activeTaskId}:${fitKey}`}
                  zoom={zoom}
                  setZoom={setZoom}
                  pan={pan}
                  newCanvas={() => setShowNewCanvas(true)}
                />
              </div>
              <EditorStatus />
              <LayerPanel />
            </>
          ) : (
            <div className="task-empty" />
          )}
        </section>
        <AssetPanel />
      </main>
      <input
        ref={input}
        hidden
        type="file"
        aria-label="导入底图文件"
        accept="image/png,image/jpeg"
        onChange={(e) => onImport(e.target.files?.[0])}
      />
      {active && assetDrag.assetId && <div className="asset-drag-ghost" style={{ left: assetDrag.x + 12, top: assetDrag.y + 12 }}>添加素材</div>}
      {showExport && <ExportDialog close={() => setShowExport(false)} />}{" "}
      {showSettings && (
        <CanvasSettings
          close={() => setShowSettings(false)}
          created={() => {
            setZoom(1);
            setPan(false);
            setFitKey((value) => value + 1);
          }}
        />
      )}
      {showNewCanvas && (
        <CanvasSettings
          create
          close={() => setShowNewCanvas(false)}
          created={() => {
            setZoom(1);
            setPan(false);
            setFitKey((value) => value + 1);
          }}
        />
      )}
    </>
  );
}
