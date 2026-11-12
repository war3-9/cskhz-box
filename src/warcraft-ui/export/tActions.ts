import { anchorPreset, frameGeometry, framePosition, hasText, fontHeight, frameFont } from '../output/geometry';
import type { UiNode } from '../document/model';
import { frameName, frameVariable } from '../document/frameVariables';
import { outputFrames } from '../output/frames';
import { validateNodes } from '../document/validation';
import { defaultArrayName, validateArrayName } from '../document/arrayName';
import { gridLoopPlan, type TMode } from './tLoops';

export type TArg = { type: 0 | 1 | 2 | 3; value: string; call?: TEca; index?: TArg };
export type TEca = { type: 0 | 2 | 3; name: string; args?: TArg[]; children?: TEca[] };
const constant = (value: string): TArg => ({ type: 3, value });
const preset = (value: string): TArg => ({ type: 0, value });
const call = (name: string, args: TArg[] = []): TArg => ({ type: 2, value: '', call: { type: 3, name, args } });
const variable = (value: string): TArg => {
  const [, name, index] = /^([A-Za-z][A-Za-z0-9_]*)\[(\d+)\]$/.exec(value)!;
  return { type: 1, value: name, index: constant(index) };
};
function action(name: string, args: TArg[]): TEca { return { type: 2, name, args }; }

function frameActions({ node, type, template, alignment }: ReturnType<typeof outputFrames>[number], variables: Map<string, string>, nodes: Map<string, UiNode>, arrayName: string): TEca[] {
  const frame = frameVariable(node, arrayName); const g = frameGeometry(node);
  const parent = node.parentId ? variables.get(node.parentId) : undefined;
  const parentNode = node.parentId ? nodes.get(node.parentId) : undefined;
  const offset = framePosition(node, parentNode);
  const actions: TEca[] = [action('SetVariable', [variable(frame), call('DzCreateFrameByTagName', [constant(type), constant(frameName(node)), parent ? variable(parent) : call('DzGetGameUI'), constant(template), constant('0')])])];
  if (parent || node.selfAnchor || node.targetAnchor) actions.push(action('DzFrameSetPoint', [variable(frame), preset(anchorPreset(node.selfAnchor)), parent ? variable(parent) : call('DzGetGameUI'), preset(anchorPreset(node.targetAnchor)), constant(offset.x), constant(offset.y)]));
  else actions.push(action('DzFrameSetAbsolutePoint', [variable(frame), preset('FramePoints_TopLeft'), constant(g.x), constant(g.y)]));
  actions.push(action('DzFrameSetSize', [variable(frame), constant(g.width), constant(g.height)]));
  if (hasText(node)) {
    if (!/^#[0-9a-f]{6}$/i.test(node.color)) throw new Error('文字颜色无效');
    const text = `|cff${(node.textColor ?? node.color).slice(1)}${node.text ?? ''}|r`;
    actions.push(action('DzFrameSetText', [variable(frame), constant(text)]), action('DzFrameSetFont', [variable(frame), constant(frameFont(node)), constant(fontHeight(node)), constant('0')]), action('DzFrameSetTextAlignment', [variable(frame), constant(String(alignment))]));
  } else if (node.texture) actions.push(action('DzFrameSetTexture', [variable(frame), constant(node.texture), constant('0')]));
  if (node.opacity !== undefined) actions.push(action('DzFrameSetAlpha', [variable(frame), constant(Math.round(node.opacity * 255).toString())]));
  actions.push(action('DzFrameShow', [variable(frame), constant(node.visible !== false ? 'true' : 'false')]));
  return actions;
}

export function buildTActionPlan(nodes: UiNode[], arrayName = defaultArrayName, mode: TMode = 'individual'): TEca[] {
  validateArrayName(arrayName);
  if (nodes.length > 512) throw new Error('T 导出暂支持最多 512 个元素');
  validateNodes(nodes);
  const ordered = outputFrames(nodes);
  const variables = new Map(ordered.map(({ node }) => [node.id, frameVariable(node, arrayName)]));
  const byId = new Map(ordered.map(({ node }) => [node.id, node]));
  const actions = (frame: typeof ordered[number]) => frameActions(frame, variables, byId, arrayName);
  return mode === 'loop' ? gridLoopPlan(nodes, ordered, actions) : ordered.flatMap(actions);
}
