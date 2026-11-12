import item from './headers/item.json';
import unit from './headers/unit.json';
import ability from './headers/ability.json';
import upgrade from './headers/upgrade.json';
import doodad from './headers/doodad.json';
import buff from './headers/buff.json';
import type { FillRule } from './fill/series';

export interface ObjectColumn { key: string; letter: string; title: string; field: string; width: number; fill?: FillRule }
const sources = { item, unit, ability, upgrade, doodad, buff };
export type CategoryId = keyof typeof sources;
export interface ObjectCategory { id: CategoryId; title: string; caption: string; color: string; columns: ObjectColumn[] }
const definitions: [CategoryId, string, string, string][] = [
  ['item', '物品', '装备与消耗品', '#16a085'],
  ['unit', '单位', '角色与建筑', '#4788db'],
  ['ability', '技能', '主动与被动技能', '#9270d8'],
  ['upgrade', '科技', '研究与升级', '#c38b30'],
  ['doodad', '装饰物', '场景与环境', '#619e52'],
  ['buff', '魔法效果', '状态与附加效果', '#cd7199'],
];

// Keep source column identity: the workbook intentionally repeats some field names.
export const categories: ObjectCategory[] = definitions.map(([id, title, caption, color]) => ({
  id, title, caption, color,
  columns: sources[id].map(([letter, title, field], index) => ({
    key: `${id}:${letter}`, letter, title, field,
    width: index === 0 ? 120 : index === 1 ? 112 : /说明|提示工具/.test(title) ? 224 : Math.max(144, title.length * 14 + 32),
  })),
}));
export const categoryById = Object.fromEntries(categories.map(category => [category.id, category])) as Record<CategoryId, ObjectCategory>;
