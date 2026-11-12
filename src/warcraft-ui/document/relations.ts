import type { UiNode } from './model';

export function parentFirst(nodes: UiNode[]): UiNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error('控件 ID 重复');
  const ordered: UiNode[] = [], visiting = new Set<string>(), visited = new Set<string>();
  const visit = (node: UiNode) => {
    if (visited.has(node.id)) return;
    if (visiting.has(node.id)) throw new Error('父级控件不能形成循环');
    visiting.add(node.id);
    if (node.parentId !== undefined) {
      const parent = byId.get(node.parentId);
      if (!parent) throw new Error('父级控件不存在');
      visit(parent);
    }
    visiting.delete(node.id); visited.add(node.id); ordered.push(node);
  };
  nodes.forEach(visit);
  return ordered;
}

export function descendants(nodes: UiNode[], id: string): Set<string> {
  const found = new Set<string>();
  for (const node of parentFirst(nodes)) if (node.parentId === id || (node.parentId && found.has(node.parentId))) found.add(node.id);
  return found;
}

export function effectiveVisible(node: UiNode, nodes: UiNode[]): boolean {
  const byId = new Map(nodes.map(item => [item.id, item]));
  const seen = new Set<string>();
  let current: UiNode | undefined = node;
  while (current) {
    if (current.visible === false || seen.has(current.id)) return false;
    seen.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return true;
}
