import { validateVariableDocument, type VariableDocument } from './variables/document';
import { create } from 'zustand';
import { newTaskSheets } from './newTask';
import { categories } from './schema';
import { emptyRow, initialViews, isStandardSheet, MAX_ROWS, type ObjectProject, type Sheets, type Views, type ObjectRow, type Sheet } from './model';
import { spliceRows } from './rows';
import { validateFillRule, type FillRule } from './fill/series';
import { alignCells } from './alignment';
import type { CellAlignment } from './model';
import type { CellSelection } from './grid/geometry';
import { applyPaste, type PastePlan } from './pastePlan';
export type { ObjectRow } from './model';

export interface State {
  variables?: VariableDocument;
  savedVariables?: VariableDocument;
  pastVariables: (VariableDocument | undefined)[];
  futureVariables: (VariableDocument | undefined)[];
  setVariables: (variables: VariableDocument) => void;
  undoVariables: () => void;
  redoVariables: () => void;
  metadata: ObjectProject['metadata'];
  savedMetadata: ObjectProject['metadata'];
  bookId: string;
  active: string;
  sheets: Sheets;
  views: Views;
  path: string | null;
  savedRows: Record<string, ObjectRow[]>;
  savedViews: Views;
  savedColumns: Record<string, Sheet['columns']>;
  pastBooks: Sheets[];
  futureBooks: Sheets[];
  setSheet: (category: string, sheet: Sheet) => void;
  activate: (category: string) => void;
  addRow: () => string;
  changeCell: (category: string, rowId: string, key: string, value: string) => void;
  removeRow: (id: string) => void;
  undo: () => void;
  redo: () => void;
  write: (category: string, row: number, column: number, matrix: string[][]) => void;
  paste: (category: string, row: number, plan: PastePlan) => void;
  clear: (category: string, startRow: number, endRow: number, startCol: number, endCol: number) => void;
  insertRow: (index: number) => void;
  insertRows: (index: number, count: number) => void;
  removeRows: (first: number, last: number) => void;
  resizeColumn: (category: string, key: string, width: number) => void;
  setFillRule: (category: string, key: string, rule: FillRule) => void;
  setAlignment: (category: string, selection: CellSelection, alignment: CellAlignment) => void;
  replaceAll: (category: string, query: string, replacement: string) => number;
  setView: (category: string, value: Partial<Views[string]>) => void;
  restore: (project: ObjectProject, path?: string | null, saved?: boolean) => void;
  markSaved: (path: string | null, rows: State['savedRows'], views?: Views, columns?: State['savedColumns'], metadata?: ObjectProject['metadata']) => void;
}
const rowsOf = (sheets: Sheets) => Object.fromEntries(Object.entries(sheets).map(([id, sheet]) => [id, sheet.rows])) as State['savedRows'];
const commit = (sheet: Sheet, rows: ObjectRow[]): Sheet => ({ ...sheet, rows, past: [...sheet.past.slice(-79), sheet.rows], future: [] });
const starting = newTaskSheets();
const transition = (state: State, sheets: Sheets) => ({ sheets, pastBooks: [...state.pastBooks.slice(-79), state.sheets], futureBooks: [] });
const columnsOf = (sheets: Sheets) => Object.fromEntries(Object.entries(sheets).map(([id, sheet]) => [id, sheet.columns])) as State['savedColumns'];
export const isObjectDirty = (state: State) => state.variables !== state.savedVariables || state.metadata !== state.savedMetadata || Object.keys(state.sheets).some(id => state.sheets[id].rows !== state.savedRows[id] || state.sheets[id].columns !== state.savedColumns[id] || (state.views[id].frozen !== state.savedViews[id].frozen || JSON.stringify(state.views[id].hiddenColumns ?? []) !== JSON.stringify(state.savedViews[id].hiddenColumns ?? [])));

