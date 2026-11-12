import { basename, normalizePath, resourceKey, type ResourceRef, type Source } from '../types';

export function singleModelName(value: string, original: string, directory = '') {
  const extension = original.match(/\.(mdx|mdl)$/i)?.[0].toLowerCase();
  if (!extension) throw new Error('只能重命名 MDX 或 MDL 模型');
  if (!value.trim() || value !== value.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(value)
    || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(value)) {
    throw new Error('请输入有效模型文件名，不能包含目录、特殊字符或首尾空格');
  }
  if (/\.(mdx|mdl)$/i.test(value) && !value.toLowerCase().endsWith(extension)) {
    throw new Error(`请保留原模型的 ${extension} 格式，修改扩展名不会转换模型`);
  }
  const name = mapDirectory(directory) + (value.toLowerCase().endsWith(extension) ? value : value + extension);
  if (new TextEncoder().encode(name).length > 230) throw new Error('目录与名称合计过长，请缩短，给模型内的贴图编号留出空间');
  return name;
}

export function mapDirectory(value: string) {
  const path = value.trim().replaceAll('/', '\\');
  if (!path) return '';
  const parts = path.replace(/\\+$/, '').split('\\');
  if (parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part)
    || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) {
    throw new Error('请填写地图内的相对目录，如 unit 或 Models\\Units；不能填盘符、上级目录或特殊文件名');
  }
  if (new TextEncoder().encode(parts.join('\\')).length > 120) throw new Error('地图内路径过长，请缩短目录（最多 120 字节）');
  return parts.join('\\') + '\\';
}

export function renamePlan(paths: string[], prefix: string, start: string, directory = '') {
  if (!prefix.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(prefix) || /[. ]$/.test(prefix) || prefix.length > 60 || !/^\d{1,9}$/.test(start)) return [];
  const first = Number(start);
  const models = paths.filter(path => /\.(mdx|mdl)$/i.test(path));
  if (first < 1 || first + models.length - 1 > 999999999) return [];
  const folder = mapDirectory(directory);
  const plan = models.map((path, index) => ({ path, name: `${folder}${prefix}(${first + index}).${path.split('.').pop()?.toLowerCase()}` }));
  if (plan.some(item => new TextEncoder().encode(item.name).length > 230)) throw new Error('目录与名称合计过长，请缩短，给模型内的贴图编号留出空间');
  return plan;
}
export function exportPath(ref: ResourceRef, sources: Source[], names: Record<string, string>) {
  const source = sources.find(item => item.id === ref.sourceId);
  const name = source && names[resourceKey(source, ref.path)];
  return name || ref.path;
}
export function renameConflict(source: Source, names: Record<string, string>) {
  const paths = new Set<string>();
  for (const entry of source.entries.filter(item => item.model)) {
    const path = normalizePath(exportPath({ sourceId: source.id, path: entry.path }, [source], names));
    if (paths.has(path)) return `输出名称重复：${basename(path)}`;
    paths.add(path);
  }
  return '';
}
