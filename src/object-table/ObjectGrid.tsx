import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useShallow } from 'zustand/react/shallow';
import type { ObjectCategory } from './schema';
import { MAX_ROWS, columnNumber } from './model';
import { useObjectTable } from './store';
import { createCalculator } from './formulas/engine';
import { GridEditor, type Editing } from './grid/Editor';
import { clearSelection, useGridClipboard } from './grid/useClipboard';
import { HorizontalScrollbar } from './grid/Scrollbar';
import { useColumnResize } from './grid/useColumnResize';
import { visibleColumns } from './grid/visibleColumns';
import { GridContextMenu, type MenuAction } from './grid/ContextMenu';
import { HeaderMenu } from './grid/HeaderMenu';
import { HeaderField } from './grid/HeaderField';
import { openPalette } from './palette/bridge';
import { colorFields } from './dialogs/colorCodes';
import { ColoredText, coloredTitle } from './grid/ColoredText';
import { createRowLayout } from './grid/rowLayout';
import { useObjectPreferences } from './settings/store';
import { BatchDialog } from './dialogs/BatchDialog';
import { TemplateDialog } from './templates/TemplateDialog';
import { fillMatrix } from './fill/series';
import { FillRuleDialog } from './fill/FillRuleDialog';
import { ResourceImportDialog } from './resources/ResourceImportDialog';
import { useFillHandle } from './fill/useFillHandle';
import { bounds, closestFreeze, columnOffsets, effectiveFrozen, HEADER_HEIGHT, ROW_GUTTER, type Cell, type CellSelection } from './grid/geometry';
import { fieldPresentation } from './native/fieldLabels';
import { selectedCell } from './grid/selection';
import { fillUnitContext } from './fill/units';
export type { CellSelection } from './grid/geometry';
interface Props { category: ObjectCategory; localOnly?: boolean; selection: CellSelection; onSelect: (s: CellSelection) => void; locate: Cell | null; report: (message: string, kind?: 'success' | 'error') => void }
export function ObjectGrid({ category, localOnly = false, selection, onSelect, locate, report }: Props) {
  const state = useObjectTable(useShallow(s => ({ sheets: s.sheets, setView: s.setView, resizeColumn: s.resizeColumn, write: s.write, clear: s.clear, undo: s.undo, redo: s.redo, insertRows: s.insertRows, removeRows: s.removeRows })));
  const source = state.sheets[category.id];
  const fillUnits = fillUnitContext(source.units);
  const selectedParent = source.rows[selection.end.row]?.cells[source.columns[1]?.key] ?? '';
  const headerTitle = (column: typeof source.columns[number]) => !localOnly && selectedParent ? fieldPresentation(category.id, selectedParent, column).title : column.title;
  const showWar3Colors = useObjectPreferences(s => s.showWar3Colors);
  const view = useObjectTable(s => s.views[category.id]);
  const hidden = useMemo(() => new Set(view.hiddenColumns ?? []), [view.hiddenColumns]);
  useEffect(() => {
    const area = bounds(selection);
    if (area.c1 === 0 && area.c2 === source.columns.length - 1) return; // Whole-record selection includes hidden fields.
    const visible = (cell: Cell) => {
      if (!hidden.has(source.columns[cell.col]?.key)) return cell;
      let col = source.columns.findIndex((c, i) => i >= cell.col && !hidden.has(c.key));
      if (col < 0) col = source.columns.findIndex(c => !hidden.has(c.key));
      return { ...cell, col: Math.max(0, col) };
    };
    const start = visible(selection.start), end = visible(selection.end);
    if (start !== selection.start || end !== selection.end) onSelect({ ...selection, start, end });
  }, [hidden, source.columns, selection, onSelect]);
  const resize = useColumnResize(source.columns, (key, width) => state.resizeColumn(category.id, key, width));
  const sheet = { ...source, columns: useMemo(() => resize.columns.map(c => hidden.has(c.key) ? { ...c, width: 0 } : c), [resize.columns, hidden]) };
  const root = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800), [drag, setDrag] = useState<number | null>(null), [edit, setEdit] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null), [dialog, setDialog] = useState<'batch' | 'template' | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; col: number } | null>(null);
  const changeHidden = (key: string, hide: boolean) => {
    if (edit && finish(true)) return;
    const next = new Set(hidden); if (hide) next.add(key); else next.delete(key);
    if (next.size >= source.columns.length) return;
    state.setView(category.id, { hiddenColumns: [...next], left: 0 });
  };
  const clearVisible = () => { try { clearSelection(category.id, selection); } catch (error) { report(String(error)); } };
  const [fillColumn, setFillColumn] = useState<number | null>(null);
  const [resourceDialog, setResourceDialog] = useState<'icon' | 'model' | null>(null);
  const closeResourceDialog = useCallback(() => setResourceDialog(null), []);
  const applyFill = (seed: CellSelection, endRow: number) => {
    try {
      const area = bounds(seed), current = useObjectTable.getState().sheets[category.id];
      const matrix = fillMatrix(current, seed, endRow, hidden, !localOnly);
      state.write(category.id, area.r2 + 1, area.c1, matrix);
      onSelect({ start: { row: area.r1, col: area.c1 }, end: { row: endRow, col: area.c2 } });
    } catch (error) { report(String(error)); }
  };
  const calculator = useMemo(() => createCalculator(state.sheets), [state.sheets]); calculator.resetBudget();
  const rowLayout = useMemo(() => createRowLayout(source, hidden, showWar3Colors, (row, col) => calculator.read(category.id, row, col)), [source.rows, source.columns, hidden, showWar3Colors, calculator, category.id]);
  const fill = useFillHandle(root, scroll, selection, applyFill, rowLayout.rowAt);
  const dragSelection = useRef<CellSelection | null>(null);
  const selecting = useRef(false), savedView = useRef(useObjectTable.getState().views[category.id]), offsets = useMemo(() => columnOffsets(sheet.columns), [sheet.columns]);
  const frozen = effectiveFrozen(view.frozen, offsets, width), totalWidth = Math.max(width, offsets.at(-1)!);
  const count = Math.min(MAX_ROWS, Math.max(40, sheet.rows.length + 30, selection.end.row + 5, (fill.endRow ?? 0) + 30));
  const virtual = useVirtualizer({ count, getScrollElement: () => scroll.current, estimateSize: rowLayout.height, overscan: 6, paddingStart: HEADER_HEIGHT,
    rangeExtractor: range => { const rows = defaultRangeExtractor(range); return edit && !rows.includes(edit.row) ? [...rows, edit.row].sort((a, b) => a - b) : rows; } });
  useLayoutEffect(() => { virtual.measure(); }, [virtual, rowLayout]);
  const slots = useMemo(() => visibleColumns(offsets, frozen, view.left, width, edit?.col), [offsets, frozen, view.left, width, edit?.col]);
  const gap = (size: number, index: number) => <div key={`gap:${index}`} aria-hidden="true" style={{ width: size, flex: 'none' }} />;
  const b = bounds(selection), clipboard = useGridClipboard(category.id, selection, calculator, report);
  useLayoutEffect(() => { const observer = new ResizeObserver(() => setWidth(scroll.current?.clientWidth ?? 800)); if (scroll.current) observer.observe(scroll.current); return () => observer.disconnect(); }, []);
  useLayoutEffect(() => { if (scroll.current && bar.current) { scroll.current.scrollTop = savedView.current.top; scroll.current.scrollLeft = savedView.current.left; bar.current.scrollLeft = savedView.current.left; } }, []);
  useEffect(() => {
    const cancel = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setDrag(null); selecting.current = false; } };
    const up = () => { selecting.current = false; };
    window.addEventListener('keydown', cancel); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('keydown', cancel); window.removeEventListener('pointerup', up); };
  }, []);
  const reveal = (cell: Cell) => {
    const el = scroll.current; if (!el) return;
    const y = rowLayout.top(cell.row), height = rowLayout.height(cell.row);
    if (height > el.clientHeight - HEADER_HEIGHT || y < el.scrollTop + HEADER_HEIGHT) el.scrollTop = y - HEADER_HEIGHT;
    else if (y + height > el.scrollTop + el.clientHeight) el.scrollTop = y + height - el.clientHeight;
    if (cell.col >= frozen) {
      if (offsets[cell.col] < el.scrollLeft + offsets[frozen]) el.scrollLeft = offsets[cell.col] - offsets[frozen];
      if (offsets[cell.col + 1] > el.scrollLeft + el.clientWidth) el.scrollLeft = offsets[cell.col + 1] - el.clientWidth;
    }
    if (bar.current) bar.current.scrollLeft = el.scrollLeft;
  };
  useEffect(() => { if (locate) { const key = source.columns[locate.col]?.key; if (hidden.has(key)) state.setView(category.id, { hiddenColumns: [...hidden].filter(c => c !== key) }); onSelect({ start: locate, end: locate }); requestAnimationFrame(() => reveal(locate)); if (!(document.activeElement as HTMLElement)?.closest('.ot-find-dialog')) root.current?.focus(); } }, [locate]);
  const move = (row: number, col: number, extend = false) => {
    const direction = col < selection.end.col ? -1 : 1;
    col = Math.max(0, Math.min(sheet.columns.length - 1, col));
    while (hidden.has(sheet.columns[col].key) && col + direction >= 0 && col + direction < sheet.columns.length) col += direction;
    if (hidden.has(sheet.columns[col].key)) col = sheet.columns.findIndex(c => !hidden.has(c.key));
    const cell = { row: Math.max(0, Math.min(MAX_ROWS - 1, row)), col };
    onSelect({ start: extend ? selection.start : cell, end: cell }); reveal(cell);
  };
  const startEdit = (value?: string, multiline = false, cell = selection.end) => {
    const { row, col } = cell, raw = sheet.rows[row]?.cells[sheet.columns[col].key] ?? '';
    if (!localOnly && (multiline || (value === undefined && (raw.includes('\n') || raw.length > 120)))) { void openPalette(category.id, row, col).catch(error => report(String(error))); return; }
    if (localOnly && multiline) { setEdit({ row, col, value: raw, multiline: true }); return; }
    setEdit({ row, col, value: value ?? raw, multiline: false });
  };
  const finish = (save: boolean, direction = 0) => {
    if (!edit) return;
    try { if (save) state.write(category.id, edit.row, edit.col, [[edit.value]]); } catch (error) { report(String(error)); return String(error); }
    setEdit(null); requestAnimationFrame(() => { root.current?.focus(); if (direction) move(edit.row + (direction === 1 ? 1 : 0), edit.col + (Math.abs(direction) === 2 ? direction / 2 : 0)); });
  };
  useEffect(() => {
    const commit = (event: Event) => { if (!edit?.multiline) { const error = finish(true); if (error && event instanceof CustomEvent && event.detail) event.detail.error = error; } };
    window.addEventListener('object-table-commit', commit);
    window.addEventListener('blur', commit);
    return () => { window.removeEventListener('object-table-commit', commit); window.removeEventListener('blur', commit); };
  }, [edit]);
  useEffect(() => {
    const el = scroll.current;
    const wheel = (e: WheelEvent) => { if ((e.shiftKey || e.deltaX) && bar.current) { e.preventDefault(); bar.current.scrollLeft += e.deltaX || e.deltaY; } };
    el?.addEventListener('wheel', wheel, { passive: false }); return () => el?.removeEventListener('wheel', wheel);
  }, []);
  const keydown = (e: KeyboardEvent) => {
    if (edit || dialog || menu || headerMenu || fillColumn !== null || fill.endRow !== null || e.nativeEvent.isComposing) return;
    const cell = selection.end, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.altKey && ['c', 'x', 'v'].includes(e.key.toLowerCase()) && !(e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"],.ot-header-field')) {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) void (e.key.toLowerCase() === 'v' ? clipboard.pasteFromClipboard(e.shiftKey) : clipboard.copyToClipboard(e.key.toLowerCase() === 'x'));
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); onSelect({ start: { row: 0, col: 0 }, end: { row: Math.max(0, source.rows.length - 1), col: source.columns.length - 1 } }); return; }
    if (ctrl && ['z', 'y'].includes(e.key.toLowerCase())) { e.preventDefault(); e.key.toLowerCase() === 'y' || e.shiftKey ? state.redo() : state.undo(); return; }
    if (ctrl && e.key.toLowerCase() === 'd') { if (selection.ranges?.length) { e.preventDefault(); report('向下填充请选择一个连续区域'); return; } e.preventDefault(); applyFill({ start: { row: b.r1, col: b.c1 }, end: { row: b.r1, col: b.c2 } }, b.r2); return; }
    const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [e.shiftKey ? -1 : 1, 0], Tab: [0, e.shiftKey ? -1 : 1] };
    if (delta[e.key]) { e.preventDefault(); const [r, c] = delta[e.key]; move(cell.row + r, cell.col + c, e.shiftKey && e.key.startsWith('Arrow')); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearVisible(); }
    else if (e.key === 'F2') { e.preventDefault(); startEdit(undefined, e.shiftKey); }
    else if (!ctrl && !e.altKey && e.key.length === 1) { e.preventDefault(); startEdit(e.key); }
  };
  const sticky = (col: number) => col < frozen ? { position: 'sticky' as const, left: offsets[col], zIndex: 3 } : {};
  const context = (e: React.MouseEvent, cell: Cell) => {
    e.preventDefault(); selecting.current = false;
    if (!selectedCell(selection, cell)) onSelect({ start: cell, end: cell });
    setMenu({ x: e.clientX, y: e.clientY });
  };
  const perform = (action: MenuAction) => {
    setMenu(null);
    try {
      if (selection.ranges?.length && !['clear', 'copy', 'cut'].includes(action)) { report('此操作请选择一个连续区域'); return; }
      if (action === 'copy' || action === 'cut') { root.current?.focus(); void clipboard.copyToClipboard(action === 'cut'); return; }
      if (action === 'paste' || action === 'pasteValues') { root.current?.focus(); void clipboard.pasteFromClipboard(action === 'pasteValues'); return; }
      if (action === 'importIcon' || action === 'importModel') {
        if (b.c1 !== b.c2) { report('请先选择单列中的单元格'); return; }
        if (edit && finish(true)) return;
        setResourceDialog(action === 'importIcon' ? 'icon' : 'model'); return;
      }
      if (action === 'add') state.insertRows(selection.end.row + 1, 1);
      if (action === 'batch') setDialog('batch');
      if (action === 'delete') state.removeRows(b.r1, b.r2);
      if (action === 'clear') clearVisible();
      if (action === 'color') startEdit(undefined, true);
      if (action === 'template') setDialog('template');
      if (action === 'fillRule') setFillColumn(selection.end.col);
      if (action === 'fill') applyFill({ start: { row: b.r1, col: b.c1 }, end: { row: b.r1, col: b.c2 } }, b.r2);
      if (action !== 'batch' && action !== 'template' && action !== 'color') root.current?.focus();
    } catch (error) { report(String(error)); }
  };
  return <div className="ot-grid-wrap" ref={root} tabIndex={0} role="grid" aria-label={`${category.title}表格`} aria-rowcount={count + 2} aria-colcount={sheet.columns.length} onKeyDown={keydown} {...clipboard.events}>
    <div className="ot-grid-scroll" ref={scroll} onScroll={e => { const el = e.currentTarget; if (bar.current) bar.current.scrollLeft = el.scrollLeft; state.setView(category.id, { top: el.scrollTop, left: el.scrollLeft }); }}>
      <div className="ot-grid" style={{ width: totalWidth, height: virtual.getTotalSize() }}>
        <div className="ot-grid-header" role="row"><div className="ot-row-number ot-corner" style={{ width: ROW_GUTTER }}>#</div>{slots.map(({ col, width: size }, index) => {
          if (col === null) return gap(size, index);
          if (hidden.has(sheet.columns[col].key)) return null;
          const c = sheet.columns[col];
          return <div key={c.key} role="columnheader" onContextMenu={e => { e.preventDefault(); setHeaderMenu({ x: e.clientX, y: e.clientY, col }); }} aria-colindex={col + 1} className={`ot-header-cell ${col < frozen ? 'ot-frozen' : ''}`} style={{ width: c.width, ...sticky(col) }}><span>{c.letter}</span><strong>{headerTitle(c) || '未命名'}</strong><HeaderField field={c.field} report={report} /><button type="button" className={`ot-column-fill ${c.fill && c.fill.operation !== 'auto' ? 'has-rule' : ''}`} aria-label={`设置${c.letter}列填充算法`} title="设置本列填充算法" onKeyDown={e => e.stopPropagation()} onClick={() => { if (!edit || !finish(true)) setFillColumn(col); }}>ƒx</button><div className="ot-column-resizer" role="separator" aria-label={`调整${c.letter}列宽`} aria-orientation="vertical" aria-valuenow={c.width} tabIndex={0} {...resize.handle(c)} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); state.resizeColumn(category.id, c.key, c.width + (e.key === 'ArrowRight' ? 16 : -16)); } }} /></div>;
        })}</div>
        {virtual.getVirtualItems().map(item => <div className="ot-grid-row" role="row" key={item.key} style={{ top: item.start, height: item.size, width: totalWidth }}>
          <div className="ot-row-number" role="rowheader" style={{ width: ROW_GUTTER }} onContextMenu={e => context(e, { row: item.index, col: 0 })} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); const range = { start: { row: e.shiftKey ? selection.start.row : item.index, col: 0 }, end: { row: item.index, col: sheet.columns.length - 1 } }; onSelect(range); root.current?.focus(); }}>{item.index + 3}</div>
          {slots.map(({ col, width: size }, index) => {
            if (col === null) return gap(size, index);
          if (hidden.has(sheet.columns[col].key)) return null;
            const column = sheet.columns[col];
            const result = calculator.read(category.id, item.index + 3, columnNumber(column.letter)), activeEdit = edit?.row === item.index && edit.col === col;
            const selected = selectedCell(selection, { row: item.index, col });
            const preview = fill.endRow !== null && item.index > b.r2 && item.index <= fill.endRow && col >= b.c1 && col <= b.c2;
            return <div role="gridcell" aria-colindex={col + 1} aria-selected={selected} data-row={item.index} data-col={col} key={column.key} className={`ot-cell ${selected ? 'is-selected' : ''} ${preview ? 'is-fill-preview' : ''} ${col < frozen ? 'ot-frozen' : ''} ${result.error ? 'has-error' : ''}`} style={{ width: column.width, textAlign: sheet.rows[item.index]?.alignments?.[column.key] ?? 'left', ...sticky(col) }} title={result.error ?? coloredTitle(result.text, showWar3Colors)}
              onContextMenu={e => context(e, { row: item.index, col })}
              onPointerDown={e => { if (activeEdit || e.button !== 0) return; e.preventDefault(); selecting.current = true; const cell = { row: item.index, col }; const range = { start: e.shiftKey ? selection.start : cell, end: cell }; dragSelection.current = range; onSelect(range); root.current?.focus(); }}
              onPointerEnter={() => { if (selecting.current && dragSelection.current) onSelect({ ...dragSelection.current, end: { row: item.index, col } }); }} onDoubleClick={() => startEdit(undefined, colorFields.has(column.field.toLowerCase()), { row: item.index, col })}>
              {activeEdit && !edit.multiline ? <GridEditor edit={edit} change={value => setEdit({ ...edit, value })} finish={finish} /> : result.error ? <span>{result.text}</span> : <ColoredText text={result.text} showColors={showWar3Colors} />}
              {!edit && !selection.ranges?.length && item.index === b.r2 && col === b.c2 && <button type="button" className="ot-fill-handle" aria-label="向下拖动填充" title="向下拖动：按本列算法填充；Esc 取消" onPointerDown={fill.start} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} />}
            </div>;
          })}</div>)}
      </div>
    </div>
    <div className="ot-freeze-line" role="separator" aria-label="拖动冻结分界线" aria-orientation="vertical" aria-valuenow={frozen} tabIndex={0} style={{ left: offsets[drag ?? frozen] - 3 }} title="拖动吸附到列边界；拖至行号右侧取消冻结；Esc 取消"
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); state.setView(category.id, { frozen: Math.max(0, Math.min(sheet.columns.length, view.frozen + (e.key === 'ArrowLeft' ? -1 : 1))) }); } }}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(frozen); }}
      onPointerMove={e => { if (drag !== null) setDrag(closestFreeze(e.clientX - root.current!.getBoundingClientRect().left, offsets, width)); }}
      onPointerUp={() => { if (drag !== null) state.setView(category.id, { frozen: drag }); setDrag(null); }} onLostPointerCapture={() => setDrag(null)} />
    <div className="ot-bottom-scroll" ref={bar} style={{ width }} aria-label="表格横向滚动条" onScroll={e => { if (scroll.current) scroll.current.scrollLeft = e.currentTarget.scrollLeft; }}><div style={{ width: totalWidth, height: 1 }} /></div>
    <HorizontalScrollbar width={width} total={totalWidth} left={view.left} scroll={value => { if (bar.current) bar.current.scrollLeft = value; }} />
    {headerMenu && <HeaderMenu {...headerMenu} column={source.columns[headerMenu.col]} hidden={source.columns.filter(c => hidden.has(c.key))} canHide={source.columns.length - hidden.size > 1} change={changeHidden} close={() => setHeaderMenu(null)} />}
    {menu && <GridContextMenu {...menu} rows={b.r2 - b.r1 + 1} localOnly={localOnly} close={() => setMenu(null)} action={perform} />}
    {edit?.multiline && <GridEditor edit={edit} change={value => setEdit({ ...edit, value })} finish={finish} />}
    {resourceDialog && <ResourceImportDialog kind={resourceDialog} category={category.id} selection={selection} close={closeResourceDialog} report={report} />}
    {fillColumn !== null && <FillRuleDialog units={fillUnits.units} validateRawcode={!localOnly} column={sheet.columns[fillColumn]} seed={sheet.rows[selection.end.row]?.cells[sheet.columns[fillColumn].key] ?? ''} sourceLabel={`${sheet.columns[fillColumn].letter}${selection.end.row + 3}`} close={() => setFillColumn(null)} save={rule => { try { useObjectTable.getState().setFillRule(category.id, sheet.columns[fillColumn].key, rule); setFillColumn(null); root.current?.focus(); } catch (error) { report(String(error)); } }} />}
    {dialog === 'batch' && <BatchDialog cancel={() => setDialog(null)} add={n => { try { state.insertRows(b.r2 + 1, n); setDialog(null); root.current?.focus(); } catch (error) { report(String(error)); } }} />}
    {dialog === 'template' && !localOnly && <TemplateDialog kind={category.id} current={sheet.rows[selection.end.row]?.cells[sheet.columns[1].key] ?? ''} cancel={() => setDialog(null)} choose={id => { const found = sheet.columns.findIndex(c => c.field.toLowerCase() === '_parent'), col = found < 0 ? 1 : found; state.write(category.id, selection.end.row, col, [[id]]); move(selection.end.row, col); setDialog(null); root.current?.focus(); }} />}
  </div>;
}
