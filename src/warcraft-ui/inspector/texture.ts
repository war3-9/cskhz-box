import type { UiNode, UiTexture } from '../document/model';
import { gridCount, gridMaterialKey } from '../document/grid';
import { useLayoutStore } from '../state/layout';
import { useUiTasks } from '../tasks/store';

export const supportsTexture = (node: UiNode) => node.kind !== 'text';

export function updateTexture(id: string, material: UiTexture | null, cell?: number) {
  const state = useLayoutStore.getState(), node = state.nodes.find(item => item.id === id);
  if (!node || !supportsTexture(node)) throw new Error('原控件已删除或已改为文字');
  if (cell === undefined) {
    state.setNode(id, { texture: material?.texture || undefined, imageData: material?.imageData });
    return;
  }
  if (node.kind !== 'button' || !node.grid || !Number.isInteger(cell) || cell < 0 || cell >= gridCount(node)) throw new Error('原格子已不存在');
  const materials = { ...node.grid.materials }, key = gridMaterialKey(cell, node.grid.columns);
  if (material) materials[key] = material; else delete materials[key];
  state.setNode(id, { grid: { ...node.grid, materials } });
}

export async function attachTexture(id: string, file: File, cell?: number): Promise<void> {
  const taskId = useUiTasks.getState().activeId;
  const originalGrid = useLayoutStore.getState().nodes.find(node => node.id === id)?.grid;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('暂支持 PNG/JPEG/WebP');
  const imageData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('素材读取失败'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  if (useUiTasks.getState().activeId !== taskId) throw new Error('任务已切换，请在原任务中重新选择素材');
  const state = useLayoutStore.getState(), target = state.nodes.find(node => node.id === id);
  if (!target || !supportsTexture(target)) throw new Error('原控件已删除或已改为文字');
  if (cell !== undefined && (target.grid?.rows !== originalGrid?.rows || target.grid?.columns !== originalGrid?.columns)) throw new Error('格子排列已变化，请重新选择素材');
  updateTexture(id, { imageData, texture: `war3mapImported\\${file.name.replace(/\.[^.]+$/, '.blp')}` }, cell);
}
