import { initialSheets } from './model';
import { categories, type CategoryId, type ObjectColumn } from './schema';
import item from './defaults/item.json';
import unit from './defaults/unit.json';
import ability from './defaults/ability.json';
import upgrade from './defaults/upgrade.json';
import doodad from './defaults/doodad.json';
import buff from './defaults/buff.json';

// First rows from the user's supplied 物编表格.war3objects (2026-10-20).
// Keep column keys: legacy sheets contain duplicate field names in distinct columns.
const defaults: Record<CategoryId, { cells: Record<string, string>; extraColumns: ObjectColumn[] }> = {
  item, unit, ability, upgrade, doodad, buff,
};
// Canonical native names for the legacy workbook's button X / attack-1 fields.
const nativeFields: Partial<Record<CategoryId, Record<string, string>>> = {
  item: { 'item:T': 'Buttonpos_1' },
  unit: { 'unit:CJ': 'Missileart_1', 'unit:CK': 'Missilespeed_1', 'unit:CL': 'Missilearc_1', 'unit:CM': 'MissileHoming_1' },
  ability: { 'ability:R': 'Buttonpos_1' },
};

/** Seed only newly created tasks; imports and workspace recovery use empty sheets. */
export function newTaskSheets() {
  const sheets = initialSheets();
  for (const { id } of categories) {
    const seed = defaults[id], sheet = sheets[id];
    sheet.columns = [...sheet.columns.map(column => ({ ...column, field: nativeFields[id]?.[column.key] ?? column.field })), ...seed.extraColumns.map(column => ({ ...column }))];
    sheet.rows = [{ id: crypto.randomUUID(), cells: { ...seed.cells } }];
  }
  // The sample uses Divine Shield (AHds), which has no Spell Book min/max data.
  // Leave these optional columns available for other templates, without invalid defaults.
  delete sheets.ability.rows[0].cells['ability:W'];
  delete sheets.ability.rows[0].cells['ability:X'];
  return sheets;
}
