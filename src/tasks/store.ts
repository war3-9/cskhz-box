import { create } from "zustand";
import { emptyDocument, useEditor, type EditorSnapshot } from "../layers/store";
import type { EditorDocument } from "../shared/types";
import { useCanvasInteraction } from "../canvas/interactionStore";
import { validCanvasSize } from "../canvas/dimensions";
import { useBucket } from "../canvas/bucketStore";

export interface Task extends EditorSnapshot {
  id: string;
  savedDocument: EditorDocument | null;
}
interface TaskState {
  tasks: Task[];
  activeId: string | null;
  open: (document: EditorDocument, saved?: boolean) => string;
  createCanvas: (width: number, height: number, name?: string) => void;
  createTask: (settings: {
    name: string;
    width: number;
    height: number;
  }) => void;
  activate: (id: string) => void;
  close: (id: string) => void;
  markSaved: (id: string, document: EditorDocument) => void;
  restore: (
    tasks: { id: string; document: EditorDocument; dirty: boolean }[],
    activeId: string | null,
  ) => void;
}
let switching = false;
function snapshot(): EditorSnapshot {
  const { document, selectedId, past, future } = useEditor.getState();
  return { document, selectedId, past, future };
}
function display(task?: Task) {
  useCanvasInteraction.getState().clear();
  useBucket.getState().clear();
  useEditor.getState().restoreSession(
    task
      ? {
          document: task.document,
          selectedId: task.selectedId,
          past: task.past,
          future: task.future,
        }
      : {
          document: emptyDocument(),
          selectedId: null,
          past: [],
          future: [],
        },
  );
}
export const isTaskDirty = (task: Task) => task.document !== task.savedDocument;
export function uniqueTaskName(requested: string) {
  const names = new Set(
    useTasks.getState().tasks.map((task) => task.document.name),
  );
  const base = requested.trim() || "未命名作品";
  let name = base;
  let suffix = 2;
  while (names.has(name)) name = `${base} ${suffix++}`;
  return name;
}

export const useTasks = create<TaskState>((set, get) => ({
  tasks: [],
  activeId: null,
  open: (document, saved = false) => {
    switching = true;
    try {
      // Capture a legacy/directly loaded editor before opening another task.
      const previous = get();
      const retained =
        !previous.tasks.length &&
        useEditor.getState().document.canvasCreated !== false
          ? [{ ...snapshot(), id: crypto.randomUUID(), savedDocument: null }]
          : previous.tasks;
      useEditor.getState().loadDocument(document);
      const current = snapshot();
      const task: Task = {
        ...current,
        id: crypto.randomUUID(),
        savedDocument: saved ? current.document : null,
      };
      set({ tasks: [...retained, task], activeId: task.id });
      useCanvasInteraction.getState().clear();
      useBucket.getState().clear();
      return task.id;
    } finally {
      switching = false;
    }
  },
  createCanvas: (width, height, requestedName) => {
    if (!validCanvasSize(width, height)) return;
    if (requestedName !== undefined && !requestedName.trim()) return;
    const name = uniqueTaskName(requestedName ?? "未命名作品");
    get().open({
      ...emptyDocument(),
      name,
      width,
      height,
      canvasCreated: true,
    });
  },
  createTask: ({ name, width, height }) =>
    get().createCanvas(width, height, name),
  activate: (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task || id === get().activeId) return;
    switching = true;
    try {
      set({ activeId: id });
      display(task);
    } finally {
      switching = false;
    }
  },
  close: (id) => {
    const state = get();
    const index = state.tasks.findIndex((task) => task.id === id);
    if (index < 0) return;
    const tasks = state.tasks.filter((task) => task.id !== id);
    switching = true;
    try {
      if (state.activeId === id) {
        const next = tasks[Math.min(index, tasks.length - 1)];
        set({ tasks, activeId: next?.id ?? null });
        display(next);
      } else set({ tasks });
    } finally {
      switching = false;
    }
  },
  markSaved: (id, document) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, savedDocument: document } : task,
      ),
    })),
  restore: (entries, activeId) => {
    switching = true;
    try {
      const tasks = entries.map((entry): Task => ({
        id: entry.id,
        document: entry.document,
        selectedId: null,
        past: [],
        future: [],
        savedDocument: entry.dirty ? null : entry.document,
      }));
      set({ tasks, activeId });
      display(tasks.find((task) => task.id === activeId));
    } finally {
      switching = false;
    }
  },
}));

useEditor.subscribe((next, previous) => {
  if (switching || !useTasks.getState().activeId) return;
  if (
    next.document === previous.document &&
    next.selectedId === previous.selectedId &&
    next.past === previous.past &&
    next.future === previous.future
  )
    return;
  const current = snapshot();
  useTasks.setState((state) => ({
    tasks: state.tasks.map((task) =>
      task.id === state.activeId ? { ...task, ...current } : task,
    ),
  }));
});
