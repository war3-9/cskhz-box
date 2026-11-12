import { useEditor } from "../layers/store";
import { InteractionStatus } from "./interactionStatus";

export function EditorStatus() {
  const document = useEditor((state) => state.document);
  return (
    <div className="editor-status">
      <InteractionStatus />
      <span className="saved-dot" />
      本地工作区 <span className="status-divider" />
      {document.canvasCreated === false
        ? "未创建画布"
        : `${document.width} × ${document.height} px`}
      <span className="status-hint">{document.layers.length} 个图层</span>
    </div>
  );
}
