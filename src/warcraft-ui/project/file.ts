import { type UiNode } from '../document/model';
import { withFrameVariables } from '../document/frameVariables';
import { validateNodes } from '../document/validation';
import { defaultArrayName, validateArrayName } from '../document/arrayName';

export function serializeLayout(nodes: UiNode[], arrayName = defaultArrayName, background: string | null = null): string {
  validateNodes(nodes);
  return JSON.stringify({ format: 'war3-ui-lab', version: 2, arrayName: validateArrayName(arrayName), nodes: withFrameVariables(nodes), ...(background ? { referenceBackground: background } : {}) }, null, 2);
}

export function parseDocument(text: string) {
  const data = JSON.parse(text) as { arrayName?: unknown; referenceBackground?: unknown } | null;
  const value = data && Object.hasOwn(data, 'arrayName') ? data.arrayName : defaultArrayName;
  if (typeof value !== 'string') throw new Error('数组变量名格式无效');
  const background = data?.referenceBackground ?? null;
  if (background !== null && (typeof background !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(background))) throw new Error('参考背景格式无效');
  return { nodes: parseLayout(text), arrayName: validateArrayName(value), background };
}

export function parseLayout(text: string): UiNode[] {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('format' in data) || data.format !== 'war3-ui-lab' ||
      !('version' in data) || (data.version !== 1 && data.version !== 2) || !('nodes' in data) || !Array.isArray(data.nodes)) {
    throw new Error('工程格式不兼容');
  }
  const ids = new Set<string>();
  for (const node of data.nodes) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !node.id || ids.has(node.id) ||
        !['text', 'backdrop', 'panel', 'background', 'button'].includes(node.kind as string) || typeof node.name !== 'string' ||
        typeof node.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(node.color)) throw new Error('元素格式无效');
    for (const key of ['x', 'y', 'width', 'height']) {
      if (typeof node[key] !== 'number' || !Number.isFinite(node[key])) throw new Error('元素坐标无效');
    }
    if (node.width <= 0 || node.height <= 0) throw new Error('元素尺寸无效');
    for (const key of ['text', 'texture', 'imageData', 'tVariable', 'autoName', 'parentId', 'selfAnchor', 'targetAnchor', 'fill', 'textColor', 'fontPath']) {
      if (node[key] !== undefined && typeof node[key] !== 'string') throw new Error('元素属性无效');
    }
    if (node.opacity !== undefined && (typeof node.opacity !== 'number' || !Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1)) throw new Error('透明度无效');
    if (node.fontSize !== undefined && (typeof node.fontSize !== 'number' || !Number.isFinite(node.fontSize) || node.fontSize <= 0)) throw new Error('字体大小无效');
    if (node.imageData && !/^data:image\/(png|jpeg|webp);base64,/.test(node.imageData)) throw new Error('素材格式无效');
    ids.add(node.id);
  }
  const idsAfter = new Set(data.nodes.map((node) => (node as { id: string }).id));
  for (const node of data.nodes as Array<{ id: string; parentId?: string; selfAnchor?: string; targetAnchor?: string }>) {
    if (node.parentId !== undefined && (!idsAfter.has(node.parentId) || node.parentId === node.id)) throw new Error('父级控件无效');
    for (const anchor of [node.selfAnchor, node.targetAnchor]) if (anchor !== undefined && !/^(TOPLEFT|TOP|TOPRIGHT|LEFT|CENTER|RIGHT|BOTTOMLEFT|BOTTOM|BOTTOMRIGHT)$/.test(anchor)) throw new Error('锚点无效');
  }
  const graph = new Map<string, string | undefined>((data.nodes as Array<{ id: string; parentId?: string }>).map(node => [node.id, node.parentId]));
  for (const node of data.nodes as Array<{ id: string }>) {
    const seen = new Set<string>(); let current: string | undefined = node.id;
    while (current) { if (seen.has(current)) throw new Error('父级控件不能形成循环'); seen.add(current); current = graph.get(current); }
  }
  validateNodes(data.nodes as UiNode[]);
  const nodes = withFrameVariables(data.nodes as UiNode[], data.version === 1);
  // V1 used 640x480. Preserve normalized game coordinates and stable variables.
  return data.version === 1 ? nodes.map(node => ({ ...node,
    x: node.x * 3, y: node.y * 2.25, width: node.width * 3, height: node.height * 2.25,
  })) : nodes;
}