export const useObjectTable = create<State>((set, get) => ({
  variables: undefined, savedVariables: undefined, pastVariables: [], futureVariables: [],
  setVariables: variables => { validateVariableDocument(variables); set(state => JSON.stringify(state.variables) === JSON.stringify(variables) ? state : ({ variables, pastVariables: [...state.pastVariables.slice(-79), state.variables], futureVariables: [] })); },
  undoVariables: () => set(state => state.pastVariables.length ? ({ variables: state.pastVariables.at(-1), pastVariables: state.pastVariables.slice(0, -1), futureVariables: [state.variables, ...state.futureVariables] }) : state),
  redoVariables: () => set(state => state.futureVariables.length ? ({ variables: state.futureVariables[0], pastVariables: [...state.pastVariables, state.variables], futureVariables: state.futureVariables.slice(1) }) : state),
  metadata: undefined, savedMetadata: undefined,
  bookId: crypto.randomUUID(),
  active: 'item', sheets: starting, views: initialViews(), savedViews: initialViews(), savedColumns: columnsOf(starting), path: null, savedRows: rowsOf(starting), pastBooks: [], futureBooks: [],
  setSheet: (category, sheet) => set(state => transition(state, { ...state.sheets, [category]: { ...sheet, rows: [...sheet.rows] } })),
  activate: active => set({ active }),
  addRow: () => {
    const id = crypto.randomUUID();
    set(state => {
      const sheet = state.sheets[state.active];
      if (sheet.rows.length >= MAX_ROWS) throw new Error('最多支持 100000 行');
      return transition(state, { ...state.sheets, [state.active]: commit(sheet, [...sheet.rows, { id, cells: {} }]) });
    });
    return id;
  },
  changeCell: (category, rowId, key, value) => set(state => {
    const sheet = state.sheets[category];
    const row = sheet.rows.find(row => row.id === rowId);
    if (!row || (row.cells[key] ?? '') === value || !sheet.columns.some(column => column.key === key)) return state;
    const cells = { ...row.cells };
    if (value === '') delete cells[key]; else cells[key] = value;
    const rows = sheet.rows.map(row => row.id === rowId ? { ...row, cells } : row);
    return transition(state, { ...state.sheets, [category]: commit(sheet, rows) });
  }),
  removeRow: id => set(state => {
    const sheet = state.sheets[state.active];
    if (!sheet.rows.some(row => row.id === id)) return state;
    return transition(state, spliceRows(state.sheets, state.active, sheet.rows.findIndex(row => row.id === id), -1));
  }),
  undo: () => {
    const state = get(); if (!state.pastBooks.length) return;
    set({ sheets: state.pastBooks.at(-1)!, pastBooks: state.pastBooks.slice(0, -1), futureBooks: [state.sheets, ...state.futureBooks] });
  },
  redo: () => {
    const state = get(); if (!state.futureBooks.length) return;
    set({ sheets: state.futureBooks[0], pastBooks: [...state.pastBooks, state.sheets], futureBooks: state.futureBooks.slice(1) });
  },
  write: (category, startRow, startCol, matrix) => set(state => {
    if (!matrix.length || startRow < 0 || startCol < 0 || startRow + matrix.length > MAX_ROWS) throw new Error('粘贴范围超过 100000 行');
    const sheet = state.sheets[category];
    if (matrix.some(row => startCol + row.length > sheet.columns.length)) throw new Error('粘贴范围超过当前表格的列数');
    const rows = [...sheet.rows]; let changed = false;
    matrix.forEach((values, offset) => {
      const index = startRow + offset;
      if (!rows[index] && values.every(value => value === '')) return;
      while (rows.length <= index) rows.push(emptyRow());
      const cells = { ...rows[index].cells };
      values.forEach((value, col) => {
        const key = sheet.columns[startCol + col].key;
        if ((cells[key] ?? '') === value) return;
        changed = true; if (value === '') delete cells[key]; else cells[key] = value;
      });
      rows[index] = { ...rows[index], cells };
    });
    return changed ? transition(state, { ...state.sheets, [category]: commit(sheet, rows) }) : state;
  }),
  paste: (category, row, plan) => set(state => {
    const sheet = applyPaste(state.sheets[category], row, plan);
    return sheet === state.sheets[category] ? state : transition(state, { ...state.sheets, [category]: sheet });
  }),
  clear: (category, r1, r2, c1, c2) => get().write(category, r1, c1, Array.from({ length: r2 - r1 + 1 }, () => Array(c2 - c1 + 1).fill(''))),
  insertRow: index => get().insertRows(index, 1),
  insertRows: (index, count) => set(state => {
    const sheet = state.sheets[state.active];
    if (!Number.isInteger(count) || count < 1 || count > 2000) throw new Error('每次可添加 1～2000 行');
    if (sheet.rows.length + count > MAX_ROWS) throw new Error('最多支持 100000 行');
    return transition(state, spliceRows(state.sheets, state.active, Math.min(Math.max(0, index), sheet.rows.length), count));
  }),
  removeRows: (first, last) => set(state => {
    const length = state.sheets[state.active].rows.length, start = Math.max(0, first), end = Math.min(length - 1, last);
    if (end < start) return state;
    return transition(state, spliceRows(state.sheets, state.active, start, -(end - start + 1)));
  }),
  resizeColumn: (category, key, width) => set(state => {
    const sheet = state.sheets[category]; if (!Number.isFinite(width)) return state;
    const size = Math.round(Math.min(4000, Math.max(48, width)));
    if (!sheet.columns.some(c => c.key === key && c.width !== size)) return state;
    return transition(state, { ...state.sheets, [category]: { ...sheet, columns: sheet.columns.map(c => c.key === key ? { ...c, width: size } : c) } });
  }),
  setFillRule: (category, key, rule) => {
    validateFillRule(rule);
    set(state => {
      const sheet = state.sheets[category], column = sheet.columns.find(c => c.key === key);
      if (!column || JSON.stringify(column.fill) === JSON.stringify(rule)) return state;
      return transition(state, { ...state.sheets, [category]: { ...sheet, columns: sheet.columns.map(c => c.key === key ? { ...c, fill: structuredClone(rule) } : c) } });
    });
  },
  setAlignment: (category, selection, alignment) => set(state => {
    const sheet = state.sheets[category], rows = alignCells(sheet, selection, alignment);
    return rows === sheet.rows ? state : transition(state, { ...state.sheets, [category]: commit(sheet, rows) });
  }),
  replaceAll: (category, query, replacement) => {
    if (!query) return 0; let count = 0;
    set(state => {
      const sheet = state.sheets[category], idKey = sheet.columns[0].key;
      const rows = sheet.rows.map(row => {
        const cells = { ...row.cells }; let changed = false;
        for (const [key, value] of Object.entries(cells)) {
          if (isStandardSheet(category) && key === idKey || !value.includes(query)) continue;
          const next = value.split(query).join(replacement); if (next === value) continue;
          if (next) cells[key] = next; else delete cells[key]; changed = true; count++;
        }
        return changed ? { ...row, cells } : row;
      });
      return count ? transition(state, { ...state.sheets, [category]: commit(sheet, rows) }) : state;
    }); return count;
  },
  setView: (category, value) => set(state => {
    const prev = state.views[category];
    if (Object.entries(value).every(([key, next]) => prev[key as keyof typeof prev] === next)) return state;
    return { views: { ...state.views, [category]: { ...prev, ...value } } };
  }),
  restore: (project, path = null, saved = true) => {
    const standard = Object.fromEntries(categories.map(({ id }) => [id, { ...project.sheets[id], past: [], future: [] }]));
    const custom = Object.fromEntries(Object.entries(project.customSheets ?? {}).map(([id, sheet]) => [id, { ...sheet, past: [], future: [] }]));
    const sheets = { ...standard, ...custom } as Sheets;
    const views = { ...initialViews(), ...project.views };
    set({ variables: project.variables, savedVariables: saved ? project.variables : undefined, pastVariables: [], futureVariables: [], metadata: project.metadata, savedMetadata: saved ? project.metadata : undefined, bookId: crypto.randomUUID(), active: project.active, sheets, views, savedViews: views, savedColumns: columnsOf(sheets), path, pastBooks: [], futureBooks: [], savedRows: saved ? rowsOf(sheets) : Object.fromEntries(Object.keys(sheets).map(id => [id, [] as ObjectRow[]])) as State['savedRows'] });
  },
  markSaved: (path, savedRows, savedViews = get().views, savedColumns = columnsOf(get().sheets), savedMetadata = get().metadata) => set({ path, savedRows, savedViews, savedColumns, savedMetadata, savedVariables: get().variables }),
}));
