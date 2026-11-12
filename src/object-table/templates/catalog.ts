import data from './catalog.json';
import type { CategoryId } from '../schema';
import { useObjectTable } from '../store';
// Compact ID/name/folder data extracted from the user's supplied catalog and template names.
export interface ObjectTemplate { id: string; name: string; folders: string[]; art: string; bundled: boolean; source?: string }
const order = ['人族', '兽族', '不死族', '暗夜精灵族', '中立 - 娜迦', '中立敌对', '中立被动', '恶魔', '通用', '特殊', '其他', '永久', '可充', '力量提升', '人造', '可购买', '战役', '混杂', '对战', '单位', '建筑', '英雄', '单位技能', '英雄技能', '物品技能', '环境', '道具', '水', '悬崖', '可破坏装饰物', '桥梁', '路径'];
function compareFolders(a: string[], b: string[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    const sequence = i > 0 && ['对战', '战役'].includes(a[i - 1]) ? ['单位', '建筑', '英雄', '特殊'] : order;
    const rank = (value: string) => { const n = sequence.indexOf(value); return n < 0 ? sequence.length : n; };
    return rank(a[i]) - rank(b[i]) || a[i].localeCompare(b[i], 'zh-CN');
  }
  return a.length - b.length;
}
export function templatesFor(kind: CategoryId, query = ''): ObjectTemplate[] {
  const needle = query.trim().toLocaleLowerCase();
  const source = useObjectTable.getState().metadata?.binding?.source;
  const custom: ObjectTemplate[] = source ? Object.entries(source.objects).filter(([key, o]) => key.startsWith(`${kind}:`) && o.custom).map(([, o]) => {
    const name = Object.values(o.fields).find(f => ['unam', 'bnam'].includes(f.id))?.value;
    const art = Object.values(o.fields).find(f => ['uico', 'iico'].includes(f.id))?.value;
    const fallback = (data[kind] as [string, string, string[], string, boolean][]).find(e => e[0] === o.parent);
    const text = String(name ?? o.id), ref = text.match(/^TRIGSTR_(\d+)$/);
    return { id: o.id, name: ref ? source.strings[String(Number(ref[1]))] ?? text : text, folders: ['当前地图', source.path.split(/[\\/]/).pop() ?? '地图'], art: String(art ?? fallback?.[3] ?? ''), bundled: false, source: source.path };
  }) : [];
  return [...custom, ...(data[kind] as [string, string, string[], string, boolean][]).map(([id, name, folders, art, bundled]) => ({ id, name, folders, art, bundled }))]
    .filter(entry => !needle || [entry.id, entry.name, ...entry.folders].some(s => s.toLocaleLowerCase().includes(needle)))
    .sort((a, b) => compareFolders(a.folders, b.folders) || a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
}
export interface TemplateFolder { name: string; path: string; children: TemplateFolder[]; entries: ObjectTemplate[] }
export function templateTree(entries: ObjectTemplate[]): TemplateFolder[] {
  const roots: TemplateFolder[] = [];
  for (const entry of entries) {
    let nodes = roots, parent: TemplateFolder | undefined, path = '';
    for (const name of entry.folders) {
      path += '/' + name; parent = nodes.find(n => n.name === name);
      if (!parent) { parent = { name, path, children: [], entries: [] }; nodes.push(parent); } nodes = parent.children;
    }
    parent?.entries.push(entry);
  }
  return roots;
}
