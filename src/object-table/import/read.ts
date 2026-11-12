import { BlobReader, ZipReader, type FileEntry } from '@zip.js/zip.js';
import { categories } from '../schema';
import { rebaseImportedColumns } from '../formulas/references';
import { initialSheets, initialViews, dataOnly, type ObjectProject, type SheetData } from '../model';
import { xmlEntry, xmlParser, tagName, excelText } from './xml';
import { readSheet } from './sheet';

export async function importExcel(blob: Blob, progress: (message: string, fraction: number) => void = () => {}): Promise<ObjectProject> {
  const zip = new ZipReader(new BlobReader(blob));
  try {
    const entries = await zip.getEntries(), files = new Map(entries.filter(e => !e.directory).map(e => [e.filename, e as FileEntry]));
    const get = (name: string) => { const file = files.get(name); if (!file) throw new Error(`Excel 缺少 ${name}`); return file; };
    const strings: string[] = []; let text = '', inText = false, phonetic = false;
    const sp = xmlParser();
    sp.on('opentag', tag => { if (tagName(tag.name) === 'si') text = ''; if (tagName(tag.name) === 'rPh') phonetic = true; if (tagName(tag.name) === 't' && !phonetic) inText = true; });
    sp.on('text', value => { if (inText) text += value; });
    sp.on('closetag', tag => { if (tagName(tag.name) === 'rPh') phonetic = false; if (tagName(tag.name) === 't') inText = false; if (tagName(tag.name) === 'si') { strings.push(excelText(text)); if (strings.length > 3000000) throw new Error('共享文本过多'); } });
    if (files.has('xl/sharedStrings.xml')) await xmlEntry(get('xl/sharedStrings.xml'), sp, (n, t) => progress('读取共享文本', .1 * n / t));
    const links = new Map<string, string>(), names: { name: string; rid: string }[] = [];
    const rp = xmlParser(); rp.on('opentag', t => { if (tagName(t.name) === 'Relationship' && t.attributes.TargetMode !== 'External') links.set(String(t.attributes.Id), String(t.attributes.Target)); });
    await xmlEntry(get('xl/_rels/workbook.xml.rels'), rp);
    const wp = xmlParser(); wp.on('opentag', t => { if (tagName(t.name) === 'sheet') names.push({ name: String(t.attributes.name), rid: String(t.attributes['r:id']) }); });
    await xmlEntry(get('xl/workbook.xml'), wp);
    const sheets = dataOnly(initialSheets()), customSheets: Record<string, SheetData> = {}, views = initialViews(), found = new Set<string>();
    const shiftedIds = new Set<string>(), shiftedNames = new Set<string>();
    for (let i = 0; i < names.length; i++) {
      const { name, rid } = names[i], target = links.get(rid);
      if (!target) continue;
      const path = target.startsWith('/') ? target.slice(1) : new URL(target, 'https://excel/xl/').pathname.slice(1);
      if (!path.startsWith('xl/worksheets/') || !files.has(path)) continue;
      const result = await readSheet(get(path), name, strings, (n, t) => progress(`读取 ${name}`, .1 + .9 * (i + n / t) / names.length));
      if (!result) continue;
      if (result.id) {
        if (found.has(result.id)) throw new Error(`发现重复的 ${result.id} 物编页`);
        found.add(result.id); sheets[result.id] = result.sheet;
        if (result.shifted) { shiftedIds.add(result.id); shiftedNames.add(name.toLowerCase()); }
      } else {
        const id = `custom-${i + 1}`;
        const keyMap = new Map(result.sheet.columns.map(column => [column.key, `${id}:${column.letter}`]));
        customSheets[id] = {
          ...result.sheet,
          columns: result.sheet.columns.map(column => ({ ...column, key: keyMap.get(column.key)! })),
          rows: result.sheet.rows.map(row => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).map(([key, value]) => [keyMap.get(key) ?? key, value])) })),
        };
        views[id] = { frozen: 0, left: 0, top: 0 };
      }
    }
    if (!found.size && !Object.keys(customSheets).length) throw new Error('Excel 中没有可导入的表格内容');
    if (shiftedIds.size) {
      for (const category of categories) if (shiftedIds.has(category.id)) {
        shiftedNames.add(category.id.toLowerCase()); shiftedNames.add(category.title.toLowerCase());
      }
      for (const category of categories) {
        const sheet = sheets[category.id], rebase = (value: string) => value.startsWith('=') && (shiftedIds.has(category.id) || value.includes('!'))
          ? rebaseImportedColumns(value, sheet.name, shiftedNames) : value;
        sheet.rows = sheet.rows.map(row => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).map(([key, value]) => [key, rebase(value)])) }));
        sheet.auxiliary = Object.fromEntries(Object.entries(sheet.auxiliary).map(([key, value]) => [key, rebase(value)]));
      }
    }
    progress(`完成：${found.size} 类标准物编，${Object.keys(customSheets).length} 个自定义分类`, 1);
    return { format: 'war3-objects', version: 3, active: found.size ? 'item' : Object.keys(customSheets)[0], sheets, customSheets, views };
  } finally { await zip.close(); }
}
