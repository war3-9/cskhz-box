import type { CategoryId } from '../schema';
import type { VariableDocument } from '../variables/document';
import type { GuiVariable } from '../variables/model';

export interface NativeField { id: string; type: number; level: number; data: number; value: string | number }
export interface NativeObject { id: string; parent: string; custom: boolean; fields: Record<string, NativeField> }
export type ObjectSnapshot = Record<string, NativeObject>;
export interface MapRead {
  path: string; fingerprint: string; objects: ObjectSnapshot; raw: Record<string, number[]>;
  strings: Record<string, string>; imports: string[]; warnings: string[];
}
export interface MapBinding {
  id: string; path: string; fingerprint: string; session: string | null; realtime: boolean;
  source: MapRead; baseline: ObjectSnapshot; revision?: number; managed?: Record<string, string[]>;
}
export interface ObjectMetadata { name: string; binding?: MapBinding; imports?: { path: string; fingerprint: string; objects: ObjectSnapshot; local: ObjectSnapshot; variables?: { rows: GuiVariable[]; local: VariableDocument } }[] }
export const fieldKey = (field: Pick<NativeField, 'id' | 'level' | 'data'>) => `${field.id}:${field.level}:${field.data}`;
export type SyncPhase = 'unbound' | 'waiting' | 'review' | 'manual' | 'realtime' | 'sending' | 'conflict' | 'failed';
export interface SyncIdentity { task: string; binding: string; session: string }
export interface EditorMapChange extends SyncIdentity { path: string }
interface SyncEnvelope extends SyncIdentity { request: string; revision: number }
export interface SyncCapabilities { kinds: CategoryId[]; edit: boolean; events: boolean; undo: boolean; durableSave: boolean }
export interface ObjectOperation { key: string; before?: NativeObject; after?: NativeObject }
export interface SyncBatch extends SyncEnvelope { operations: ObjectOperation[] }
export interface SyncEvent extends SyncEnvelope { snapshot: ObjectSnapshot; savedRevision?: number; savedFingerprint?: string; echo?: string }
export interface ObjectSyncTransport {
  capabilities(): Promise<SyncCapabilities>;
  snapshot(identity: SyncIdentity): Promise<SyncEvent>;
  submit(batch: SyncBatch): Promise<SyncEvent>;
  subscribe(listener: (event: SyncEvent) => void, disconnect: (reason?: string) => void): () => void;
  subscribeMapChanges?(listener: (event: EditorMapChange) => void): () => void;
}
