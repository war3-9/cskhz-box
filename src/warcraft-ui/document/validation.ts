import type { UiNode } from './model';
import { parentFirst } from './relations';
import { gridCount, validateGrid } from './grid';

export function validateNodes(nodes: UiNode[]): void {
  for (const node of nodes) {
    validateGrid(node);
    if (!node.id || typeof node.name !== 'string' || !['text', 'panel', 'button', 'background', 'backdrop'].includes(node.kind)) throw new Error('元素格式无效');
    for (const key of ['x', 'y', 'width', 'height'] as const) if (!Number.isFinite(node[key])) throw new Error('Invalid coordinate');
    if (node.width <= 0 || node.height <= 0) throw new Error('元素尺寸无效');
    for (const color of [node.color, node.fill, node.textColor]) if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('颜色无效');
    for (const key of ['visible', 'locked'] as const) if (node[key] !== undefined && typeof node[key] !== 'boolean') throw new Error('可见性或锁定属性无效');
    if (node.opacity !== undefined && (!Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1)) throw new Error('透明度无效');
    if (node.previewBackgroundOpacity !== undefined && (typeof node.previewBackgroundOpacity !== 'number' || !Number.isFinite(node.previewBackgroundOpacity) || node.previewBackgroundOpacity < 0 || node.previewBackgroundOpacity > 1)) throw new Error('设计背景透明度无效');
    if (node.fontSize !== undefined && (!Number.isFinite(node.fontSize) || node.fontSize <= 0 || node.fontSize > 1080)) throw new Error('字体大小无效');
    for (const anchor of [node.selfAnchor, node.targetAnchor]) if (anchor !== undefined && !/^(TOPLEFT|TOP|TOPRIGHT|LEFT|CENTER|RIGHT|BOTTOMLEFT|BOTTOM|BOTTOMRIGHT)$/.test(anchor)) throw new Error('锚点无效');
  }
  if (nodes.reduce((count, node) => count + gridCount(node), 0) > 512) throw new Error('布局最多支持 512 个控件（含多行多列）');
  parentFirst(nodes);
}
