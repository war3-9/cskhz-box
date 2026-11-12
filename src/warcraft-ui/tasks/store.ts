import { create } from 'zustand';
import { useLayoutStore, type LayoutSnapshot, type LayoutDocument } from '../state/layout';
import { useCanvasView } from '../canvas/view';
import { useLayoutGesture } from '../state/gesture';
import { useArrayNameEdit } from '../export/arrayNameEdit';
import { defaultArrayName } from '../document/arrayName';
import { documentContent, type UiTask, type SavedDesign, type DesignMeta } from './types';

const defaultView = () => ({ ...useCanvasView.getInitialState() });
const snapshot = (): LayoutSnapshot => {
  const { nodes, arrayName, background, selectedId, past, future } = useLayoutStore.getState();
  return { nodes, arrayName, background, selectedId, past, future };
};
let switching = false;
const display = (task: UiTask | undefined) => {
  useLayoutGesture.getState().clear();
  useArrayNameEdit.getState().setValid(true);
  useLayoutStore.setState(task ? { nodes: task.nodes, arrayName: task.arrayName, background: task.background,
    selectedId: task.selectedId, past: task.past, future: task.future } : useLayoutStore.getInitialState());
  useCanvasView.setState(task?.view ?? defaultView());
};
type TaskState = {
  tasks: UiTask[]; activeId: string | null; directoryRevision: number;
  restore: (tasks: UiTask[], activeId: string | null, directoryRevision?: number) => void;
  create: () => void; activate: (id: string) => void; close: (id: string) => void;
  open: (design: SavedDesign) => void;
  markSaved: (id: string, saved: DesignMeta, content: string) => void;
  detach: (designId: string) => void;
  remap: (mapping: Record<string, string>) => void;
};
export function taskFrom(document: LayoutDocument = { nodes: [], arrayName: defaultArrayName, background: null }, name = '未命名 UI'): UiTask {
  return { ...document, id: crypto.randomUUID(), name, selectedId: null, past: [], future: [], view: defaultView(), saved: null, savedContent: null };
}
export const useUiTasks = create<TaskState>((set, get) => ({
  tasks: [], activeId: null, directoryRevision: 0,
  restore: (tasks, activeId, directoryRevision = get().directoryRevision) => {
    switching = true;
    try { set({ tasks, activeId, directoryRevision }); display(tasks.find(task => task.id === activeId)); }
    finally { switching = false; }
  },
  create: () => {
    let name = '未命名 UI', suffix = 2;
    while (get().tasks.some(task => task.name === name)) name = `未命名 UI (${suffix++})`;
    const task = taskFrom(undefined, name);
    get().restore([...get().tasks, task], task.id);
  },
  activate: id => { if (id !== get().activeId && get().tasks.some(task => task.id === id)) get().restore(get().tasks, id); },
  close: id => {
    const index = get().tasks.findIndex(task => task.id === id);
    if (index < 0) return;
    const tasks = get().tasks.filter(task => task.id !== id);
    get().restore(tasks, get().activeId === id ? tasks[Math.min(index, tasks.length - 1)]?.id ?? null : get().activeId);
  },
  open: design => {
    const existing = get().tasks.find(task => task.saved?.id === design.id);
    if (existing) { get().activate(existing.id); return; }
    const task = { ...taskFrom(design.document, design.name), saved: { id: design.id, name: design.name, updatedAt: design.updatedAt }, savedContent: documentContent(design.document) };
    get().restore([...get().tasks, task], task.id);
  },
  markSaved: (id, saved, content) => set(state => ({ tasks: state.tasks.map(task => task.id === id ? { ...task, name: saved.name, saved, savedContent: content } : task) })),
  detach: designId => set(state => ({ tasks: state.tasks.map(task => task.saved?.id === designId ? { ...task, saved: null, savedContent: null } : task) })),
  remap: mapping => set(state => ({ tasks: state.tasks.map(task => task.saved && mapping[task.saved.id] ? { ...task, saved: { ...task.saved, id: mapping[task.saved.id] } } : task) })),
}));
useLayoutStore.subscribe((next, previous) => {
  if (switching || next === previous) return;
  const state = useUiTasks.getState();
  if (!state.activeId) return;
  const current = snapshot();
  useUiTasks.setState({ tasks: state.tasks.map(task => task.id === state.activeId ? { ...task, ...current } : task) });
});
useCanvasView.subscribe(next => {
  if (switching) return;
  useUiTasks.setState(state => ({ tasks: state.tasks.map(task => task.id === state.activeId ? { ...task, view: next } : task) }));
});
