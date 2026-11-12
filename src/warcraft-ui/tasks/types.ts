import type { LayoutDocument, LayoutSnapshot } from '../state/layout';
import type { CanvasView } from '../canvas/view';

export type DesignMeta = { id: string; name: string; updatedAt: number };
export type SavedDesign = DesignMeta & { document: LayoutDocument };
export type UiTask = LayoutSnapshot & {
  id: string; name: string; view: CanvasView;
  saved: DesignMeta | null; savedContent: string | null;
};
export type DirectoryInfo = { directory: string; defaultDirectory: string; warning?: string; remapped?: Record<string, string>; revision: number; migrations?: { revision: number; ids: Record<string, string> }[] };
export const documentContent = (document: LayoutDocument) => JSON.stringify({
  nodes: document.nodes, arrayName: document.arrayName, background: document.background,
});
export const isTaskDirty = (task: UiTask) => documentContent(task) !== task.savedContent;
export const needsSave = (task: UiTask) => isTaskDirty(task) &&
  (task.saved !== null || task.nodes.length > 0 || task.background !== null || task.arrayName !== 'ui');
