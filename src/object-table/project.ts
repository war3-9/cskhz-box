import { variableDocumentSchema } from './variables/document';
import { z } from 'zod';
import { unitSettingsSchema } from './numbers/model';
import { categories } from './schema';
import { columnLetter, columnNumber, customDataOnly, dataOnly, isStandardSheet, MAX_ROWS, type ObjectProject } from './model';
import { useObjectTable } from './store';
import { metadataSchema } from './sync/schema';
import { validateFillRule } from './fill/series';
import { multiTargetSchema } from './fill/multi';

const category = z.enum(['item', 'unit', 'ability', 'upgrade', 'doodad', 'buff']);
const fill = z.object({ operation: z.enum(['auto', 'copy', 'add', 'subtract', 'multiply', 'divide', 'custom', 'multi']), operand: z.number().finite(), custom: z.object({ operator: z.enum(['add', 'subtract', 'multiply', 'divide']), prefix: z.string(), suffix: z.string() }).optional(), multi: multiTargetSchema.optional() }).superRefine((rule, ctx) => {
  try { validateFillRule(rule); } catch (error) { ctx.addIssue({ code: 'custom', message: String(error).replace(/^Error: /, '') }); }
});
const column = z.object({ key: z.string().min(1), letter: z.string().regex(/^[A-Z]{1,3}$/), title: z.string(), field: z.string(), width: z.number().finite().min(48).max(4000), fill: fill.optional() });
const sheet = z.object({ units: unitSettingsSchema.optional(), name: z.string().min(1), columns: z.array(column).min(1).max(512), auxiliary: z.record(z.string(), z.string()).default({}), rows: z.array(z.object({ id: z.string().min(1), cells: z.record(z.string(), z.string()), alignments: z.record(z.string(), z.enum(['left', 'center', 'right'])).optional() })).max(MAX_ROWS) });
const view = z.object({ frozen: z.number().int().min(0).max(512), left: z.number().finite().nonnegative(), top: z.number().finite().nonnegative(), hiddenColumns: z.array(z.string()).max(511).optional() });
const schema = z.object({ format: z.literal('war3-objects'), version: z.union([z.literal(1), z.literal(2), z.literal(3)]), active: z.string().min(1), sheets: z.record(category, sheet), customSheets: z.record(z.string(), sheet).optional(), views: z.record(z.string(), view), metadata: metadataSchema.optional(), variables: variableDocumentSchema.optional() });
export function parseObjectProject(text: string): ObjectProject {
  const project = schema.parse(JSON.parse(text));
  const customSheets = project.customSheets ?? {}, customIds = Object.keys(customSheets);
  if (customIds.some(id => !/^custom-[a-z0-9-]{1,112}$/.test(id) || isStandardSheet(id))) throw new Error('自定义分类标识无效');
  const ids = [...categories.map(({ id }) => id), ...customIds];
  if (!ids.includes(project.active) || ids.some(id => !project.views[id])) throw new Error('当前分类或视图配置无效');
  if (Object.keys(project.views).some(id => !ids.includes(id))) throw new Error('视图引用了不存在的分类');
  if (new Set(ids.map(id => (isStandardSheet(id) ? project.sheets[id].name : customSheets[id].name).toLowerCase())).size !== ids.length) throw new Error('工作表名称重复，公式无法确定目标页');
  for (const { id } of categories) {
    const sheet = project.sheets[id], keys = new Set(sheet.columns.map(column => column.key));
    if (sheet.columns.length < 3) throw new Error('标准物编页至少需要 ID、模板和一个属性列');
    const hidden = project.views[id].hiddenColumns ?? [];
    if (hidden.some(key => !keys.has(key)) || new Set(hidden).size !== hidden.length || hidden.length >= keys.size) throw new Error('隐藏列配置无效');
    if (keys.size !== sheet.columns.length || new Set(sheet.columns.map(c => c.letter)).size !== keys.size || new Set(sheet.rows.map(row => row.id)).size !== sheet.rows.length) throw new Error('表格中存在重复的列或行标识');
    if (sheet.columns[0].letter !== 'B' || sheet.columns[1].letter !== 'C') throw new Error('ID 和模板必须位于 B、C 列');
    if (sheet.columns.some((column, index) => column.letter !== columnLetter(index + 2) || column.key !== `${id}:${column.letter}`)) throw new Error('物编列标识或顺序无效');
    if (sheet.rows.some(row => [...Object.keys(row.cells), ...Object.keys(row.alignments ?? {})].some(key => !keys.has(key)))) throw new Error('单元格引用了不存在的列');
  }
  for (const id of customIds) {
    const custom = customSheets[id], keys = new Set(custom.columns.map(c => c.key)), hidden = project.views[id].hiddenColumns ?? [];
    if (hidden.some(key => !keys.has(key)) || new Set(hidden).size !== hidden.length || hidden.length >= keys.size) throw new Error('自定义分类隐藏列配置无效');
    if (keys.size !== custom.columns.length || new Set(custom.columns.map(c => c.letter)).size !== keys.size || new Set(custom.rows.map(row => row.id)).size !== custom.rows.length) throw new Error('自定义表格中存在重复的列或行标识');
    const first = custom.columns[0].letter;
    if (custom.columns.some((c, index) => c.letter !== columnLetter(columnNumber(first) + index) || c.key !== `${id}:${c.letter}`)) throw new Error('自定义列标识或顺序无效');
    if (custom.rows.some(row => [...Object.keys(row.cells), ...Object.keys(row.alignments ?? {})].some(key => !keys.has(key)))) throw new Error('自定义单元格引用了不存在的列');
  }
  return project;
}
export function currentProject(): ObjectProject {
  const { sheets, active, views, metadata, variables } = useObjectTable.getState();
  return { format: 'war3-objects', version: 3, sheets: dataOnly(sheets), customSheets: customDataOnly(sheets), active, views, metadata, variables };
}
export const serializeObjectProject = (project = currentProject()) => JSON.stringify(project);
