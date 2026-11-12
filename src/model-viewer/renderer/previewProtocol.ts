import type { ResourceRef } from '../types';
import type { Settings } from '../workspace/store';
export type PreviewSettings = Pick<Settings, 'action' | 'background' | 'team' | 'loop' | 'speed'>;
export interface PreviewItem { key: string; ref: ResourceRef; x: number; y: number; width: number; height: number }
export type PreviewMessage =
  | { type: 'init'; canvas: OffscreenCanvas }
  | { type: 'layout'; items: PreviewItem[]; width: number; height: number; scale: number }
  | { type: 'settings'; settings: PreviewSettings; active: boolean }
  | { type: 'clear' }
  | { type: 'resource'; request: number; bytes?: ArrayBuffer; identity?: string; error?: string };
export type PreviewReply =
  | { type: 'read'; request: number; ref: ResourceRef; texture?: string }
  | { type: 'ready'; key: string }
  | { type: 'note'; key: string; note: string }
  | { type: 'error'; key?: string; error: string };
