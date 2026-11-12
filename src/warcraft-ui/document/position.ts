import { stageSize, type AnchorPoint, type UiNode } from './model';
import { parentFirst } from './relations';

const ratios: Record<AnchorPoint, [number, number]> = {
  TOPLEFT: [0, 0], TOP: [.5, 0], TOPRIGHT: [1, 0], LEFT: [0, .5], CENTER: [.5, .5], RIGHT: [1, .5],
  BOTTOMLEFT: [0, 1], BOTTOM: [.5, 1], BOTTOMRIGHT: [1, 1],
};
const root = { x: 0, y: 0, ...stageSize };
export function anchorOffset(node: UiNode, parent?: UiNode) {
  const target = parent ?? root;
  const selfRatio = ratios[node.selfAnchor ?? 'TOPLEFT'], targetRatio = ratios[node.targetAnchor ?? 'TOPLEFT'];
  return { x: node.x + node.width * selfRatio[0] - target.x - target.width * targetRatio[0],
    y: node.y + node.height * selfRatio[1] - target.y - target.height * targetRatio[1] };
}
export function atOffset(node: UiNode, offset: { x: number; y: number }, parent?: UiNode): UiNode {
  const target = parent ?? root;
  const selfRatio = ratios[node.selfAnchor ?? 'TOPLEFT'], targetRatio = ratios[node.targetAnchor ?? 'TOPLEFT'];
  return { ...node, x: target.x + target.width * targetRatio[0] + offset.x - node.width * selfRatio[0],
    y: target.y + target.height * targetRatio[1] + offset.y - node.height * selfRatio[1] };
}

// x/y remain absolute top-left pixels. Changing an anchor aligns the new points;
// dragging and resizing then preserve the resulting offset. Tree drops keep x/y.
export function editPosition(nodes: UiNode[], id: string, patch: Partial<UiNode>): UiNode[] {
  const before = new Map(nodes.map(node => [node.id, node]));
  const original = before.get(id)!;
  const anchorsChanged = (['selfAnchor', 'targetAnchor'] as const).some(key =>
    Object.hasOwn(patch, key) && (patch[key] ?? 'TOPLEFT') !== (original[key] ?? 'TOPLEFT'));
  const offset = anchorsChanged ? { x: 0, y: 0 } : anchorOffset(original, before.get(original.parentId ?? ''));
  const changed = { ...original, ...patch };
  const positioning = ['parentId', 'selfAnchor', 'targetAnchor', 'width', 'height'].some(key => Object.hasOwn(patch, key));
  const after = new Map<string, UiNode>();
  for (const node of parentFirst(nodes)) {
    let next = node.id === id ? changed : node;
    if (node.id === id && positioning) next = atOffset(next, offset, before.get(next.parentId ?? ''));
    if (node.id === id) next = { ...next, x: patch.x ?? next.x, y: patch.y ?? next.y };
    else if (node.parentId && after.get(node.parentId) !== before.get(node.parentId)) {
      next = atOffset(node, anchorOffset(node, before.get(node.parentId)), after.get(node.parentId));
    }
    after.set(node.id, next);
  }
  return nodes.map(node => after.get(node.id)!);
}
