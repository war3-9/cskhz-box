export interface CropRect { x: number; y: number; width: number; height: number }
export function clampCrop(rect: CropRect, width: number, height: number, ratio = 0): CropRect {
  const x = Math.round(Math.max(0, Math.min(width - 1, Number.isFinite(rect.x) ? rect.x : 0)));
  const y = Math.round(Math.max(0, Math.min(height - 1, Number.isFinite(rect.y) ? rect.y : 0)));
  let w = Math.max(1, Math.min(width - x, Number.isFinite(rect.width) ? rect.width : 1));
  let h = Math.max(1, Math.min(height - y, Number.isFinite(rect.height) ? rect.height : 1));
  if (ratio > 0) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
  return { x, y, width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}
export function resizeCrop(start: CropRect, handle: string, dx: number, dy: number, width: number, height: number, ratio = 0): CropRect {
  if (handle === 'move') return { ...start, x: Math.round(Math.max(0, Math.min(width - start.width, start.x + dx))), y: Math.round(Math.max(0, Math.min(height - start.height, start.y + dy))) };
  const right = start.x + start.width, bottom = start.y + start.height;
  let x = handle.includes('w') ? Math.max(0, Math.min(right - 1, start.x + dx)) : start.x;
  let y = handle.includes('n') ? Math.max(0, Math.min(bottom - 1, start.y + dy)) : start.y;
  let w = handle.includes('w') ? right - x : handle.includes('e') ? Math.max(1, Math.min(width - x, start.width + dx)) : start.width;
  let h = handle.includes('n') ? bottom - y : handle.includes('s') ? Math.max(1, Math.min(height - y, start.height + dy)) : start.height;
  if (ratio > 0) {
    if (handle === 'n' || handle === 's') w = h * ratio; else h = w / ratio;
    const scale = Math.min(1, (handle.includes('w') ? right : width - x) / w, (handle.includes('n') ? bottom : height - y) / h);
    w *= scale; h *= scale;
    if (handle.includes('w')) x = right - w;
    if (handle.includes('n')) y = bottom - h;
  }
  return clampCrop({ x, y, width: w, height: h }, width, height);
}
