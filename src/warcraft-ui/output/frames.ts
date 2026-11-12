import type { UiNode } from '../document/model';
import { parentFirst } from '../document/relations';
import { withFrameVariables } from '../document/frameVariables';
import { frameType, textAlignment } from './geometry';
import { gridCells, gridCount, frameRangeEnd, hasGridTexture } from '../document/grid';

type OutputFrame = { node: UiNode; type: string; template: string; alignment: number; sourceId: string; cell: number; role: string };

// Buttons have no built-in skin. Optional texture/text children leave the clickable handle at ui[N].
// Auxiliary handles share the same array, above every document node's stable index.
export function outputFrames(nodes: UiNode[]): OutputFrame[] {
  const ordered = parentFirst(withFrameVariables(nodes));
  let index = Math.max(0, ...ordered.map(frameRangeEnd));
  const expanded = ordered.flatMap(gridCells);
  const ids = new Set(expanded.map(node => node.id));
  if (ids.size !== expanded.length) throw new Error('多行多列控件 ID 冲突');
  const childId = (id: string, role: string) => {
    let result = `${id}:${role}`;
    while (ids.has(result)) result += ':';
    ids.add(result); return result;
  };
  return ordered.flatMap(source => {
    const count = gridCount(source);
    const textured = hasGridTexture(source);
    const slots = source.kind === 'button' ? Number(textured) + Number(!!source.text) : 0;
    if (index + slots * count > 8191) throw new Error('按钮文字或素材所需的 Frame 数组下标不足');
    const material = index + 1, label = index + (textured ? count : 0) + 1;
    index += slots * count;
    return gridCells(source).flatMap((node, cell): OutputFrame[] => {
    const meta = { sourceId: source.id, cell };
    if (node.kind !== 'button') return [{ ...meta, role: 'main', node, type: frameType(node), template: '', alignment: textAlignment(node) }];
    const child = { ...node, name: '', autoName: undefined, tVariable: undefined, parentId: node.id,
      selfAnchor: 'TOPLEFT' as const, targetAnchor: 'TOPLEFT' as const, opacity: 1, visible: true };
    const frames: OutputFrame[] = [
      { ...meta, role: 'main', node: { ...node, kind: 'panel' as const, texture: undefined, imageData: undefined }, type: 'GLUEBUTTON', template: '', alignment: 18 },
    ];
    if (textured) {
      const backdrop: UiNode = { ...child, id: childId(node.id, 'material'), kind: 'background', frameIndex: material + cell,
        name: `bg${material + cell}`, text: undefined, visible: !!node.texture };
      frames.push({ ...meta, role: 'material', node: backdrop, type: 'BACKDROP', template: '', alignment: 9 });
    }
    if (node.text) {
      const text: UiNode = { ...child, id: childId(node.id, 'label'), kind: 'text', frameIndex: label + cell,
        name: `tx${label + cell}`, texture: undefined, imageData: undefined };
      frames.push({ ...meta, role: 'label', node: text, type: 'TEXT', template: '', alignment: 18 });
    }
    return frames;
    });
  });
}
