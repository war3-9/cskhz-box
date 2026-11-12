import { z } from 'zod';
import preset from './preset.json';

export const unitName = z.string().trim().min(1).max(100).regex(/^[^\d\s\u0000-\u001f\u007f+＋\-－:：=,，;；%％{}|.]+$/, '单位不能含数字、空白或属性分隔符');
export const unitSettingsSchema = z.object({
  base: z.number().int().min(2).max(1_000_000_000),
  units: z.array(z.object({ id: z.string().min(1), name: unitName })).max(1000),
  storageBits: z.number().int().min(32).max(16384),
  registered: z.array(z.object({ attribute: z.string().min(1), unit: z.enum(['number', 'percent']) })),
}).superRefine((v, ctx) => {
  for (const field of ['name', 'id'] as const) if (new Set(v.units.map(u => u[field])).size !== v.units.length) ctx.addIssue({ code: 'custom', message: '单位' + (field === 'name' ? '名称' : '编号') + '重复' });
  if (new Set(v.registered.map(t => t.attribute)).size !== v.registered.length) ctx.addIssue({ code: 'custom', message: '属性登记重复' });
  if (BigInt(v.base) ** BigInt(v.units.length) >= 2n ** BigInt(v.storageBits - 1)) ctx.addIssue({ code: 'custom', message: '最后一档单位超出原大数容量，请减少档位或核对原Lua容量' });
});
export type UnitSettings = z.infer<typeof unitSettingsSchema>;
export const defaultUnits = (): UnitSettings => structuredClone(preset) as UnitSettings;
export const unitSignature = (v: UnitSettings) => JSON.stringify([v.base, v.units.map(u => u.name), v.storageBits, v.registered]);
export const unitMultiplier = (v: UnitSettings, index: number) => (BigInt(v.base) ** BigInt(index + 1)).toString();
