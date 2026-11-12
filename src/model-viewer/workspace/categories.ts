import { resourceKey, type Source } from '../types';

export interface CategoryData { categoryNames: string[]; categories: Record<string, string>; category: string; page: number; status: string }
export interface CategoryActions {
  createCategory: (name: string, keys?: string[]) => string;
  renameCategory: (previous: string, name: string) => void;
  deleteCategory: (name: string) => void;
  assign: (keys: string[], category: string) => number;
}
const reserved = new Set(['?', '*', '全部分类', '未分类', '收藏']);
function categoryName(raw: string, names: string[]) {
  const name = raw.trim();
  if (!name) throw new Error('请输入分类名称');
  if (name.length > 100) throw new Error('分类名称最多 100 字');
  if (reserved.has(name)) throw new Error('不能使用内置分类名称');
  if (names.includes(name)) throw new Error('分类名称已存在');
  return name;
}
export function selectedModelKeys(source: Source, selected: string[]) {
  const checked = new Set(selected);
  return source.entries.filter(entry => entry.model && checked.has(resourceKey(source, entry.path))).map(entry => resourceKey(source, entry.path));
}
export function contextModelKeys(source: Source, selected: string[], path: string) {
  if (!source.entries.some(entry => entry.model && entry.path === path)) return [];
  const key = resourceKey(source, path);
  return selected.includes(key) ? selectedModelKeys(source, selected) : [key];
}
export function categoryActions<T extends CategoryData>(set: (update: (state: T) => Partial<T>) => void): CategoryActions {
  return {
    createCategory: (raw, keys = []) => {
      let name = '';
      set(state => {
        name = categoryName(raw, state.categoryNames);
        if (state.categoryNames.length >= 200) throw new Error('最多创建 200 个分类');
        const targets = [...new Set(keys)];
        return { categoryNames: [...state.categoryNames, name], categories: { ...state.categories, ...Object.fromEntries(targets.map(key => [key, name])) },
          ...(targets.length ? { page: 0 } : {}), status: targets.length ? `已将 ${targets.length} 个模型添加到分类「${name}」` : `已创建分类「${name}」` } as Partial<T>;
      });
      return name;
    },
    renameCategory: (previous, raw) => set(state => {
      if (!state.categoryNames.includes(previous)) throw new Error('分类已不存在');
      const name = categoryName(raw, state.categoryNames.filter(value => value !== previous));
      return { categoryNames: state.categoryNames.map(value => value === previous ? name : value), categories: Object.fromEntries(Object.entries(state.categories).map(([key, value]) => [key, value === previous ? name : value])), category: state.category === previous ? name : state.category, status: `已重命名分类为「${name}」` } as Partial<T>;
    }),
    deleteCategory: name => set(state => ({ categoryNames: state.categoryNames.filter(value => value !== name), categories: Object.fromEntries(Object.entries(state.categories).filter(([, value]) => value !== name)), category: state.category === name ? '' : state.category, page: 0, status: `已删除分类「${name}」` } as Partial<T>)),
    assign: (keys, category) => {
      const targets = [...new Set(keys)];
      set(state => {
        if (category && !state.categoryNames.includes(category)) throw new Error('分类已不存在');
        const categories = { ...state.categories };
        for (const key of targets) { if (category) categories[key] = category; else delete categories[key]; }
        return { categories, ...(targets.length ? { page: 0 } : {}), status: category ? `已将 ${targets.length} 个模型添加到分类「${category}」` : `已将 ${targets.length} 个模型移出分类` } as Partial<T>;
      });
      return targets.length;
    },
  };
}
