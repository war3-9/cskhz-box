import type { NativeField, NativeObject, ObjectOperation, ObjectSnapshot } from './types';
export type ConflictValue = NativeObject | NativeField | string | undefined;
export interface ObjectConflict { key: string; field: string; baseline: ConflictValue; table: ConflictValue; editor: ConflictValue; formula: boolean }
export const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aa = Object.keys(a), bb = Object.keys(b); return aa.length === bb.length && aa.every(k => equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};
export function operations(before: ObjectSnapshot, after: ObjectSnapshot): ObjectOperation[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => !equal(before[key], after[key])).map(key => ({ key, before: before[key], after: after[key] }));
}
export function reconcile(baseline: ObjectSnapshot, table: ObjectSnapshot, editor: ObjectSnapshot, formulas = new Set<string>(), choices: Record<string, 'table' | 'editor'> = {}) {
  const merged: ObjectSnapshot = {}, conflicts: ObjectConflict[] = [];
  const choose = (key: string, field: string, base: ConflictValue, local: ConflictValue, remote: ConflictValue): ConflictValue => {
    if (equal(local, remote)) return local;
    const formula = formulas.has(`${key}/${field}`);
    const choice = choices[`${key}/${field}`];
    if (choice) return choice === 'table' ? local : remote;
    if (!formula && equal(local, base)) return remote;
    if (equal(remote, base)) return local;
    conflicts.push({ key, field, baseline: base, table: local, editor: remote, formula }); return local;
  };
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(table), ...Object.keys(editor)])) {
    const base = baseline[key], local = table[key], remote = editor[key];
    if (local && remote && equal(local, remote)) { merged[key] = local; continue; }
    if (!local || !remote || !base && (!local || !remote)) {
      const result = choose(key, '$object', base, local, remote) as NativeObject | undefined;
      // Native objects are never deleted, regardless of the chosen side.
      if (result) merged[key] = result;
      else if (base && !base.custom) { merged[key] = remote ?? local ?? base; conflicts.push({ key, field: '$object', baseline: base, table: local, editor: remote, formula: false }); }
      continue;
    }
    const parent = choose(key, '$parent', base?.parent, local.parent, remote.parent) as string;
    const fields: NativeObject['fields'] = {};
    for (const field of new Set([...Object.keys(base?.fields ?? {}), ...Object.keys(local.fields), ...Object.keys(remote.fields)])) {
      const result = choose(key, field, base?.fields[field], local.fields[field], remote.fields[field]) as NativeField | undefined;
      if (result) fields[field] = result;
    }
    merged[key] = { ...local, parent, fields };
  }
  const blocked = new Set(conflicts.map(c => c.key));
  return { merged, conflicts, toEditor: operations(editor, merged).filter(o => !blocked.has(o.key)), toTable: operations(table, merged).filter(o => !blocked.has(o.key)) };
}
