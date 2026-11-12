import { expect, it } from 'vitest';
import { newTaskSheets } from './newTask';
import { initialSheets, initialViews, dataOnly } from './model';
import { compileNative } from './native/mapping';
import { openObjectTask, restoreObjectWorkspace, serializeObjectWorkspace, useObjectTasks } from './tasks/store';
import { useObjectTable } from './store';
import { parseObjectProject, serializeObjectProject } from './project';

it('seeds all six categories from the supplied workbook and preserves optional blank fields', () => {
  const sheets = newTaskSheets();
  expect(sheets.item.rows[0].cells).toMatchObject({ 'item:B': 'I000', 'item:C': 'afac', 'item:D': '阿利亚之笛', 'item:K': 'ReplaceableTextures\\CommandButtons\\BTNAlleriaFlute.blp', 'item:Y': '400', 'item:AJ': '1' });
  expect(Object.values(sheets).map(s => s.rows.length)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(Object.values(sheets).map(s => Object.keys(s.rows[0].cells).length)).toEqual([36, 100, 46, 9, 13, 8]);
  expect(sheets.item.rows[0].cells['item:O']).toBeUndefined();
  expect(sheets.unit.rows[0].cells['unit:AO']).toBe('Shadow');
  expect(sheets.unit.rows[0].cells['unit:BT']).toBe('Shadow');
  expect(sheets.buff.columns.at(-1)).toMatchObject({ key: 'buff:I', field: 'EditorName' });
  expect(sheets.buff.rows[0].cells['buff:I']).toBe('暴风雪');
  expect(sheets.ability.rows[0].cells['ability:W']).toBeUndefined();
  expect(sheets.ability.rows[0].cells['ability:X']).toBeUndefined();
  expect(newTaskSheets().item.rows[0].id).not.toBe(sheets.item.rows[0].id);
  const compiled = compileNative({ format: 'war3-objects', version: 2, active: 'item', sheets: dataOnly(sheets), views: initialViews() });
  expect(compiled.issues).toEqual([]);
  expect(Object.keys(compiled.objects)).toEqual(['item:I000', 'unit:H000', 'ability:A000', 'upgrade:R000', 'doodad:D000', 'buff:B000']);
  expect(compiled.objects['item:I000'].parent).toBe('afac');
  expect(compiled.objects['item:I000'].fields['ubpx:0:0'].value).toBe(0);
  expect(compiled.objects['ability:A000'].fields['abpx:0:0'].value).toBe(1);
  expect(compiled.objects['unit:H000'].fields['ua1z:0:0'].value).toBe(0);
  const project = { format: 'war3-objects', version: 2, active: 'item', sheets: dataOnly(sheets), views: initialViews() } as const;
  expect(parseObjectProject(serializeObjectProject(project))).toEqual(project);
});

it('does not share mutable defaults between tasks', () => {
  const first = newTaskSheets(), second = newTaskSheets();
  for (const kind of Object.keys(first) as (keyof typeof first)[]) {
    expect(first[kind].rows[0].id).not.toBe(second[kind].rows[0].id);
    first[kind].rows[0].cells[first[kind].columns[0].key] = 'TEST';
    first[kind].columns[0].title = 'changed';
    expect(second[kind].columns[0].title).toBe('自定义ID');
    expect(newTaskSheets()[kind].rows[0].cells).toEqual(second[kind].rows[0].cells);
  }
});

it('keeps imports empty and does not recreate deleted rows on recovery', () => {
  useObjectTasks.setState({ tasks: [], activeId: null });
  openObjectTask();
  useObjectTable.getState().removeRow(useObjectTable.getState().sheets.item.rows[0].id);
  restoreObjectWorkspace(serializeObjectWorkspace());
  expect(useObjectTable.getState().sheets.item.rows).toEqual([]);
  openObjectTask({ format: 'war3-objects', version: 2, active: 'item', sheets: dataOnly(initialSheets()), views: initialViews() });
  expect(useObjectTable.getState().sheets.item.rows).toEqual([]);
  openObjectTask();
  expect(useObjectTable.getState().sheets.item.rows).toHaveLength(1);
});
