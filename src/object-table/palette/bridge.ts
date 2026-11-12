import { isTauri, invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { useObjectTable } from '../store';
import { applyPaletteDraft, paletteTarget, type PaletteDraft, type PaletteTarget } from './model';
import type { CategoryId } from '../schema';
export const useBrowserPalette = create<{ target: PaletteTarget | null; error: string }>(() => ({ target: null, error: '' }));
let draft: PaletteDraft | null = null, initialize: Promise<void> | null = null;
let preparing: Promise<void> | null = null;
export function preparePalette() {
  if (!isTauri()) return Promise.resolve();
  return preparing ??= initializePaletteBridge().then(() => invoke<void>('object_palette_prepare')).catch(error => { preparing = null; throw error; });
}
let snapshot: { request: string; token: string; resolve: () => void; timer: ReturnType<typeof setTimeout> } | null = null;
let synchronizing: Promise<void> | null = null, opening: Promise<void> = Promise.resolve();
export const updatePaletteDraft = (value: PaletteDraft) => { draft = value; };
export const discardPaletteDraft = () => { draft = null; useBrowserPalette.setState({ target: null, error: '' }); };
async function revealDraftError(error: unknown) {
  if (!draft) return;
  if (isTauri()) {
    // Recover the existing editor without replacing its unsaved text.
    await invoke('object_palette_reveal').then(() => emitTo('object-palette', 'object-palette-error', String(error))).catch(() => {});
  } else useBrowserPalette.setState({ error: String(error) });
}
export function synchronizePaletteDraft(): Promise<void> {
  if (synchronizing) return synchronizing;
  const token = draft?.target.token;
  synchronizing = (async () => {
    if (isTauri() && token) {
      await initializePaletteBridge(); const request = crypto.randomUUID();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { if (snapshot?.request === request) snapshot = null; reject(new Error('色板未响应，请保留文案后重试。')); }, 5000);
        snapshot = { request, token, resolve, timer };
        void emitTo('object-palette', 'object-palette-snapshot', request).catch(error => { clearTimeout(timer); if (snapshot?.request === request) snapshot = null; reject(error); });
      });
    }
    if (draft?.target.token === token) commitPaletteDraft();
  })().catch(async error => { await revealDraftError(error); throw error; }).finally(() => { synchronizing = null; });
  return synchronizing;
}
export function commitPaletteDraft() {
  if (!draft || draft.value === draft.target.raw) return;
  const next = applyPaletteDraft(draft); draft = { target: next, value: next.raw };
  if (isTauri()) void emitTo('object-palette', 'object-palette-applied', next);
  else useBrowserPalette.setState({ target: next });
}
export function initializePaletteBridge() {
  if (!isTauri()) return Promise.resolve();
  return initialize ??= (async () => {
    await listen<PaletteDraft>('object-palette-draft', event => { if (event.payload.target.book === useObjectTable.getState().bookId && event.payload.target.token === draft?.target.token) draft = event.payload; });
    const forget = (token: string) => { if (draft?.target.token === token) draft = null; };
    await listen<string>('object-palette-discard', event => forget(event.payload));
    await listen<string>('object-palette-closed', event => forget(event.payload));
    await listen<string>('object-palette-geometry-error', event => { void import('../../app/uiStore').then(({ useUi }) => useUi.getState().notify(`色板位置保存失败：${event.payload}`, 'error')); });
    await listen<{ request: string; draft: PaletteDraft | null }>('object-palette-snapshot-result', event => {
      if (snapshot?.request !== event.payload.request) return;
      if (draft?.target.token === snapshot.token && event.payload.draft?.target.token === snapshot.token && event.payload.draft.target.book === useObjectTable.getState().bookId) draft = event.payload.draft;
      const waiting = snapshot; snapshot = null; clearTimeout(waiting.timer); waiting.resolve();
    });
    await listen<{ request: string; draft: PaletteDraft }>('object-palette-apply', async event => {
      const { request, draft: value } = event.payload;
      try {
        if (value.target.token !== draft?.target.token) throw new Error('色板目标已切换，请重新打开需要编辑的单元格。');
        const next = applyPaletteDraft(value); draft = { target: next, value: next.raw };
        await emitTo('object-palette', 'object-palette-result', { request, target: next });
      } catch (error) { await emitTo('object-palette', 'object-palette-result', { request, error: String(error) }); }
    });
  })().catch(error => { initialize = null; throw error; });
}
export async function openPalette(category: CategoryId, row: number, col: number) {
  const intent = paletteTarget(category, row, col);
  const next = opening.then(async () => {
    await synchronizePaletteDraft();
    const state = useObjectTable.getState(), sheet = state.sheets[category];
    if (state.bookId !== intent.book) throw new Error('工作簿已切换，请重新选择单元格。');
    const currentRow = intent.rowId ? sheet.rows.findIndex(r => r.id === intent.rowId) : row;
    const currentCol = sheet.columns.findIndex(c => c.key === intent.key);
    if (currentRow < 0 || currentCol < 0) throw new Error('目标行或字段已删除，请重新选择单元格。');
    const target = paletteTarget(category, currentRow, currentCol); draft = { target, value: target.raw };
    if (isTauri()) { try { await preparePalette(); await invoke('object_palette_open', { target }); } catch (error) { draft = null; throw error; } }
    else useBrowserPalette.setState({ target, error: '' });
  });
  opening = next.catch(() => {});
  return next;
}
useObjectTable.subscribe((next, previous) => { if (next.bookId !== previous.bookId) { discardPaletteDraft(); if (isTauri()) void invoke('object_palette_hide').catch(() => {}); } });
