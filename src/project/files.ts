import { isTauri, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useEditor } from "../layers/store";
import { useLibrary } from "../assets/store";
import { embedImage } from "../shared/image";
import { download } from "../shared/download";
import { projectSchema } from "./schema";
import type { ProjectFile, EditorDocument } from "../shared/types";
import { restoreProject, serializeProject } from "./builtinReferences";
import { useTasks } from "../tasks/store";
import { mergeProjectLibrary } from "./mergeLibrary";
import { useUi } from '../app/uiStore';
import { storedImageReference } from '../assets/imageRepository';

export async function portableProject(
  document = useEditor.getState().document,
): Promise<ProjectFile> {
  const { library } = useLibrary.getState();
  const cache = new Map<string, Promise<string>>();
  const embed = (path: string) => {
    if (path.startsWith("builtin://")) return Promise.resolve(path);
    if (!cache.has(path)) cache.set(path, embedImage(path).catch(error => {
      if (/^(library-image:\/\/|https?:\/\/box-image\.|box-image:)/.test(path)) {
        useUi.getState().notify('部分图片缺失，工程已保留原引用；请从恢复入口找回图片。', 'error');
        return storedImageReference(path);
      }
      throw error;
    }));
    return cache.get(path)!;
  };
  // A portable work contains its own dependencies; the shared material library
  // is saved independently by workspace persistence, not copied into every work.
  const used = new Set(document.layers.flatMap(layer => [layer.assetId, layer.text?.fontId].filter((id): id is string => !!id)));
  const assets = library.assets.filter(asset => asset.source === 'builtin' || used.has(asset.id));
  const categoryIds = new Set(assets.flatMap(asset => [asset.categoryId, asset.groupId]));
  const protectedProject = serializeProject({ version: 1, document, library: {
    assets,
    categories: library.categories.filter(category => category.source === 'builtin' || categoryIds.has(category.id)),
  } });
  const map = async <T, R>(items: T[], transform: (item: T) => Promise<R>): Promise<R[]> => {
    const result: R[] = [];
    for (const item of items) result.push(await transform(item));
    return result;
  };
  return {
    version: 1,
    document: {
      ...protectedProject.document,
      layers: await map(
        protectedProject.document.layers, async (l) => ({
          ...l,
          imagePath: await embed(l.imagePath),
        }),
      ),
    },
    library: {
      categories: await map(
        protectedProject.library.categories, async (c) => ({
          ...c,
          thumbnail: c.thumbnail ? await embed(c.thumbnail) : "",
        }),
      ),
      assets: await map(
        protectedProject.library.assets, async (a) => ({
          ...a,
          imagePath: await embed(a.imagePath),
          thumbnailPath: await embed(a.thumbnailPath),
        }),
      ),
    },
  };
}
export async function saveProject(
  document: EditorDocument = useEditor.getState().document,
  taskId = useTasks.getState().activeId,
): Promise<boolean> {
  const project = await portableProject(document);
  const filename = `${project.document.name.replace(/[\\/:*?"<>|]/g, "_")}.layerforge`;
  const text = JSON.stringify(project);
  if (isTauri()) {
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "超时空盒子工程", extensions: ["layerforge"] }],
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
  if (taskId) useTasks.getState().markSaved(taskId, document);
  return true;
}
export function applyProject(text: string) {
  const result = projectSchema.safeParse(JSON.parse(text));
  if (!result.success) throw new Error("工程格式无效或版本不受支持。");
  const project = restoreProject(result.data, undefined, reference => useUi.getState().notify('素材暂不可用，已保留引用：' + reference, 'error'));
  mergeProjectLibrary(project.library);
  useTasks.getState().open(project.document, true);
}
export async function openDesktopProject(): Promise<boolean> {
  const path = await open({
    multiple: false,
    filters: [{ name: "超时空盒子工程", extensions: ["layerforge"] }],
  });
  if (!path) return false;
  const text = await invoke<string>("read_text", { path });
  applyProject(text);
  return true;
}
