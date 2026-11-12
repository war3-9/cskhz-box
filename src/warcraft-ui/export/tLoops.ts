import type { UiNode } from '../document/model';
import type { outputFrames } from '../output/frames';
import type { TArg, TEca } from './tActions';
import { gridCount, gridMaterialKey } from '../document/grid';

export type TMode = 'individual' | 'loop';
const constant = (value: string | number): TArg => ({ type: 3, value: String(value) });
const call = (name: string, args: TArg[]): TArg => ({ type: 2, value: '', call: { type: 3, name, args } });
const integer = (a: TArg, op: 'Add' | 'Subtract' | 'Multiply', b: TArg) => call('OperatorInt', [a, { type: 0, value: `Operator${op}` }, b]);
const real = (a: TArg, op: 'Add' | 'Multiply', b: TArg) => call('OperatorReal', [a, { type: 0, value: `Operator${op}` }, b]);
const counter = (name: string) => call('YDWEForLoopLocVarIndex', [constant(name)]);

export function gridLoopPlan(nodes: UiNode[], frames: ReturnType<typeof outputFrames>, actions: (frame: ReturnType<typeof outputFrames>[number]) => TEca[]): TEca[] {
  const sources = new Map(nodes.map(node => [node.id, node]));
  const handled = new Set<string>();
  return frames.flatMap(frame => {
    const source = sources.get(frame.sourceId)!;
    if (!source.grid || gridCount(source) === 1) return actions(frame);
    if (handled.has(source.id)) return [];
    handled.add(source.id);
    const row = `box_row_${source.frameIndex ?? frame.node.frameIndex}`, col = `box_col_${source.frameIndex ?? frame.node.frameIndex}`;
    const r = () => integer(counter(row), 'Subtract', constant(1));
    const c = () => integer(counter(col), 'Subtract', constant(1));
    const linear = () => integer(integer(r(), 'Multiply', constant(source.grid!.columns)), 'Add', c());
    const first = frames.filter(item => item.sourceId === source.id && item.cell === 0);
    const indices = new Set(first.map(item => String(item.node.frameIndex)));
    const index = (base: string) => integer(constant(base), 'Add', linear());
    const rewrite = (arg: TArg): TArg => ({ ...arg,
      ...(arg.call ? { call: { ...arg.call, args: arg.call.args?.map(rewrite) } } : {}),
      ...(arg.type === 1 && arg.index && indices.has(arg.index.value) ? { index: index(arg.index.value) } : {}),
    });
    const coordinate = (base: TArg, axis: 'x' | 'y') => real(base, 'Add', real(call('I2R', [axis === 'x' ? c() : r()]), 'Multiply',
      constant(((axis === 'x' ? source.width + source.grid!.gapX : source.height + source.grid!.gapY) * (axis === 'x' ? 0.8 / 1920 : -0.6 / 1080)).toFixed(9))));
    const body = first.flatMap(item => actions(item.role === 'material' ? { ...item, node: { ...item.node, texture: source.texture, imageData: source.imageData, visible: !!source.texture } } : item).map(action => {
      const args = action.args!.map(rewrite);
      if (item.role === 'main' && ['DzFrameSetPoint', 'DzFrameSetAbsolutePoint'].includes(action.name)) {
        const start = action.name === 'DzFrameSetPoint' ? 4 : 2;
        args[start] = coordinate(args[start], 'x'); args[start + 1] = coordinate(args[start + 1], 'y');
      }
      if (action.name === 'SetVariable' && item.role !== 'main') {
        args[1].call!.args![1] = call('OperatorString', [constant(item.role === 'label' ? 'tx' : 'bg'), call('I2S', [index(String(item.node.frameIndex))])]);
      }
      return { ...action, args };
    }));
    const loop = (name: string, end: number, children: TEca[]): TEca => ({ type: 2, name: 'YDWEForLoopLocVarMultiple',
      args: [constant(name), constant(1), constant(end)], children });
    // Individual material choices override the common texture after all cells exist.
    const overrides: TEca[] = frames.filter(item => item.sourceId === source.id && item.role === 'material').flatMap(item => {
      const material = source.grid!.materials?.[gridMaterialKey(item.cell, source.grid!.columns)];
      if (!material) return [];
      const handle = actions(item)[0].args![0];
      return [{ type: 2, name: 'DzFrameSetTexture', args: [handle, constant(material.texture), constant(0)] },
        { type: 2, name: 'DzFrameShow', args: [handle, constant(String(!!material.texture))] }];
    });
    return [loop(row, source.grid.rows, [loop(col, source.grid.columns, body)]), ...overrides];
  });
}

export function tActionCount(plan: TEca[]): number {
  return plan.reduce((count, action) => count + 1 + tActionCount(action.children ?? []), 0);
}
