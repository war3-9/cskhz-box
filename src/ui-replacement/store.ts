import { create } from 'zustand';
import { allTextureLayers, consoleReplacementTextures } from './native';
import { fontLayerId, isFontTarget, type ConsoleFontSnapshot } from './fontTypes';

export interface ConsoleLayer { id: string; image: string; filename: string; sourceBytes?: number[] }
export interface ConsoleMap { path: string; name: string; entries: number; overrides: number; warning?: string; fingerprint?: string }
export const defaultLayers = (): ConsoleLayer[] => [...allTextureLayers.map(layer => ({
  id: layer.id, image: layer.image, filename: `${layer.id}.blp`,
})), { id: 'minimap', image: '', filename: '' }, { id: 'minimap-original', image: '', filename: '' },
{ id: fontLayerId, image: '', filename: '' }];
interface State {
  layers: ConsoleLayer[];
  originalLayers: ConsoleLayer[];
  savedLayers: ConsoleLayer[];
  map: ConsoleMap | null;
  fontSnapshot: ConsoleFontSnapshot | null;
  busy: boolean;
  past: ConsoleLayer[][];
  future: ConsoleLayer[][];
  replace: (layers: ConsoleLayer[]) => void;
  loadMap: (map: ConsoleMap, layers: ConsoleLayer[], fontSnapshot?: ConsoleFontSnapshot) => void;
  reset: () => void;
  resetPart: (id: string) => void;
  markSaved: (fingerprint: string) => void;
  undo: () => void;
  redo: () => void;
}
export const useConsole = create<State>((set) => ({
  layers: defaultLayers(), originalLayers: defaultLayers(), savedLayers: defaultLayers(), map: null, fontSnapshot: null, busy: false, past: [], future: [],
  replace: layers => set(state => state.busy ? state : ({
    layers: state.layers.map(layer => layers.find(item => item.id === layer.id) ?? layer),
    past: [...state.past.slice(-19), state.layers], future: [],
  })),
  loadMap: (map, layers, fontSnapshot) => set({ map, layers, originalLayers: layers, savedLayers: layers, fontSnapshot: fontSnapshot ?? null, past: [], future: [] }),
  markSaved: fingerprint => set(state => ({ savedLayers: state.layers, map: state.map ? { ...state.map, fingerprint } : null })),
  resetPart: id => set(state => {
    if (state.busy || !state.map) return state;
    const ids = id === 'console' ? consoleReplacementTextures.map(texture => texture.id) : [isFontTarget(id) ? fontLayerId : id];
    const layers = state.layers.map(layer => ids.includes(layer.id)
      ? state.originalLayers.find(original => original.id === layer.id) ?? layer : layer);
    if (layers.every((layer, index) => layer === state.layers[index])) return state;
    return { layers, past: [...state.past.slice(-19), state.layers], future: [] };
  }),
  reset: () => set(state => state.busy ? state : ({ layers: defaultLayers(),
    past: [...state.past.slice(-19), state.layers], future: [] })),
  undo: () => set(state => !state.busy && state.past.length ? { layers: state.past.at(-1)!,
    past: state.past.slice(0, -1), future: [state.layers, ...state.future] } : state),
  redo: () => set(state => !state.busy && state.future.length ? { layers: state.future[0],
    past: [...state.past, state.layers], future: state.future.slice(1) } : state),
}));
