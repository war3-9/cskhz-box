import type { model } from 'war3-model';
export type ResourceKind = 'model' | 'texture' | 'terrain' | 'music';
export const isMusic = (path: string) => /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(path);
export interface Entry { path: string; size: number; model: boolean; anonymous: boolean; modelGroup?: number; legacyPath?: string; terrain?: { name: string; terrainType: string; used: boolean; missing: boolean }; readRef?: ResourceRef }
export interface SourceAnalysis { modelTextures: string[]; unusedModels: string[]; usageSupported: boolean; usageNote: string }
export interface Source { id: string; name: string; path: string; kind: 'folder' | 'file' | 'archive' | 'browser'; entries: Entry[]; complete: boolean; warning?: string; analysis?: SourceAnalysis }
export interface ResourceRef { sourceId: string; path: string }
export interface Dependency { path: string; source?: string; ref?: ResourceRef; size?: number; error?: string; replaceableId?: number }
export interface LoadedModel { ref: ResourceRef; bytes: ArrayBuffer; model: model.Model; dependencies: Dependency[]; images: Map<string, ImageData[]>; warning?: string }
export interface Thumbnail { ref: ResourceRef; image: ImageData; error?: string }
export const keyOf = (ref: ResourceRef) => `${ref.sourceId}:${ref.path}`;
export const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
export const isTexture = (path: string) => /\.(blp|tga|dds|png|jpe?g)$/i.test(path);
export const basename = (path: string) => path.replace(/\\/g, '/').split('/').pop() || path;
export const resourceKey = (source: Source, path: string) => `${normalizePath(source.path)}|${normalizePath(path)}`;
