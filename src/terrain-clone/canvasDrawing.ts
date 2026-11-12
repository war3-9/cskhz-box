import type { TerrainMapInfo, TerrainSelection } from './types';
import { handles, type Transform } from './selectionGeometry';

export function drawMap(ctx: CanvasRenderingContext2D, map: TerrainMapInfo, layer: HTMLCanvasElement, transform: Transform) {
  const { scale, left, top } = transform;
  ctx.imageSmoothingEnabled = false;
  ctx.save(); ctx.translate(left, top + map.height * scale); ctx.scale(1, -1);
  ctx.drawImage(layer, 0, 0, map.width * scale, map.height * scale); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, map.width * scale, map.height * scale); ctx.clip();
  if (scale >= 1.5) {
    ctx.strokeStyle = 'rgba(154,178,212,.22)'; ctx.lineWidth = .5; ctx.beginPath();
    for (let x = 0; x <= map.width; x++) { ctx.moveTo(left + x * scale, top); ctx.lineTo(left + x * scale, top + map.height * scale); }
    for (let y = 0; y <= map.height; y++) { ctx.moveTo(left, top + y * scale); ctx.lineTo(left + map.width * scale, top + y * scale); }
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff'; ctx.beginPath();
  for (const [x, y] of map.doodadPoints ?? []) {
    const px = left + x * scale, py = top + (map.height - 1 - y) * scale;
    ctx.moveTo(px + 1.25, py); ctx.arc(px, py, 1.25, 0, Math.PI * 2);
  }
  ctx.fill(); ctx.restore();
}

export function drawSelection(ctx: CanvasRenderingContext2D, rect: TerrainSelection, transform: Transform, source: boolean) {
  const { left, top, scale } = transform;
  const x = left + rect.x0 * scale, y = top + rect.y0 * scale;
  const width = (rect.x1 - rect.x0 + 1) * scale, height = (rect.y1 - rect.y0 + 1) * scale;
  ctx.fillStyle = source ? 'rgba(42,188,132,.23)' : 'rgba(255,173,55,.26)';
  if (!rect.mask) ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = source ? '#23e3a0' : '#ffbd4a'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
  ctx.font = '12px Segoe UI, Microsoft YaHei, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = source ? '#23e3a0' : '#ffbd4a';
  ctx.fillText(`${rect.x1 - rect.x0 + 1} × ${rect.y1 - rect.y0 + 1}`, x + width / 2, Math.max(13, y - 8));
  if (!rect.mask) for (const [, hx, hy] of handles(rect)) {
    ctx.fillStyle = '#fff'; ctx.fillRect(left + hx * scale - 4, top + hy * scale - 4, 8, 8);
    ctx.strokeRect(left + hx * scale - 4, top + hy * scale - 4, 8, 8);
  }
}
