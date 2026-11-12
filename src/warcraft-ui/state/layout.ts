import { create } from 'zustand';

import type { UiNode } from '../document/model';
import { withFrameVariables } from '../document/frameVariables';
import { editPosition } from '../document/position';
import { validateNodes } from '../document/validation';
import { moveInTree, type DropPosition } from '../document/hierarchy';
import { defaultArrayName, validateArrayName } from '../document/arrayName';
import { frameRangeEnd, gridCount } from '../document/grid';
export { stageSize, type AnchorPoint, type UiNode } from '../document/model';

export type LayoutDocument = { nodes: UiNode[]; arrayName: string; background: string | null };
export type LayoutSnapshot = LayoutDocument & { selectedId: string | null; past: LayoutDocument[]; future: LayoutDocument[] };
type LayoutState = LayoutSnapshot & {
  nodes: UiNode[];
  arrayName: string;
  selectedId: string | null;
  setBackground: (background: string | null) => void;
  setArrayName: (name: string) => void;
  select: (id: string | null) => void;
  setNode: (id: string, patch: Partial<Omit<UiNode, 'id' | 'tVariable' | 'frameIndex' | 'autoName'>>) => void;
  add: (node: UiNode) => void;
  removeSelected: () => void;
  reorder: (direction: 'up' | 'down' | 'top' | 'bottom') => void;
  moveTree: (id: string, targetId: string | null, position: DropPosition) => void;
  replace: (nodes: UiNode[]) => void;
  undo: () => void;
  redo: () => void;
};

/**
 * The Warcraft UI workspace starts empty. Keep the old two-node layout as a
 * fixture for export/runtime tests instead of putting it into user state.
 */
export const initialNodes: UiNode[] = [];

export const exampleNodes: UiNode[] = withFrameVariables([
  { id: 'preview-panel', kind: 'backdrop', name: '面板', x: 120, y: 90, width: 300, height: 170, color: '#354249', texture: 'UI\\Widgets\\EscMenu\\Human\\human-options-menu-background.blp' },
  { id: 'preview-title', kind: 'text', name: '标题', x: 155, y: 125, width: 220, height: 48, text: 'UI 预览', color: '#ffffff' },
], true);

const snapshot = (state: LayoutState) => ({ nodes: state.nodes, arrayName: state.arrayName, background: state.background });
const history = (state: LayoutState, nodes: UiNode[], arrayName = state.arrayName) => ({
  nodes, arrayName, past: [...state.past.slice(-99), snapshot(state)], future: [],
});

export const useLayoutStore = create<LayoutState>((set) => ({
  nodes: initialNodes, arrayName: defaultArrayName, background: null, selectedId: null, past: [], future: [],
  setBackground: (background) => set(state => background === state.background ? state : { ...history(state, state.nodes), background }),
  setArrayName: (name) => { validateArrayName(name); set(state => name === state.arrayName ? state : history(state, state.nodes, name)); },
  select: (selectedId) => set({ selectedId }),
  setNode: (id, patch) => set((state) => {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      const value = patch[key];
      if (value !== undefined && (!Number.isFinite(value) || (key !== 'x' && key !== 'y' && value <= 0))) return state;
    }
    if (!state.nodes.some((node) => node.id === id)) return state;
    if (Object.hasOwn(patch, 'parentId')) {
      if (patch.parentId === id || (patch.parentId && !state.nodes.some(node => node.id === patch.parentId))) return state;
      let current: string | undefined = patch.parentId; const seen = new Set([id]);
      while (current) { if (seen.has(current)) return state; seen.add(current); current = state.nodes.find(node => node.id === current)?.parentId; }
    }
    const original = state.nodes.find(node => node.id === id)!;
    if (original.locked && (patch.x !== undefined || patch.y !== undefined)) return state;
    if (patch.name?.trim()) {
      const base = patch.name.trim(); let name = base, suffix = 2;
      while (state.nodes.some(node => node.id !== id && (node.name.trim() || node.autoName) === name)) name = `${base} (${suffix++})`;
      patch = { ...patch, name };
    }
    let nodes: UiNode[];
    try {
      const changed = editPosition(state.nodes, id, patch);
      const next = changed.find(node => node.id === id)!;
      // Reserve a fresh contiguous block on growth; never consume another control's index.
      if (gridCount(next) > gridCount(original)) {
        const all = [...state.nodes, ...state.past.flatMap(item => item.nodes), ...state.future.flatMap(item => item.nodes)];
        next.frameIndex = Math.max(0, ...all.map(frameRangeEnd)) + 1;
      }
      nodes = withFrameVariables(changed);
      validateNodes(nodes);
    } catch { return state; }
    if (JSON.stringify(nodes) === JSON.stringify(state.nodes)) return state;
    return history(state, nodes);
  }),
  add: (node) => set((state) => { const nodes = withFrameVariables([...state.nodes, node], false, [...state.past, ...state.future].flatMap(item => item.nodes)); validateNodes(nodes);
    return { ...history(state, nodes), selectedId: node.id }; }),
  removeSelected: () => set((state) => {
    if (!state.nodes.some((node) => node.id === state.selectedId)) return state;
    return { ...history(state, state.nodes.filter(node => node.id !== state.selectedId)
      .map(node => node.parentId === state.selectedId ? { ...node, parentId: undefined } : node)), selectedId: null };
  }),
  reorder: (direction) => set((state) => {
    const index = state.nodes.findIndex(node => node.id === state.selectedId);
    if (index < 0) return state;
    const selected = state.nodes[index];
    const siblings = state.nodes.filter(node => node.parentId === selected.parentId);
    const siblingIndex = siblings.findIndex(node => node.id === selected.id);
    const target = direction === 'top' ? siblings.length - 1 : direction === 'bottom' ? 0 :
      Math.max(0, Math.min(siblings.length - 1, siblingIndex + (direction === 'up' ? 1 : -1)));
    if (target === siblingIndex) return state;
    const nodes = moveInTree(state.nodes, selected.id, siblings[target].id, target > siblingIndex ? 'before' : 'after');
    if (nodes === state.nodes) return state;
    return history(state, nodes);
  }),
  moveTree: (id, targetId, position) => set(state => {
    const nodes = moveInTree(state.nodes, id, targetId, position);
    if (nodes === state.nodes) return state;
    validateNodes(nodes);
    return { ...history(state, nodes), selectedId: id };
  }),
  replace: (nodes) => set((state) => { validateNodes(nodes); return { ...history(state, withFrameVariables(nodes)), selectedId: nodes[0]?.id ?? null }; }),
  undo: () => set((state) => state.past.length ? {
    ...state.past.at(-1)!, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future], selectedId: null,
  } : state),
  redo: () => set((state) => state.future.length ? {
    ...state.future[0], past: [...state.past, snapshot(state)], future: state.future.slice(1), selectedId: null,
  } : state),
}));
