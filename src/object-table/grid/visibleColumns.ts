export interface ColumnSlot { col: number | null; width: number }

/** Keep frozen columns and the viewport, replacing omitted columns with exact-width gaps. */
export function visibleColumns(offsets: number[], frozen: number, left: number, width: number, editing?: number): ColumnSlot[] {
  const count = offsets.length - 1, keep = new Set<number>();
  const start = left + offsets[frozen] - 200, end = left + width + 200;
  for (let col = 0; col < count; col++) {
    if (col < frozen || (offsets[col + 1] > start && offsets[col] < end)) keep.add(col);
  }
  if (editing !== undefined && editing >= 0 && editing < count) keep.add(editing);
  const slots: ColumnSlot[] = [];
  let gap = 0;
  for (let col = 0; col < count; col++) {
    const size = offsets[col + 1] - offsets[col];
    if (!keep.has(col)) { gap += size; continue; }
    if (gap) { slots.push({ col: null, width: gap }); gap = 0; }
    slots.push({ col, width: size });
  }
  if (gap) slots.push({ col: null, width: gap });
  return slots;
}
