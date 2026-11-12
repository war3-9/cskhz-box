import { create } from 'zustand';

export type CanvasView = {
  grid: boolean;
  snap: boolean;
  boundary: boolean;
  guides: boolean;
  highlight: boolean;
  selection: boolean;
  hiddenFrames: boolean;
  zoom: number | null;
  panX: number;
  panY: number;
  background: string | null;
};
export type ViewToggle = Exclude<keyof CanvasView, 'zoom' | 'background' | 'panX' | 'panY'>;
export const useCanvasView = create<CanvasView>(() => ({
  grid: true, snap: true, boundary: true, guides: true, highlight: true,
  selection: true, hiddenFrames: false, zoom: null, panX: 0, panY: 0, background: null,
}));
