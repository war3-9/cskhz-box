import { z } from 'zod';
export const variableSchema = z.object({ name: z.string(), type: z.string(), array: z.boolean(), size: z.number().int(), initial: z.string(), initialized: z.boolean() });
export type GuiVariable = z.infer<typeof variableSchema>;
export interface DraftVariable extends GuiVariable { original: string | null }
export interface VariableChange { before: GuiVariable | null; after: GuiVariable | null }
export const variableTypes: Record<string, string> = {
  boolean: '布尔值', integer: '整数', real: '实数', string: '字符串', unit: '单位', unitcode: '单位类型', group: '单位组', player: '玩家', force: '玩家组',
  item: '物品', itemcode: '物品类型', destructable: '可破坏物', destructablecode: '可破坏物类型', location: '点', rect: '矩形区域', region: '不规则区域',
  trigger: '触发器', timer: '计时器', timerdialog: '计时器窗口', dialog: '对话框', button: '对话框按钮', texttag: '漂浮文字', leaderboard: '排行榜', multiboard: '多面板',
  multiboarditem: '多面板项目', camerasetup: '镜头', sound: '声音', effect: '特效', lightning: '闪电效果', gamecache: '游戏缓存', hashtable: '哈希表',
  ability: '技能', abilcode: '技能类型', buffcode: '魔法效果类型', techcode: '科技类型', ordercode: '命令类型', race: '种族', quest: '任务', questitem: '任务目标项',
  itempool: '物品池', unitpool: '单位池', trackable: '可追踪物', image: '图像', terraindeformation: '地形变形', ubersplat: '地面纹理', fogmodifier: '可见度修正器',
  weathereffect: '天气效果', boolexpr: '布尔表达式', radian: '弧度', degree: '角度', dzeffectgroup: '特效组', doodad: '地形装饰物', CollisionType: '碰撞类型',
  frame: '界面框架', framepoints: '锚点', frameevent: '界面事件', gamekey: '按键', mousekey: '鼠标',
};
export const asDraft = (rows: GuiVariable[]): DraftVariable[] => rows.map(row => ({ ...row, original: row.name }));
export const clean = ({ original: _original, ...row }: DraftVariable): GuiVariable => row;
export const same = (a: GuiVariable | undefined, b: GuiVariable | undefined) => a === undefined || b === undefined ? a === b : (Object.keys(variableSchema.shape) as (keyof GuiVariable)[]).every(key => a[key] === b[key]);
const key = (name: string) => name.toLowerCase();
export function validateVariable(row: GuiVariable) {
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\/\*[^\r\n]*\*\/)?$/.test(row.name) || row.name.slice(row.name.indexOf('/*') + 2, -2).includes('*/') || /^gg_/i.test(row.name) || bytes(row.name) >= 100)
    throw new Error('变量名以英文字母开头，可用字母、数字、下划线及末尾 /*中文说明*/，须少于100字节。');
  if (!row.type || !/^[A-Za-z][A-Za-z0-9_]*$/.test(row.type) || bytes(row.type) >= 30 || row.size < 1 || row.size > 8192 || !Number.isInteger(row.size) || !row.array && row.size !== 1)
    throw new Error('请选择变量类型，数组大小为1～8192。');
  if (bytes(row.initial) >= 300 || row.initial.includes('\0')) throw new Error('初始值须少于300字节，不能包含空字符。');
}
export function planVariables(base: GuiVariable[], draft: DraftVariable[], remote: GuiVariable[]): VariableChange[] {
  const baseline = new Map(base.map(v => [key(v.name), v])), live = new Map(remote.map(v => [key(v.name), v]));
  const names = new Set<string>(), origins = new Set<string>(), changes: VariableChange[] = [];
  for (const entry of draft) {
    const local = clean(entry); validateVariable(local);
    if (names.has(key(local.name))) throw new Error(`变量名重复：${local.name}`); names.add(key(local.name));
    const origin = entry.original === null ? null : key(entry.original), old = origin === null ? undefined : baseline.get(origin);
    if (origin !== null) { if (!old || origins.has(origin)) throw new Error('变量来源已变化，请刷新'); origins.add(origin); }
    const current = live.get(origin ?? key(local.name));
    if (!old) { if (current && !same(current, local)) throw new Error(`编辑器已存在同名变量：${local.name}`); if (!current) changes.push({ before: null, after: local }); continue; }
    if (!current) throw new Error(`编辑器已删除或改名：${old.name}；草稿已保留`);
    if (key(local.name) !== origin && live.has(key(local.name))) throw new Error(`编辑器已存在目标变量名：${local.name}`);
    const merged = { ...current };
    for (const field of Object.keys(variableSchema.shape) as (keyof GuiVariable)[]) {
      if (local[field] === old[field]) continue;
      if (current[field] !== old[field] && current[field] !== local[field]) throw new Error(`表格和编辑器同时修改了变量 ${old.name} 的${field}；草稿已保留`);
      Object.assign(merged, { [field]: local[field] });
    }
    if (!same(current, merged)) changes.push({ before: current, after: merged });
  }
  for (const [origin, old] of baseline) if (!origins.has(origin)) {
    const current = live.get(origin); if (!current) continue;
    if (!same(old, current)) throw new Error(`编辑器已修改待删除变量：${old.name}；草稿已保留`);
    changes.push({ before: current, after: null });
  }
  return changes;
}
