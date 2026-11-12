import { categories, type CategoryId } from '../schema';
import { columnLetter, dataOnly, initialSheets, initialViews, type ObjectProject, type SheetData } from '../model';
import { createCalculator } from '../formulas/engine';
import { fieldKey, type MapRead, type NativeObject, type ObjectSnapshot } from '../sync/types';
import { knownTemplate, nameForField, resolveField } from './metadata';
import { levelList } from './lists';
import { validRawcode } from './rawcode';
import { columnIndex } from './columnIndex';
import type { NativeReference, NativeRowCache } from './compilationCache';
import { numericText } from '../numericText';

export interface NativeIssue { category: CategoryId; row: number; col: number; message: string }
interface Allocation { category: CategoryId; row: number; id: string }
const validId = validRawcode;
function rootTemplate(kind: CategoryId, parent: string, objects: ObjectSnapshot, seen = new Set<string>()): { parent: string; fields: NativeObject['fields'] } | undefined {
  if (knownTemplate(kind, parent)) return { parent, fields: {} };
  if (seen.has(parent)) return undefined;
  seen.add(parent); const template = objects[`${kind}:${parent}`];
  if (!template) return undefined;
  const root = rootTemplate(kind, template.parent, objects, seen);
  return root ? { parent: root.parent, fields: { ...root.fields, ...template.fields } } : undefined;
}
export function resolveString(value: string, strings: MapRead['strings']) {
  const seen = new Set<string>(); let result = value;
  while (/^TRIGSTR_\d+$/.test(result)) {
    const id = String(Number(result.slice(8)));
    if (seen.has(id) || strings[id] === undefined) throw new Error(`字符串引用缺失或循环：${result}`);
    seen.add(id); result = strings[id];
  }
  return result.replace(/\r\n?|\n/g, '|n');
}
const literalCell = (value: string) => !value ? '#' : value === '#' || value === '无' || /^[=']/.test(value) ? `'${value}` : value;
export function mapProject(map: MapRead, includeNative = false): ObjectProject {
  const sheets = dataOnly(initialSheets());
  const lookup = Object.fromEntries(categories.map(({ id }) => { sheets[id].columns = [...sheets[id].columns]; return [id, columnIndex(id, sheets[id].columns)]; })) as Record<CategoryId, ReturnType<typeof columnIndex>>;
  for (const [key, object] of Object.entries(map.objects)) {
    if (!object.custom && !includeNative) continue;
    const kind = key.split(':')[0] as CategoryId, sheet = sheets[kind]; if (!sheet) continue;
    const cells: Record<string, string> = { [sheet.columns[0].key]: object.id, [sheet.columns[1].key]: object.parent };
    for (const field of Object.values(object.fields)) {
      const mapping = nameForField(kind, object.parent, field, true);
      const name = mapping?.field ?? `@${fieldKey(field)}`;
      let column = lookup[kind](object.parent, field, !!mapping, name);
      if (!column) { const letter = columnLetter(sheet.columns.length + 2); column = { key: `${kind}:${letter}`, letter, field: name, title: mapping?.title ?? `未知字段 ${name}`, width: 180 }; sheet.columns.push(column); }
      cells[column.key] = typeof field.value === 'string' ? literalCell(resolveString(field.value, map.strings)) : String(field.value);
    }
    sheet.rows.push({ id: crypto.randomUUID(), cells });
  }
  const name = map.path.split(/[\\/]/).pop() ?? '地图物编';
  return { format: 'war3-objects', version: 3, active: 'item', sheets, views: initialViews(), metadata: { name, binding: { id: crypto.randomUUID(), path: map.path, fingerprint: map.fingerprint, realtime: false, session: null, source: map, baseline: {} } } };
}
function typed(value: string, type: number) {
  if (value.includes('\0')) throw new Error('含有空字符');
  if (type === 3) return value.replace(/\r\n?|\n/g, '|n');
  if (!value.trim()) throw new Error('需要有效数值');
  const n = /^(true|false)$/i.test(value.trim()) ? Number(value.trim().toLowerCase() === 'true') : numericText(value);
  if (n === undefined || !Number.isFinite(n)) throw new Error(`需要有效数值，当前值：${JSON.stringify(value.slice(0, 80))}`);
  if (type === 0 && !Number.isInteger(n)) throw new Error(`此字段需要整数，当前值：${value.slice(0, 80)}`);
  if (type === 0 && (n < -2147483648 || n > 2147483647) || type !== 0 && !Number.isFinite(Math.fround(n))) throw new Error(`数值超出物编类型范围，当前值：${value.slice(0, 80)}；${type === 0 ? '整数范围 -2147483648～2147483647' : '超过 32 位实数范围'}`);
  return type === 0 ? n : Math.fround(n);
}
export function compileNative(project: ObjectProject, cache?: NativeRowCache) {
  const objects: ObjectSnapshot = {}, issues: NativeIssue[] = [], warnings: NativeIssue[] = [], allocations: Allocation[] = [], formulas = new Set<string>();
  const references: NativeReference[] = [];
  const calc = createCalculator(project.sheets), binding = project.metadata?.binding;
  for (const { id: kind } of categories) {
    const sheet = project.sheets[kind], occupied = new Set(Object.keys(binding?.source.objects ?? {}).filter(k => k.startsWith(`${kind}:`)).map(k => k.slice(kind.length + 1)));
    for (const row of sheet.rows) { const id = row.cells[sheet.columns[0].key]; if (id) occupied.add(id); }
    let sequence = 0;
    sheet.rows.forEach((row, index) => {
      if (Object.values(row.cells).every(v => !v)) return;
      const rawId = row.cells[sheet.columns[0].key], rowKey = `${kind}:${rawId}`;
      const baselineKeys = Object.keys(binding?.baseline[rowKey]?.fields ?? {}).join('\0'), managedKeys = (binding?.managed?.[rowKey] ?? []).join('\0');
      const cached = cache?.get(row);
      if (rawId && !objects[rowKey] && cached && cached.columns === sheet.columns && cached.source === binding?.source && cached.baseline === baselineKeys && cached.managed === managedKeys && cached.index === index && cached.name === sheet.name) {
        objects[rowKey] = cached.object; issues.push(...cached.issues); references.push(...cached.references); return;
      }
      const issueStart = issues.length, referenceStart = references.length;
      const issue = (col: number, message: string) => issues.push({ category: kind, row: index, col, message: `${sheet.name} 第 ${index + 3} 行：${message}` });
      let id = row.cells[sheet.columns[0].key] ?? ''; const inputParent = row.cells[sheet.columns[1].key] ?? '';
      if (!id) { do { id = `${({ item: 'I', unit: 'U', ability: 'A', upgrade: 'R', doodad: 'D', buff: 'B' })[kind]}${(sequence++).toString(36).padStart(3, '0')}`; } while (occupied.has(id) && sequence < 46657); if (sequence > 46656) { issue(0, '四位 ID 已耗尽'); return; } occupied.add(id); allocations.push({ category: kind, row: index, id }); }
      if (!validId(id)) { issue(0, '自定义 ID 须为四位可打印字符；特殊字节 ID 使用 0x 加八位大写十六进制，保留大小写'); return; }
      const root = rootTemplate(kind, inputParent, binding?.source.objects ?? {}), parent = root?.parent ?? inputParent;
      if (!validId(inputParent) || !root) { issue(1, '模板不是已知的原生或当前地图模板 ID'); return; }
      const key = `${kind}:${id}`;
      if (objects[key]) { issue(0, `同类 ID 重复：${id}`); return; }
      const original = binding?.source.objects[key], baseline = binding?.baseline[key];
      if (!original && knownTemplate(kind, id)) { issue(0, 'ID 与原生对象冲突；请分配自定义 ID'); return; }
      const object: NativeObject = { id, parent, custom: original?.custom ?? id !== parent, fields: {} };
      try { for (const [key, field] of Object.entries(root.fields)) object.fields[key] = { ...field, value: typeof field.value === 'string' ? resolveString(field.value, binding?.source.strings ?? {}) : field.value }; }
      catch (error) { issue(1, String(error)); return; }
      const importedFields = { ...original?.fields, ...root.fields };
      for (const field of Object.values(importedFields)) if (!nameForField(kind, parent, field, true)) issue(0, `含有未知原生字段 ${fieldKey(field)}，保留原始数据并阻止此对象写入`);
      if (original && !original.custom && parent !== original.parent) issue(1, '原生对象不能更换模板');
      sheet.columns.slice(2).forEach((column, i) => {
        const raw = row.cells[column.key] ?? '';
        // Recover previous imports' @rawcode columns only from a known, typed
        // field in this source object. Arbitrary unknown fields remain blocked.
        const savedField = column.field.startsWith('@') ? importedFields[column.field.slice(1)] : undefined;
        const savedName = savedField && nameForField(kind, parent, savedField, true)?.field;
        let meta = resolveField(kind, parent, savedName ?? column.field);
        if (!meta) {
          const candidate = resolveField(kind, parent, savedName ?? column.field, true);
          const existing = candidate && importedFields[fieldKey({ ...candidate, data: candidate.data ?? 0 })];
          if (candidate && existing?.type === candidate.type) meta = candidate;
        }
        if (!meta) { if (raw) issue(i + 2, `无法安全转换字段 ${column.field}，原始数据已保留`); return; }
        const fk = fieldKey({ id: meta.id, level: meta.level, data: meta.data ?? 0 });
        if (!raw) { if (baseline?.fields[fk] || binding?.managed?.[key]?.includes(fk)) delete object.fields[fk]; return; }
        const result = calc.read(kind, index + 3, i + 4);
        if (result.error) { issue(i + 2, result.error); return; }
        try {
          const empty = raw === '#' || raw === '无';
          if (empty && meta.type !== 3) throw new Error('数值字段不能填空值；清零请填 0，恢复默认请留白');
          const text = empty ? '' : result.text;
          const values = meta.repeat ? levelList(text) : [text];
          values.forEach((value, offset) => {
            const field = { id: meta.id, level: meta.level + offset, data: meta.data ?? 0, type: meta.type, value: typed(value, meta.type) }, effective = fieldKey(field);
            object.fields[effective] = field; if (raw.startsWith('=')) formulas.add(`${key}/${effective}`);
            if (meta.rawtype) references.push({ kind, row: index, col: i + 2, type: meta.rawtype, value, object: key, field: effective });
          });
        }
        catch (error) { issue(i + 2, `${column.title}：${String(error)}`); }
      });
      objects[key] = object;
      if (cache && rawId && !Object.values(row.cells).some(v => v.startsWith('='))) cache.set(row, { columns: sheet.columns, source: binding?.source, baseline: baselineKeys, managed: managedKeys, index, name: sheet.name, object, issues: issues.slice(issueStart), references: references.slice(referenceStart) });
    });
  }
  const refKinds: Record<string, CategoryId[]> = { abilCode: ['ability'], abilityList: ['ability'], heroAbilityList: ['ability'], buffList: ['buff'], unitCode: ['unit'], unitList: ['unit'], itemList: ['item'], techList: ['unit', 'upgrade'], upgradeCode: ['upgrade'], upgradeList: ['upgrade'] };
  for (const ref of references) {
    const kinds = refKinds[ref.type]; if (!kinds || objects[ref.object]?.fields[ref.field]?.value !== ref.value) continue;
    for (const value of ref.value.split(',').map(v => v.trim()).filter(v => v && !['0', '_'].includes(v))) if (!kinds.some(kind => knownTemplate(kind, value) || objects[`${kind}:${value}`] || binding?.source.objects[`${kind}:${value}`])) {
      const original = binding?.source.objects[ref.object], previous = original?.fields[ref.field];
      const preserved = original?.parent === objects[ref.object]?.parent && previous?.type === 3 && typeof previous.value === 'string' && resolveString(previous.value, binding?.source.strings ?? {}) === ref.value;
      const message = `${project.sheets[ref.kind].name} 第 ${ref.row + 3} 行：引用 ${value} 不存在或类型不匹配`;
      (preserved ? warnings : issues).push({ category: ref.kind, row: ref.row, col: ref.col, message: preserved ? `${message}；原图已有，保持原值，允许同步其他字段` : message });
    }
  }
  const blocked = new Set(issues.map(i => { const sheet = project.sheets[i.category]; return `${i.category}:${sheet.rows[i.row]?.cells[sheet.columns[0].key] ?? allocations.find(a => a.category === i.category && a.row === i.row)?.id ?? ''}`; }));
  return { objects, issues, warnings, allocations, formulas, blocked };
}
export function applyNativeObject(sheet: SheetData, object: NativeObject | undefined, kind: CategoryId, id: string): SheetData {
  const index = sheet.rows.findIndex(r => r.cells[sheet.columns[0].key] === id);
  if (!object) return { ...sheet, rows: sheet.rows.filter((_, i) => i !== index) };
  const map: MapRead = { path: '', fingerprint: '', objects: { [`${kind}:${id}`]: object }, raw: {}, strings: {}, imports: [], warnings: [] };
  const imported = mapProject(map, true).sheets[kind], source = imported.rows[0], cells = { ...(sheet.rows[index]?.cells ?? {}) };
  let columns = [...sheet.columns];
  const lookup = columnIndex(kind, columns);
  for (const src of imported.columns) {
    if (!(src.key in source.cells)) continue;
    const sourceMeta = resolveField(kind, object.parent, src.field, true);
    let target = sourceMeta ? lookup(object.parent, { ...sourceMeta, data: sourceMeta.data ?? 0 }, true, src.field) : lookup(object.parent, { id: '', level: 0, data: 0 }, false, src.field);
    if (!target) { const letter = columnLetter(columns.length + 2); target = { ...src, letter, key: `${kind}:${letter}` }; columns.push(target); }
    cells[target.key] = source.cells[src.key];
  }
  // Clear fields removed in the editor in the effective duplicate column only.
  const cleared = new Set<string>();
  for (const col of [...columns.slice(2)].reverse()) { const m = resolveField(kind, object.parent, col.field, true); if (!m) continue; const fk = fieldKey({ id: m.id, level: m.level, data: m.data ?? 0 }); if (!cleared.has(fk) && !object.fields[fk]) delete cells[col.key]; cleared.add(fk); }
  const row = { ...sheet.rows[index], id: sheet.rows[index]?.id ?? crypto.randomUUID(), cells }, rows = [...sheet.rows];
  if (index < 0) rows.push(row); else rows[index] = row;
  return { ...sheet, columns, rows };
}
