import { useEditor } from "../layers/store";
import { useUi } from "../app/uiStore";

export function requireCanvas() {
  if (useEditor.getState().document.canvasCreated !== false) return true;
  useUi.getState().notify("请先新建画布并设置像素尺寸。", "error");
  return false;
}
