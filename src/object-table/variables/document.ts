import { z } from 'zod';
import { variableSchema, validateVariable, type DraftVariable } from './model';

export const variableDocumentSchema = z.object({
  rows: z.array(variableSchema.extend({ original: z.string().nullable() })).max(4096),
  baseline: z.array(variableSchema).max(4096),
  source: z.string().optional(),
}).superRefine((doc, ctx) => {
  try { validateVariableDocument(doc); }
  catch (error) { ctx.addIssue({ code: 'custom', message: String(error) }); }
});
export interface VariableDocument { rows: DraftVariable[]; baseline: z.infer<typeof variableSchema>[]; source?: string }
export function validateVariableDocument(doc: VariableDocument) {
  const names = new Set<string>(), origins = new Set<string>();
  const baseline = new Set(doc.baseline.map(row => row.name.toLowerCase()));
  if (baseline.size !== doc.baseline.length) throw new Error('变量基线中存在重复名称');
  for (const row of [...doc.baseline, ...doc.rows]) validateVariable(row);
  for (const row of doc.rows) {
    const name = row.name.toLowerCase(), origin = row.original?.toLowerCase();
    if (names.has(name)) throw new Error(`变量名重复：${row.name}`);
    names.add(name);
    if (origin !== undefined) {
      if (!baseline.has(origin) || origins.has(origin)) throw new Error(`变量来源无效：${row.original}`);
      origins.add(origin);
    }
  }
}
