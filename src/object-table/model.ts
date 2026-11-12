import { categories, categoryById, type CategoryId, type ObjectColumn } from './schema';
import type { VariableDocument } from './variables/document';
import type { ObjectMetadata } from './sync/types';

export type CellAlignment = 'left' | 'center' | 'right';
export type SheetId = string;
export interface ObjectRow { id: string; cells: Record<string, string>; alignments?: Record<string, CellAlignment> }
export interface SheetData {
  units?: import('./numbers/model').UnitSettings;
  name: string; columns: ObjectColumn[]; rows: ObjectRow[]; auxiliary: Record<string, string>;
}
export interface Sheet extends SheetData { past: ObjectRow[][]; future: ObjectRow[][] }
export interface TableView { frozen: number; left: number; top: number; hiddenColumns?: string[] }
export type Sheets = Record<SheetId, Sheet>;
export type Views = Record<SheetId, TableView>;
export interface ObjectProject { format: 'war3-objects'; version: 1 | 2 | 3; variables?: VariableDocument; active: SheetId; sheets: Record<string, SheetData>; customSheets?: Record<string, SheetData>; views: Views; metadata?: ObjectMetadata }
export const MAX_ROWS = 100000;
export const emptyRow = (): ObjectRow => ({ id: crypto.randomUUID(), cells: {} });
export const initialSheets = (): Sheets => Object.fromEntries(categories.map(({ id }) => [id, {
  name: categoryById[id].title, columns: categoryById[id].columns, rows: [], auxiliary: {}, past: [], future: [],
}])) as unknown as Sheets;
export const initialViews = (): Views => Object.fromEntries(categories.map(({ id }) => [id, { frozen: 2, left: 0, top: 0 }])) as Views;
export const isStandardSheet = (id: string): id is CategoryId => categories.some(category => category.id === id);
export function columnNumber(letter: string): number { return [...letter].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0); }
export function columnLetter(number: number): string {
  let result = '';
  for (; number > 0; number = Math.floor((number - 1) / 26)) result = String.fromCharCode(65 + (number - 1) % 26) + result;
  return result;
}
export const dataOnly = (sheets: Sheets): ObjectProject['sheets'] => Object.fromEntries(categories.map(({ id }) => {
  const { past: _past, future: _future, ...data } = sheets[id]; return [id, data];
})) as ObjectProject['sheets'];
export const customDataOnly = (sheets: Sheets): Record<string, SheetData> => Object.fromEntries(Object.entries(sheets)
  .filter(([id]) => !isStandardSheet(id))
  .map(([id, { past: _past, future: _future, ...data }]) => [id, data]));
