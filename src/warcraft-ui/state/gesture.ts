import { create } from 'zustand';
import type { UiNode } from '../document/model';
import { editPosition } from '../document/position';

export type GestureBox = { x: number; y: number; width: number; height: number };
type Gesture = GestureBox & { id: string; origin: UiNode[] };
export const useLayoutGesture = create<{ drag: Gesture | null; begin: (nodes: UiNode[], id: string) => void;
  move: (x: number, y: number) => void; resize: (box: GestureBox) => void; clear: () => void }>((set) => ({
  drag: null,
  begin: (nodes, id) => {
    const node = nodes.find(item => item.id === id);
    if (node && !node.locked) set({ drag: { id, origin: nodes, x: node.x, y: node.y, width: node.width, height: node.height } });
  },
  move: (x, y) => set(state => state.drag && Number.isFinite(x) && Number.isFinite(y) ? { drag: { ...state.drag, x, y } } : state),
  resize: box => set(state => state.drag && Object.values(box).every(Number.isFinite) && box.width > 0 && box.height > 0 ? { drag: { ...state.drag, ...box } } : state),
  clear: () => set({ drag: null }),
}));

export function previewNodes(nodes: UiNode[], drag: Gesture | null): UiNode[] {
  if (!drag || drag.origin !== nodes) return nodes;
  const original = nodes.find(node => node.id === drag.id);
  if (!original) return nodes;
  return editPosition(nodes, drag.id, { x: drag.x, y: drag.y, width: drag.width, height: drag.height });
}
