export type CopyOption = 'terrain' | 'groundArt' | 'cliffArt' | 'nativeCliffs' | 'doodads' | 'units' | 'paths' | 'shadows' | 'regions' | 'objectData' | 'allResources';

export interface TerrainMapInfo {
  id: string;
  path: string;
  name: string;
  width: number;
  height: number;
  pixels: number[];
  doodadPoints?: [number, number][];
  previewWarnings?: string[];
  dirty: boolean;
  canUndo: boolean;
  undoSteps?: number;
  blank: boolean;
}

export interface TerrainSelection {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mask: boolean[] | null;
}

export type TerrainOptions = Record<CopyOption, boolean>;
