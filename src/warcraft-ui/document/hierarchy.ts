import type { UiNode } from './model';
import { descendants } from './relations';

export type DropPosition = 'before' | 'inside' | 'after';
export function moveInTree(nodes: UiNode[], id: string, targetId: string | null, position: DropPosition): UiNode[] {
  const node = nodes.find(item => item.id === id), target = nodes.find(item => item.id === targetId);
  const children = descendants(nodes, id);
  if (!node || node.locked || id === targetId || (targetId && (!target || children.has(targetId)))) return nodes;
  const parentId = target ? (position === 'inside' ? target.id : target.parentId) : undefined;
  if (parentId === id || (parentId && children.has(parentId))) return nodes;
  const branch = nodes.filter(item => item.id === id || children.has(item.id));
  const rest = nodes.filter(item => item.id !== id && !children.has(item.id));
  let index = rest.length;
  if (target) {
    const targetBranch = descendants(rest, target.id);
    index = position === 'after' ? rest.findIndex(item => item.id === target.id) :
      Math.max(...rest.map((item, i) => item.id === target.id || targetBranch.has(item.id) ? i : -1)) + 1;
  }
  rest.splice(index, 0, ...branch.map(item => item.id === id ? { ...item, parentId } : item));
  return JSON.stringify(rest) === JSON.stringify(nodes) ? nodes : rest;
}
