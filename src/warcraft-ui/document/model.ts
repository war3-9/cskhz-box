export const stageSize = { width: 1920, height: 1080 };
export type UiTexture = { texture: string; imageData?: string };
export type UiNode = {
  id: string;
  tVariable?: string;
  autoName?: string;
  frameIndex?: number;
  grid?: { rows: number; columns: number; gapX: number; gapY: number; materials?: Record<string, UiTexture> };
  kind: 'panel' | 'background' | 'button' | 'text' | 'backdrop';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  color: string;
  texture?: string;
  imageData?: string;
  parentId?: string;
  selfAnchor?: AnchorPoint;
  targetAnchor?: AnchorPoint;
  opacity?: number;
  /** Editor-only placeholder background; never used by game output. */
  previewBackgroundOpacity?: number;
  visible?: boolean;
  locked?: boolean;
  fill?: string;
  textColor?: string;
  fontPath?: string;
  fontSize?: number;
};

export type AnchorPoint = 'TOPLEFT' | 'TOP' | 'TOPRIGHT' | 'LEFT' | 'CENTER' | 'RIGHT' | 'BOTTOMLEFT' | 'BOTTOM' | 'BOTTOMRIGHT';
