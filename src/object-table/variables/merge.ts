import { clean, same, variableSchema, type DraftVariable, type GuiVariable, type VariableChange } from './model';
import type { VariableDocument } from './document';
import { equal } from '../sync/reconcile';

export interface VariableConflict { id: string; name: string; field: string; local: unknown; remote: unknown }
export type MergeChoices = Record<string, 'table' | 'editor'>;
// A foreign document can add/update names, but cannot authorize a deletion or rename.
export function mergeVariables(document: VariableDocument | undefined, remote: GuiVariable[], sameSource: boolean, choices: MergeChoices = {}) {
  const merged = new Map(remote.map(v => [v.name.toLowerCase(), v]));
  const base = new Map((sameSource ? document?.baseline ?? [] : []).map(v => [v.name.toLowerCase(), v]));
  const origins = new Set<string>(), conflicts: VariableConflict[] = [], changes: VariableChange[] = [];
  const select = (name: string, field: string, old: unknown, local: unknown, live: unknown) => {
    if (equal(local, live)) return live;
    const id = `variable:${name}/${field}`, choice = choices[id];
    if (choice) return choice === 'table' ? local : live;
    if (sameSource && equal(old, local)) return live;
    if (equal(old, live)) return local;
    conflicts.push({ id, name, field, local, remote: live }); return live;
  };
  for (const row of document?.rows ?? []) {
    const local = clean(row), origin = sameSource ? row.original?.toLowerCase() : null;
    if (origin) origins.add(origin);
    const old = origin ? base.get(origin) : undefined, key = origin ?? local.name.toLowerCase(), live = merged.get(key);
    let next: GuiVariable | undefined;
    if (!old || !live) {
      next = select(local.name, '$variable', old, local, live) as GuiVariable | undefined;
    } else {
      next = { ...live };
      for (const field of Object.keys(variableSchema.shape) as (keyof GuiVariable)[]) Object.assign(next, { [field]: select(old.name, field, old[field], local[field], live[field]) });
    }
    if (next && next.name.toLowerCase() !== key && merged.has(next.name.toLowerCase())) {
      // Two source variables cannot collapse into one. The user must change the workbook name.
      conflicts.push({ id: `variable:${key}/$name`, name: next.name, field: '目标名称已存在，请在工作簿改名', local: next, remote: merged.get(next.name.toLowerCase()) }); continue;
    }
    if (!same(live, next)) { changes.push({ before: live ?? null, after: next ?? null }); merged.delete(key); if (next) merged.set(next.name.toLowerCase(), next); }
  }
  for (const [key, old] of base) if (!origins.has(key)) {
    const live = merged.get(key); if (!live) continue;
    const next = select(old.name, '$variable', old, undefined, same(old, live) ? old : live) as GuiVariable | undefined;
    if (!next) { changes.push({ before: live, after: null }); merged.delete(key); }
  }
  return { rows: [...merged.values()], conflicts, changes };
}

export function rebaseDraft(document: VariableDocument, remote: GuiVariable[]) {
  const plan = mergeVariables(document, remote, true);
  if (plan.conflicts.length) throw new Error(`变量 ${plan.conflicts[0].name} 存在两边修改，请先解决冲突；本地草稿已保留。`);
  const origins = new Map(document.rows.map(row => [row.name.toLowerCase(), row.original]));
  const rows: DraftVariable[] = plan.rows.map(row => ({ ...row, original: origins.has(row.name.toLowerCase()) ? origins.get(row.name.toLowerCase())! : row.name }));
  // New local variables stay new; renamed variables keep their original names.
  return { rows, baseline: remote, source: document.source };
}
