import type { UiNode } from './model';
import { defaultArrayName, validateArrayName } from './arrayName';
import { frameRangeEnd, gridCount, validateGrid } from './grid';

export function frameName(node: UiNode): string {
  return node.name.trim() || node.autoName || `${node.kind === 'backdrop' ? 'panel' : node.kind}_1`;
}
export function frameVariable(node: UiNode, arrayName = defaultArrayName): string {
  const index = node.frameIndex ?? 1;
  if (!Number.isInteger(index) || index < 1 || index > 8191) throw new Error('Frame 数组下标必须为 1–8191');
  return `${validateArrayName(arrayName)}[${index}]`;
}

export function withFrameVariables(nodes: UiNode[], legacy = false, reserved: UiNode[] = []): UiNode[] {
  const ids = new Set<string>();
  const usedIndices = new Set<number>();
  let serial = [...nodes, ...reserved].reduce((max, node) => Math.max(max, frameRangeEnd(node)), 0) + 1;
  return nodes.map((node, index) => {
    if (!node.id || new TextDecoder().decode(new TextEncoder().encode(node.id)) !== node.id) throw new Error('控件 ID 无效');
    if (ids.has(node.id)) throw new Error('控件 ID 重复');
    ids.add(node.id);
    validateGrid(node);
    const frameIndex = node.frameIndex ?? serial;
    if (node.frameIndex === undefined) serial += gridCount(node);
    const autoName = node.autoName ?? `${node.kind === 'backdrop' ? 'panel' : node.kind}_${frameIndex}`;
    if (typeof autoName !== 'string' || !autoName.trim() || autoName.includes('\0')) throw new Error('自动名称无效');
    frameVariable({ ...node, frameIndex });
    for (let slot = frameIndex; slot < frameIndex + gridCount(node); slot++) {
      if (slot > 8191) throw new Error('Frame 数组下标必须为 1–8191');
      if (usedIndices.has(slot)) throw new Error('Frame 数组下标重复');
      usedIndices.add(slot);
    }
    return { ...node, autoName, frameIndex,
      ...(legacy && node.tVariable === undefined ? { tVariable: `War3Lab_${index}` } : {}) };
  });
}

export type VariableRow = { id: string; name: string; variable: string; status: 'unbound' | 'available' | 'missing' };
export function planFrameVariables(nodes: UiNode[], bound: readonly string[] | null, arrayName = defaultArrayName) {
  validateArrayName(arrayName);
  const rows: VariableRow[] = withFrameVariables(nodes).map(node => ({ id: node.id, name: frameName(node),
    variable: frameVariable(node, arrayName), status: bound === null ? 'unbound' : bound.includes(arrayName) ? 'available' : 'missing' }));
  return { rows, missing: rows.some(row => row.status === 'missing') ? [arrayName] : [], retained: [...(bound ?? [])].filter(name => name !== arrayName) };
}
