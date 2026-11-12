import type { UiNode } from './model';

export const gridCount = (node: UiNode) => node.grid ? node.grid.rows * node.grid.columns : 1;
export const frameRangeEnd = (node: UiNode) => (node.frameIndex ?? 0) + gridCount(node) - 1;
export const gridMaterialKey = (cell: number, columns: number) => `${Math.floor(cell / columns)}:${cell % columns}`;
export const hasGridTexture = (node: UiNode) => !!node.texture || Object.values(node.grid?.materials ?? {}).some(material => !!material.texture);

export function validateGrid(node: UiNode) {
  if (node.grid === undefined) return;
  const grid = node.grid;
  if (!grid || !['text', 'button'].includes(node.kind) ||
    !Number.isInteger(grid.rows) || !Number.isInteger(grid.columns) || grid.rows < 1 || grid.columns < 1 ||
    grid.rows * grid.columns > 512 || !Number.isFinite(grid.gapX) || !Number.isFinite(grid.gapY) ||
    grid.gapX < 0 || grid.gapY < 0) throw new Error('多行多列只支持文字或按钮，数量为 1–512，间距不能为负数');
  if (grid.materials !== undefined) {
    if (node.kind !== 'button' || !grid.materials || typeof grid.materials !== 'object' || Array.isArray(grid.materials)) throw new Error('单格素材格式无效');
    for (const [key, material] of Object.entries(grid.materials)) {
      const coordinates = /^(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(key);
      if (!coordinates || Number(coordinates[1]) >= grid.rows || Number(coordinates[2]) >= grid.columns ||
        !material || typeof material.texture !== 'string' || material.texture.includes('\0') ||
        (material.imageData !== undefined && (typeof material.imageData !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(material.imageData)))) throw new Error('单格素材格式无效');
    }
  }
}

/** The first cell keeps the document ID so ordinary child anchors still target it. */
export function gridCells(node: UiNode): UiNode[] {
  validateGrid(node);
  const columns = node.grid?.columns ?? 1;
  return Array.from({ length: gridCount(node) }, (_, cell) => ({ ...node, grid: undefined,
    ...(node.grid?.materials?.[gridMaterialKey(cell, columns)] ? {
      texture: node.grid.materials[gridMaterialKey(cell, columns)].texture,
      imageData: node.grid.materials[gridMaterialKey(cell, columns)].imageData,
    } : {}),
    id: cell ? `${node.id}:grid:${cell}` : node.id,
    frameIndex: (node.frameIndex ?? 1) + cell,
    x: node.x + (cell % columns) * (node.width + (node.grid?.gapX ?? 0)),
    y: node.y + Math.floor(cell / columns) * (node.height + (node.grid?.gapY ?? 0)),
  }));
}
