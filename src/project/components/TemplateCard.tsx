import { Download, Trash2 } from "lucide-react";
import { IconButton } from "../../shared/components/IconButton";
import { useUi } from "../../app/uiStore";
import { deleteTemplate, exportTemplate } from "../templates";
import type { ProjectTemplate } from "../templates";

export function TemplateCard({
  template,
  refresh,
  createTask,
}: {
  template: ProjectTemplate;
  refresh: () => Promise<void>;
  createTask: (template: ProjectTemplate) => void;
}) {
  const run = async (work: () => unknown) => {
    try {
      await work();
    } catch (error) {
      useUi.getState().notify(String(error), "error");
    }
  };
  return (
    <article className="template-card">
      <button className="template-open" onClick={() => createTask(template)}>
        <span className="template-preview">
          <img src={template.preview} alt={`${template.name}预览`} />
        </span>
        <span className="template-info">
          <strong title={template.name}>{template.name}</strong>
          <small>
            {template.project.document.width} ×{" "}
            {template.project.document.height} px ·{" "}
            {template.project.document.layers.length} 个图层
          </small>
        </span>
      </button>
      <div className="template-card-footer">
        <span>{template.source === "builtin" ? "默认模板" : "我的模板"}</span>
        <IconButton
          label={`导出初始模板${template.name}`}
          onClick={() =>
            void run(async () => {
              if (await exportTemplate(template))
                useUi.getState().notify("初始模板文件已导出");
            })
          }
        >
          <Download size={15} />
        </IconButton>
        {template.source !== "builtin" && (
          <IconButton
            label={`删除模板${template.name}`}
            onClick={() =>
              void run(async () => {
                await deleteTemplate(template.id);
                await refresh();
              })
            }
          >
            <Trash2 size={15} />
          </IconButton>
        )}
      </div>
    </article>
  );
}
