import { categories } from '../schema';
import type { ObjectProject, ObjectRow, SheetData } from '../model';
import type { MapBinding, NativeObject } from '../sync/types';
import { compileNative, type NativeIssue } from './mapping';

export interface NativeReference { kind: typeof categories[number]['id']; row: number; col: number; type: string; value: string; object: string; field: string }
export interface CompiledRow {
  columns: SheetData['columns']; source: MapBinding['source'] | undefined; baseline: string; managed: string;
  index: number; name: string; object: NativeObject; issues: NativeIssue[]; references: NativeReference[];
}
export type NativeRowCache = WeakMap<ObjectRow, CompiledRow>;
// Only immutable store snapshots enter this cache. Public compileNative stays uncached
// for imports/callers that edit their project in place. Formula rows always recompute
// after any sheet change, so cross-sheet and dynamic references remain correct.
export function createNativeCompiler() {
  const rows: NativeRowCache = new WeakMap();
  let previous: ObjectProject | undefined, result: ReturnType<typeof compileNative>;
  return (project: ObjectProject) => {
    const binding = project.metadata?.binding, before = previous?.metadata?.binding;
    if (previous && binding?.source === before?.source && binding?.baseline === before?.baseline && binding?.managed === before?.managed && categories.every(({ id }) => {
      const a = previous!.sheets[id], b = project.sheets[id];
      return a.rows === b.rows && a.columns === b.columns && a.auxiliary === b.auxiliary && a.name === b.name;
    })) return result;
    result = compileNative(project, rows); previous = project; return result;
  };
}
