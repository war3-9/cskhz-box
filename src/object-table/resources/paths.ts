import type { Entry } from '../../model-viewer/types';
import { bounds, type CellSelection } from '../grid/geometry';
import { MAX_ROWS, type Sheet } from '../model';
export interface ResourceChoice { path: string; error?: string }
export function iconChoices(entries: Entry[]): ResourceChoice[] {
  const files = entries.filter(entry => /\.(blp|tga|dds|png|jpe?g)$/i.test(entry.path));
  const names = new Set(files.map(file => file.path.replaceAll('\\', '/').toLowerCase()));
  return files.flatMap(file => {
    const path = file.path.replaceAll('\\', '/'), bright = path.replace(/(^|\/)DISBTN/i, '$1BTN');
    if (bright !== path) return names.has(bright.toLowerCase()) ? [] : [{ path: file.path, error: '缺少亮图：未找到对应 BTN 文件' }];
    return [{ path: file.path }];
  }).sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true }));
}
export function resourcePath(path: string, prefix = '') {
  const value = (prefix ? prefix.replace(/[\\/]+$/, '') + '\\' : '') + path;
  const normalized = value.replaceAll('/', '\\');
  if (!normalized || /^[\\]|:|[\x00-\x1f]/.test(normalized) || normalized.split('\\').some(part => part === '..' || part === '.' || !part)) throw new Error('请输入有效的地图内部相对路径，不要使用盘符或上级目录');
  return normalized;
}
export function pathFill(sheet: Sheet, selection: CellSelection, paths: string[]) {
  const area = bounds(selection), count = area.r2 - area.r1 + 1;
  if (area.c1 !== area.c2) throw new Error('请先选择单列中的单元格');
  if (!paths.length) throw new Error('请选择需要导入的素材');
  if (count > 1 && count !== paths.length) throw new Error(`选中了 ${count} 个单元格，请选择相同数量的素材（当前 ${paths.length} 个）`);
  if (area.r1 + paths.length > MAX_ROWS) throw new Error('导入范围超过 100000 行');
  const column = sheet.columns[area.c1]; if (!column) throw new Error('目标列不存在，请重新选择');
  return { row: area.r1, col: area.c1, matrix: paths.map(path => [path]),
    range: `${column.letter}${area.r1 + 3}:${column.letter}${area.r1 + paths.length + 2}`,
    overwritten: paths.filter((_, index) => Boolean(sheet.rows[area.r1 + index]?.cells[column.key])).length };
}
