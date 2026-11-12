import { get, set } from "idb-keyval";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { ProjectFile } from "../shared/types";
import { getBuiltinLibrary } from "../assets/services/builtin";
import { restoreProject } from "./builtinReferences";
import { useTasks, uniqueTaskName } from "../tasks/store";
import { mergeProjectLibrary } from "./mergeLibrary";
import { templatePreview } from "./templatePreview";
import { templateSchema } from "./templateSchema";
import { download } from "../shared/download";

export interface ProjectTemplate {
  id: string;
  name: string;
  updatedAt: number;
  project: ProjectFile;
  preview: string;
  source?: "builtin" | "user";
}

const storageKey = "chao-shikong-box-templates";
const userTemplates = async () =>
  (await get<ProjectTemplate[]>(storageKey)) ?? [];

export async function listTemplates(): Promise<ProjectTemplate[]> {
  const defaults = getBuiltinLibrary().templates ?? [];
  const builtinIds = new Set(defaults.map((template) => template.id));
  const stored = await userTemplates();
  const users = stored.filter((template) => !builtinIds.has(template.id));
  let migrated = false;
  for (const template of users) {
    if (!template.preview) {
      template.preview = await templatePreview(
        restoreProject(template.project).document,
      );
      migrated = true;
    }
  }
  if (migrated) await set(storageKey, stored);
  return [
    ...defaults.map((template) => ({
      ...template,
      source: "builtin" as const,
    })),
    ...users.map((template) => ({ ...template, source: "user" as const })),
  ];
}

export async function saveTemplate(
  name: string,
  project: ProjectFile,
): Promise<ProjectTemplate> {
  const templates = await userTemplates();
  const template: ProjectTemplate = {
    id: crypto.randomUUID(),
    name: name.trim(),
    updatedAt: Date.now(),
    project,
    preview: await templatePreview(restoreProject(project).document),
  };
  templateSchema.parse(template);
  await set(storageKey, [template, ...templates]);
  return template;
}

export async function deleteTemplate(id: string): Promise<void> {
  if (getBuiltinLibrary().templates?.some((template) => template.id === id))
    throw new Error("默认模板不能删除");
  await set(
    storageKey,
    (await userTemplates()).filter((template) => template.id !== id),
  );
}

export function loadTemplate(
  template: ProjectTemplate,
  name = template.name,
  size?: { width: number; height: number },
) {
  const project = restoreProject(templateSchema.parse(template).project);
  mergeProjectLibrary(project.library);
  useTasks
    .getState()
    .open({ ...project.document, ...size, name: uniqueTaskName(name) });
}

export async function exportTemplate(
  template: ProjectTemplate,
): Promise<boolean> {
  const text = JSON.stringify(templateSchema.parse(template));
  const filename = `${template.name.replace(/[\\/:*?"<>|]/g, "_")}.boxtemplate`;
  if (isTauri()) {
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "初始模板", extensions: ["boxtemplate"] }],
    });
    if (!path) return false;
    await invoke("write_file", {
      path,
      bytes: Array.from(new TextEncoder().encode(text)),
    });
  } else
    download(
      new Blob([text], { type: "application/json;charset=utf-8" }),
      filename,
    );
  return true;
}
