import { create } from 'zustand';
import type { CopyOption, TerrainMapInfo, TerrainOptions, TerrainSelection } from './types';

export const defaultOptions: TerrainOptions = {
  terrain: true, groundArt: true, cliffArt: false, nativeCliffs: false, doodads: true, units: true,
  paths: true, shadows: true, regions: true, objectData: true, allResources: true,
};

interface TerrainState {
  source: TerrainMapInfo | null;
  target: TerrainMapInfo | null;
  selection: TerrainSelection | null;
  placement: [number, number] | null;
  mode: 'rectangle' | 'paint';
  brush: number;
  shape: 'square' | 'circle';
  eraser: boolean;
  options: TerrainOptions;
  log: string[];
  busy: boolean;
  message: string;
  setMap: (side: 'source' | 'target', map: TerrainMapInfo | null) => void;
  setSelection: (selection: TerrainSelection | null) => void;
  setPlacement: (placement: [number, number] | null) => void;
  setOption: (option: CopyOption, value: boolean) => void;
  setMode: (mode: TerrainState['mode']) => void;
  setBrush: (brush: number) => void;
  setShape: (shape: TerrainState['shape']) => void;
  setEraser: (eraser: boolean) => void;
  setBusy: (busy: boolean) => void;
  notify: (message: string) => void;
  addLog: (lines: string[]) => void;
  clearLog: () => void;
}

export const useTerrainClone = create<TerrainState>((set) => ({
  source: null, target: null, selection: null, placement: null,
  mode: 'rectangle', brush: 3, shape: 'square', eraser: false,
  options: defaultOptions, log: [], busy: false, message: '',
  setMap: (side, map) => set(state => ({
    [side]: map,
    ...(state[side]?.id === map?.id ? {} : side === 'source' ? { selection: null } : { placement: null }),
  })),
  setSelection: selection => set({ selection }),
  setPlacement: placement => set({ placement }),
  setOption: (option, value) => set(state => ({ options: { ...state.options, [option]: value } })),
  setMode: mode => set({ mode }),
  setBrush: brush => set({ brush: Math.max(1, Math.min(99, Math.trunc(brush || 1))) }),
  setShape: shape => set({ shape }),
  setEraser: eraser => set({ eraser }),
  setBusy: busy => set({ busy }),
  notify: message => set({ message }),
  addLog: lines => set(state => ({ log: [...state.log, ...lines] })),
  clearLog: () => set({ log: [] }),
}));
