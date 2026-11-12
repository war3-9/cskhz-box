import type { BlendMode, LayerEffects } from "../layers/styles/types";
export type { LayerEffect, LayerEffects } from "../layers/styles/types";
export type Source = "builtin" | "user";
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  source: Source;
  thumbnail: string;
}
export interface Asset {
  id: string;
  name: string;
  groupId: string;
  categoryId: string;
  source: Source;
  imagePath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  kind?: "image" | "font";
  fontData?: string;
  webFontData?: string;
}
export interface Library {
  categories: Category[];
  assets: Asset[];
}
export interface ImageLayer {
  id: string;
  name: string;
  kind: "base" | "asset";
  assetId?: string;
  imagePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
  opacity: number;
  visible: boolean;
  locked: boolean;
  text?: TextLayerData;
  effects?: LayerEffects;
  blendMode?: BlendMode;
}
export interface TextLayerData {
  fontId: string;
  content: string;
  fontSize: number;
  color: string;
  stroke?: TextStroke;
  gradient?: TextGradient;
}
export interface TextStroke {
  enabled: boolean;
  color: string;
  width: number;
}
export interface TextGradient {
  enabled: boolean;
  startColor: string;
  endColor: string;
  angle: number;
}
export interface EditorDocument {
  name: string;
  canvasCreated?: boolean;
  width: number;
  height: number;
  layers: ImageLayer[];
}
export interface ProjectFile {
  version: 1;
  document: EditorDocument;
  library: Library;
}
