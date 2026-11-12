import { useEffect, useState } from "react";
import { useEditor } from "../layers/store";
import { useTasks } from "../tasks/store";
import { Modal } from "../shared/components/Modal";
import {
  MIN_CANVAS_SIZE,
  MAX_CANVAS_SIZE,
  validCanvasSize,
} from "./dimensions";
export function CanvasSettings({
  close,
  create = false,
  created,
  initialName = "",
  onCreate,
  initialSize,
}: {
  close: () => void;
  create?: boolean;
  created?: () => void;
  initialName?: string;
  onCreate?: (settings: {
    name: string;
    width: number;
    height: number;
  }) => void;
  initialSize?: { width: number; height: number };
}) {
  const { document, resize } = useEditor();
  const [width, setWidth] = useState(initialSize?.width ?? document.width);
  const [height, setHeight] = useState(initialSize?.height ?? document.height);
  const [name, setName] = useState(initialName || "未命名作品");
  useEffect(() => setName(initialName || "未命名作品"), [initialName]);
  return (
    <Modal title={create ? "新建任务" : "画布尺寸"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!validCanvasSize(width, height)) return;
          if (create) {
            if (!name.trim()) return;
            const settings = { name: name.trim(), width, height };
            if (onCreate) onCreate(settings);
            else useTasks.getState().createTask(settings);
          } else resize(width, height);
          created?.();
          close();
        }}
      >
        {create && (
          <label>
            任务名称
            <input
              aria-label="任务名称"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <label>
          宽度（px）
          <input
            aria-label="画布宽度"
            type="number"
            required
            min={MIN_CANVAS_SIZE}
            max={MAX_CANVAS_SIZE}
            step="1"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <label>
          高度（px）
          <input
            aria-label="画布高度"
            type="number"
            required
            min={MIN_CANVAS_SIZE}
            max={MAX_CANVAS_SIZE}
            step="1"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            取消
          </button>
          <button
            className="primary"
            disabled={
              !validCanvasSize(width, height) || (create && !name.trim())
            }
          >
            {create ? "创建画布" : "应用"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
