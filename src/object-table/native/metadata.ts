import catalog from './metadata.json';
import type { CategoryId } from '../schema';
import type { NativeField } from '../sync/types';
// Data projected from the user's supplied editor metadata; no external runtime paths.
export interface FieldMeta { field: string; id: string; type: number; repeat?: number; data?: number; rawtype?: string; label: string }
interface Rule { useSpecific?: string; notSpecific?: string; useHero?: number; useUnit?: number; useBuilding?: number; useItem?: number }
const data = catalog as unknown as { metadata: Record<string, Record<string, FieldMeta>>; defaults: Record<CategoryId, Record<string, { _code?: string; isbldg?: number }>>; rules: Record<CategoryId, Record<string, Rule>> };
interface FieldIndex { fields: FieldMeta[]; names: Map<string, FieldMeta>; aliases: Map<string, FieldMeta | null>; repeated: Map<string, FieldMeta>; native: Map<string, FieldMeta>; nativeRepeated: Map<string, FieldMeta> }
// Metadata is immutable. Bound the contexts, including unknown parents from old maps.
const indexes = new Map<string, FieldIndex>();
function indexFor(kind: CategoryId, parent: string, imported = false): FieldIndex {
  const key = `${kind}:${parent}:${imported}`, cached = indexes.get(key);
  if (cached) return cached;
  const code = data.defaults[kind][parent]?._code ?? parent;
  const fields = Object.values({ ...data.metadata[kind], ...data.metadata[code] });
  const index: FieldIndex = { fields, names: new Map(), aliases: new Map(), repeated: new Map(), native: new Map(), nativeRepeated: new Map() };
  for (const meta of fields) {
    const nativeKey = `${meta.id}:${meta.type}:${meta.data ?? 0}`;
    // Preserve the original first-match-before-supports semantics.
    if (!index.native.has(nativeKey)) index.native.set(nativeKey, meta);
    if (meta.repeat && !index.nativeRepeated.has(nativeKey)) index.nativeRepeated.set(nativeKey, meta);
    if (!supports(kind, parent, meta, imported)) continue;
    for (const alias of [meta.id, meta.label, meta.label.replace(/^.*?\s+-\s+/, ''), ...(kind === 'unit' && meta.id === 'udef' ? ['防御', '基础防御', '护甲'] : [])]) {
      const key = alias.trim().toLowerCase(), old = index.aliases.get(key);
      index.aliases.set(key, old === undefined || old?.id === meta.id && old?.data === meta.data ? meta : null);
    }
    for (const name of [meta.field.toLowerCase(), meta.field.replaceAll('_', '').toLowerCase()]) {
      if (!index.names.has(name)) index.names.set(name, meta);
      if (meta.repeat && !index.repeated.has(name)) index.repeated.set(name, meta);
    }
  }
  if (indexes.size >= 1024) indexes.delete(indexes.keys().next().value!);
  indexes.set(key, index); return index;
}
export const fieldsFor = (kind: CategoryId, parent: string): FieldMeta[] => indexFor(kind, parent).fields;
export const knownTemplate = (kind: CategoryId, parent: string) => !!data.defaults[kind][parent];
function legacyAnpaField(kind: CategoryId, parent: string, field: Pick<NativeField, 'id' | 'type' | 'level' | 'data'>) {
  const code = data.defaults[kind][parent]?._code ?? parent;
  if (kind !== 'ability' || code !== 'ANpa' || field.id !== 'Npa6' || field.type !== 2 || field.level !== 1 || field.data !== 0) return undefined;
  return { ...data.metadata.ANpa.dataf, field: '@Npa6:1:0', data: 0, level: 1 };
}
export function supports(kind: CategoryId, parent: string, meta: FieldMeta, imported = false) {
  const rule = data.rules[kind][meta.id] ?? {}, defaults = data.defaults[kind][parent], code = defaults?._code ?? parent;
  const specific = rule.useSpecific;
  if (specific && !['0', '_', '*'].includes(specific) && !specific.split(',').some(id => id === parent || id === code)) return false;
  if (rule.notSpecific?.split(',').some(id => id === parent || id === code)) return false;
  if (kind === 'unit' || kind === 'item') {
    const key = kind === 'item' ? 'useItem' : /^[A-Z]/.test(parent) ? 'useHero' : defaults?.isbldg ? 'useBuilding' : 'useUnit';
    // Editor visibility is not a binary format restriction. Existing maps may
    // carry known unit fields on heroes/buildings; only imports opt into this.
    if (!imported && rule[key] === 0) return false;
  }
  return true;
}
export function resolveField(kind: CategoryId, parent: string, name: string, imported = false): (FieldMeta & { level: number }) | undefined {
  const index = indexFor(kind, parent, imported);
  // Older item/ability workbooks named the X button position without its component suffix.
  if ((kind === 'item' || kind === 'ability') && name.toLowerCase() === 'buttonpos') name = 'Buttonpos_1';
  if (imported && name === '@Npa6:1:0') return legacyAnpaField(kind, parent, { id: 'Npa6', type: 2, level: 1, data: 0 });
  // Old workbooks used @id:level:data for these previously unmapped fields.
  // Keep reverse updates on the same effective column instead of appending a
  // second column whose value would then be overwritten by the old one.
  const raw = imported && name.match(/^@([^:]+):(\d+):(\d+)$/);
  if (raw) {
    const level = Number(raw[2]), data = Number(raw[3]);
    const meta = index.fields.find(m => m.id === raw[1] && (m.data ?? 0) === data && (level === 0 || m.repeat) && supports(kind, parent, m, true));
    return meta ? { ...meta, level } : undefined;
  }
  name = name.trim();
  const exact = index.names.get(name.toLowerCase());
  if (exact) return { ...exact, level: exact.repeat ? 1 : 0 };
  const parts = name.match(/^(.*?)(\d+)$/), repeated = parts && index.repeated.get(parts[1].toLowerCase());
  if (repeated) return { ...repeated, level: Number(parts![2]) };
  const alias = index.aliases.get(name.toLowerCase());
  if (alias) return { ...alias, level: alias.repeat ? 1 : 0 };
  const labelled = name.match(/^(.*?)\s*(?:·|[-－]\s*等级|等级)\s*(\d+)$/), base = labelled && index.aliases.get(labelled[1].trim().toLowerCase());
  return base?.repeat ? { ...base, level: Number(labelled![2]) } : undefined;
}
export function nameForField(kind: CategoryId, parent: string, field: NativeField, imported = false) {
  const legacy = imported && legacyAnpaField(kind, parent, field);
  if (legacy) return { field: legacy.field, title: `${legacy.label} · 旧格式` };
  const index = indexFor(kind, parent, imported), key = `${field.id}:${field.type}:${field.data}`;
  const m = (field.level === 0 ? index.native : index.nativeRepeated).get(key);
  return m && supports(kind, parent, m, imported) ? { field: m.repeat ? `${m.field}${field.level}` : m.field, title: `${m.label}${m.repeat ? ` · ${field.level}` : ''}` } : undefined;
}
