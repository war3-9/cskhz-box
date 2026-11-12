import { useEffect, useRef, useState } from "react";
import { FileImage, X } from "lucide-react";
import { IconButton } from "../shared/components/IconButton";
import { Modal } from "../shared/components/Modal";
import { saveProject } from "../project/files";
import { useUi } from "../app/uiStore";
import { isTaskDirty, useTasks } from "./store";
import "./tasks.css";

export function TaskBar() {
  const { tasks, activeId, activate, close } = useTasks();
  const [closingId, setClosingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const closing = tasks.find((task) => task.id === closingId);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);
  const requestClose = (id: string) => {
    const task = tasks.find((item) => item.id === id);
    if (task && isTaskDirty(task)) setClosingId(id);
    else close(id);
  };
  const saveAndClose = async () => {
    if (!closing || busy) return;
    setBusy(true);
    try {
      const document = closing.document;
      if (await saveProject(document, closing.id)) {
        const latest = useTasks
          .getState()
          .tasks.find((task) => task.id === closing.id);
        if (latest?.document === document) {
          close(closing.id);
          setClosingId(null);
        }
      }
    } catch (error) {
      useUi.getState().notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div
        className="task-tabs"
        role="tablist"
        aria-label="作品任务"
        ref={list}
      >
        {tasks.map((task) => (
          <div
            className={`task-tab ${task.id === activeId ? "active" : ""}`}
            key={task.id}
          >
            <button
              role="tab"
              aria-selected={task.id === activeId}
              title={`${task.document.name} · ${task.document.width} × ${task.document.height} px`}
              onClick={() => activate(task.id)}
            >
              <FileImage size={14} />
              <span>{task.document.name}</span>
              {isTaskDirty(task) && (
                <span className="task-dirty" aria-label="未保存">
                  *
                </span>
              )}
            </button>
            <IconButton
              label={`关闭任务：${task.document.name}`}
              onClick={() => requestClose(task.id)}
            >
              <X size={14} />
            </IconButton>
          </div>
        ))}
      </div>
      {closing && (
        <Modal
          title="关闭任务"
          close={() => {
            if (!busy) setClosingId(null);
          }}
        >
          <div className="task-close-body">
            <p title={closing.document.name}>
              是否保存对“{closing.document.name}”的修改？
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setClosingId(null)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  close(closing.id);
                  setClosingId(null);
                }}
              >
                关闭不保存
              </button>
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void saveAndClose()}
              >
                {busy ? "保存中…" : "保存并关闭"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
