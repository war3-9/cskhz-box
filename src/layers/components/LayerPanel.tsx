import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Layers3,
  Lock,
  Trash2,
  Unlock,
  SlidersHorizontal,
  Pencil,
} from "lucide-react";
import { useEditor } from "../store";
import { IconButton } from "../../shared/components/IconButton";
import { useUi } from "../../app/uiStore";
import { LayerTextActions } from "./LayerTextActions";
import { LayerFillAction } from "./LayerFillAction";
import { LayerContextMenu } from "./LayerContextMenu";
import { LayerProperties } from "./LayerProperties";
import { LayerStyleDialog } from "../styles/LayerStyleDialog";
import { useLayerDrag } from './useLayerDrag';
import { LayerRenameDialog } from './LayerRenameDialog';
export function LayerPanel() {
  const { document, selectedId, select, updateLayer, deleteLayer, moveLayer, duplicateLayer, pasteLayer } =
    useEditor();
  const drag = useLayerDrag();
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [editSignal, setEditSignal] = useState<{ id: string; value: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renaming = document.layers.find(layer => layer.id === renamingId);
  const editing = document.layers.find((layer) => layer.id === editingId);
  const selected = document.layers.find((l) => l.id === selectedId);
  const index = document.layers.findIndex((l) => l.id === selectedId);
  return (
    <section className="layer-panel">
      <div className="layer-heading">
        <h2>
          <Layers3 size={15} />
          图层 <span>{document.layers.length}</span>
        </h2>
        <div>
          <IconButton label="重命名图层" disabled={!selected} onClick={() => setRenamingId(selectedId)}><Pencil size={15} /></IconButton>
          <IconButton label="编辑图层" disabled={!selected} onClick={() => setEditingId(selectedId)}><SlidersHorizontal size={15} /></IconButton>
          <IconButton
            label="图层上移"
            disabled={
              !selected ||
              selected.locked ||
              selected.kind === "base" ||
              index === document.layers.length - 1
            }
            onClick={() =>
              moveLayer(selectedId!, document.layers[index + 1].id)
            }
          >
            <ArrowUp size={15} />
          </IconButton>
          <IconButton
            label="图层下移"
            disabled={
              !selected ||
              selected.locked ||
              selected.kind === "base" ||
              index <= (document.layers[0]?.kind === "base" ? 1 : 0)
            }
            onClick={() =>
              moveLayer(selectedId!, document.layers[index - 1].id)
            }
          >
            <ArrowDown size={15} />
          </IconButton>
          <IconButton
            label="删除图层"
            disabled={!selected || selected.locked}
            onClick={() => deleteLayer(selectedId!)}
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>
      <div className="layer-body">
        <div ref={drag.list} className="layer-list" data-testid="layer-list">
          {[...document.layers].reverse().map((layer) => (
            <div
              key={layer.id}
              className={`layer-row ${selectedId === layer.id ? "selected" : ""} ${drag.dragId === layer.id ? 'is-dragging' : ''} ${drag.drop?.id === layer.id ? `drop-${drag.drop.position}` : ''}`}
              data-layer-id={layer.id}
              data-layer-name={layer.name}
              onContextMenu={(event) => {
                event.preventDefault();
                select(layer.id);
                setMenu({ x: event.clientX, y: event.clientY, id: layer.id });
              }}
            >
              <span className="layer-drag-handle" title="拖动调整图层顺序" onPointerDown={event => drag.start(event, layer.id)}><GripVertical size={12} className="drag-handle" /></span>
              <button className="layer-select" title="双击重命名图层" onPointerDown={event => drag.start(event, layer.id)} onClick={() => select(layer.id)} onDoubleClick={() => setRenamingId(layer.id)}>
                <img src={layer.imagePath} alt="" draggable={false} />
                <span title={layer.name}>{layer.name}</span>
                {layer.kind === "base" && <small>底层</small>}
              </button>
              {layer.text && <LayerTextActions layer={layer} editSignal={editSignal?.id === layer.id ? editSignal.value : 0} />}
              <LayerFillAction layer={layer} />
              <IconButton
                label={`${layer.visible ? "隐藏" : "显示"}${layer.name}`}
                onClick={() =>
                  updateLayer(layer.id, { visible: !layer.visible })
                }
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </IconButton>
              <IconButton
                label={`${layer.locked ? "解锁" : "锁定"}${layer.name}`}
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
              >
                {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </IconButton>
            </div>
          ))}
          {!document.layers.length && (
            <div className="empty-layers">暂无图层</div>
          )}
        </div>
        <LayerProperties key={selected?.id ?? "empty"} layer={selected} edit={() => setEditingId(selectedId)} />
      </div>
      {menu && <LayerContextMenu x={menu.x} y={menu.y} close={() => setMenu(null)}>
        <button onClick={() => { setRenamingId(menu.id); setMenu(null); }}>重命名图层</button>
        <button onClick={() => { setEditingId(menu.id); setMenu(null); }}>编辑图层</button><hr />
        <button onClick={() => { const l = document.layers.find((v) => v.id === menu.id); if (l) updateLayer(l.id, { rotation: l.rotation + 180 }); setMenu(null); }}>旋转 180 度</button>
        <button onClick={() => { const l = document.layers.find((v) => v.id === menu.id); if (l) updateLayer(l.id, { rotation: l.rotation + 90 }); setMenu(null); }}>顺时针旋转 90 度</button>
        <button onClick={() => { const l = document.layers.find((v) => v.id === menu.id); if (l) updateLayer(l.id, { rotation: l.rotation - 90 }); setMenu(null); }}>逆时针旋转 90 度</button><hr />
        <button onClick={() => { const l = document.layers.find((v) => v.id === menu.id); if (l) updateLayer(l.id, { flipX: !l.flipX }); setMenu(null); }}>水平翻转</button>
        <button onClick={() => { const l = document.layers.find((v) => v.id === menu.id); if (l) updateLayer(l.id, { flipY: !l.flipY }); setMenu(null); }}>垂直翻转</button><hr />
        <button onClick={() => { duplicateLayer(menu.id); setMenu(null); }}>复制图层</button><button onClick={() => { pasteLayer(); setMenu(null); }}>粘贴图层</button>
        <button onClick={async () => { const l = document.layers.find((v) => v.id === menu.id); if (l) await copyLayerToClipboard(l); setMenu(null); }}>复制图层为图片</button><hr />
        <button disabled={document.layers.find((v) => v.id === menu.id)?.locked || document.layers.find((v) => v.id === menu.id)?.kind === "base"} onClick={() => { deleteLayer(menu.id); setMenu(null); }}>删除</button>
        {document.layers.find((layer) => layer.id === menu.id)?.text && <button onClick={() => { setEditSignal({ id: menu.id, value: Date.now() }); setMenu(null); }}>编辑文字</button>}
      </LayerContextMenu>}
      {editing && <LayerStyleDialog key={editing.id} layer={editing} close={() => setEditingId(null)} />}
      {renaming && <LayerRenameDialog key={renaming.id} layer={renaming} close={() => setRenamingId(null)} />}
    </section>
  );
}

async function copyLayerToClipboard(layer: import("../../shared/types").ImageLayer) {
  try {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = layer.imagePath; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = layer.width; canvas.height = layer.height;
    const context = canvas.getContext("2d")!; context.globalAlpha = layer.opacity;
    context.translate(layer.width / 2, layer.height / 2); context.rotate(layer.rotation * Math.PI / 180);
    context.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1); context.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("当前环境不支持图片剪贴板");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    useUi.getState().notify("图层图片已复制到剪贴板");
  } catch (error) { useUi.getState().notify(error instanceof Error ? error.message : "复制图层图片失败", "error"); }
}
