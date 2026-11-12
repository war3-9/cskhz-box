import { useEffect, useState } from "react";
import { FileStack, Plus } from "lucide-react";
import { useEditor } from "../../layers/store";
import { useUi } from "../../app/uiStore";
import { portableProject } from "../files";
import { listTemplates, saveTemplate } from "../templates";
import { TemplateCard } from "./TemplateCard";
import type { ProjectTemplate } from "../templates";
import { Modal } from "../../shared/components/Modal";
import { CanvasSettings } from "../../canvas/CanvasSettings";
import { loadTemplate } from "../templates";

export function TemplatePanel() {
  const { document } = useEditor();
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(document.name);
  const [templateToCreate, setTemplateToCreate] =
    useState<ProjectTemplate | null>(null);
  const refresh = () => listTemplates().then(setTemplates);

  useEffect(() => {
    void refresh().catch((error) =>
      useUi.getState().notify(String(error), "error"),
    );
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await saveTemplate(name, await portableProject());
      await refresh();
      setNaming(false);
      useUi.getState().notify("模板已保存");
    } catch (error) {
      useUi.getState().notify(`保存模板失败：${String(error)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="asset-panel template-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <FileStack size={19} />
            模板
          </h2>
          <span className="panel-subtitle">默认模板 · 我的模板</span>
        </div>
        <button
          className="text-button"
          disabled={busy || document.canvasCreated === false}
          onClick={() => {
            setName(document.name);
            setNaming(true);
          }}
        >
          <Plus size={16} />
          保存为模板
        </button>
      </div>
      <div className="template-list">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            refresh={refresh}
            createTask={setTemplateToCreate}
          />
        ))}
        {!templates.length && (
          <div className="empty-panel">
            <FileStack size={28} />
            <span>暂无模板</span>
          </div>
        )}
      </div>
      {naming && (
        <Modal
          title="保存为模板"
          close={() => {
            if (!busy) setNaming(false);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label>
              模板名称
              <input
                autoFocus
                required
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setNaming(false)}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={busy || !name.trim()}
                type="submit"
              >
                {busy ? "保存中…" : "保存模板"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {templateToCreate && (
        <CanvasSettings
          create
          initialName={templateToCreate.name}
          initialSize={templateToCreate.project.document}
          close={() => setTemplateToCreate(null)}
          onCreate={({ name: taskName, width, height }) => {
            loadTemplate(templateToCreate, taskName, { width, height });
            setTemplateToCreate(null);
          }}
        />
      )}
    </aside>
  );
}
