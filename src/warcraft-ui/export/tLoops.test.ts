import { expect, test } from 'vitest';
import { buildTActionPlan, type TArg, type TEca } from './tActions';
import { withFrameVariables } from '../document/frameVariables';
import type { UiNode } from '../document/model';
import { outputFrames } from '../output/frames';
import { exportT } from './wtg';
import { tActionCount } from './tLoops';

const controls = withFrameVariables([
  { id: 'parent', kind: 'panel', name: '面板', x: 30, y: 40, width: 600, height: 600, color: '#ffffff' },
  { id: 'buttons', kind: 'button', name: '按钮', parentId: 'parent', selfAnchor: 'CENTER', targetAnchor: 'CENTER', x: 90, y: 100,
    width: 80, height: 32, color: '#ffffff', text: '测试', texture: 'test.blp', opacity: .7,
    grid: { rows: 8, columns: 4, gapX: 12, gapY: 9 } },
  { id: 'texts', kind: 'text', name: '文字', x: 20, y: 30, width: 60, height: 24, text: '文字', color: '#abcdef',
    grid: { rows: 2, columns: 3, gapX: 5, gapY: 8 } },
] as UiNode[]);

// Interpret the generated GUI arithmetic independently, then compare every executed UI call.
function execute(plan: TEca[], locals: Record<string, number> = {}): unknown[][] {
  const value = (arg: TArg): unknown => {
    if (arg.type === 1) return `${arg.value}[${value(arg.index!)}]`;
    if (!arg.call) return arg.type === 3 && /^-?\d+(\.\d+)?$/.test(arg.value) ? Number(arg.value) : arg.value;
    const args = arg.call.args!.map(value);
    switch (arg.call.name) {
      case 'YDWEForLoopLocVarIndex': return locals[String(args[0])];
      case 'OperatorInt': case 'OperatorReal': return args[1] === 'OperatorAdd' ? Number(args[0]) + Number(args[2]) :
        args[1] === 'OperatorSubtract' ? Number(args[0]) - Number(args[2]) : Number(args[0]) * Number(args[2]);
      case 'I2R': return Number(args[0]);
      case 'I2S': return String(args[0]);
      case 'OperatorString': return String(args[0]) + String(args[1]);
      default: return [arg.call.name, ...args];
    }
  };
  return plan.flatMap(action => {
    if (action.name !== 'YDWEForLoopLocVarMultiple') return [[action.name, ...action.args!.map(value)]];
    const [name, start, end] = action.args!.map(value);
    return Array.from({ length: Number(end) - Number(start) + 1 }, (_, index) =>
      execute(action.children!, { ...locals, [String(name)]: Number(start) + index })).flat();
  });
}

test('8×4 buttons use one array with disjoint click, texture and label slots', () => {
  const frames = outputFrames(controls);
  expect(frames.filter(frame => frame.type === 'GLUEBUTTON')).toHaveLength(32);
  expect(frames.filter(frame => frame.type === 'TEXT')).toHaveLength(38);
  const indices = frames.map(frame => frame.node.frameIndex);
  expect(new Set(indices).size).toBe(frames.length);
  const plan = buildTActionPlan(controls, 'Hud', 'loop');
  expect(plan.filter(action => action.name === 'YDWEForLoopLocVarMultiple')).toHaveLength(2);
  expect(tActionCount(plan)).toBeLessThan(50);
  const flat = execute(buildTActionPlan(controls, 'Hud'));
  const loop = execute(plan);
  expect(loop).toHaveLength(flat.length);
  loop.forEach((row, index) => row.forEach((value, field) => {
    if (typeof value === 'number') expect(value).toBeCloseTo(flat[index][field] as number, 5);
    else expect(value).toEqual(flat[index][field]);
  }));
  expect(JSON.stringify(plan)).not.toContain('CustomScriptCode');
  expect(JSON.stringify(plan)).not.toContain('GetForLoopIndexA');
});

test('loop mode preserves ordinary controls and supports one row or one column', () => {
  for (const [rows, columns] of [[1, 5], [4, 1], [1, 1]]) {
    const nodes = [{ ...controls[2], parentId: undefined, grid: { rows, columns, gapX: 0, gapY: 0 } }];
    const plain = execute(buildTActionPlan(nodes)); const loop = execute(buildTActionPlan(nodes, undefined, 'loop'));
    expect(loop.map(row => row.slice(0, 3))).toEqual(plain.map(row => row.slice(0, 3)));
  }
  expect(buildTActionPlan([controls[0]], undefined, 'loop')).toEqual(buildTActionPlan([controls[0]]));
});

test('WTG declares just the Frame array and serializes nested branch-zero actions', () => {
  const files = exportT(controls, 'Hud', 'loop');
  const text = new TextDecoder().decode(files.wtg);
  expect(text.match(/YDWEForLoopLocVarMultiple/g)).toHaveLength(4);
  expect(text).toContain('YDWEForLoopLocVarIndex');
  expect(text).not.toContain('CustomScriptCode');
  expect(files.wtg.length).toBeLessThan(exportT(controls, 'Hud').wtg.length);
});

test('individual cell textures override the common loop texture without changing handles or the parent', () => {
  for (const texture of [undefined, 'common.blp']) {
    const nodes: UiNode[] = [controls[0], { ...controls[1], texture, grid: { rows: 2, columns: 4, gapX: 12, gapY: 9,
      materials: { '0:0': { texture: 'first.blp' }, '0:2': { texture: '' }, '1:3': { texture: 'last.blp' } } } }];
    const state = (plan: TEca[]) => {
      const result: Record<string, unknown> = {};
      for (const [name, handle, ...args] of execute(plan)) result[`${name}:${handle}`] = args;
      // A blank texture on a hidden frame has no visible effect.
      for (const key of Object.keys(result)) if (key.startsWith('DzFrameShow:') && (result[key] as string[])[0] === 'false') delete result[key.replace('DzFrameShow:', 'DzFrameSetTexture:')];
      return result;
    };
    const loop = state(buildTActionPlan(nodes, 'ui', 'loop')), flat = state(buildTActionPlan(nodes, 'ui'));
    expect(Object.keys(loop).sort()).toEqual(Object.keys(flat).sort());
    for (const key of Object.keys(flat)) (flat[key] as unknown[]).forEach((value, field) => {
      const actual = (loop[key] as unknown[])[field];
      if (typeof value === 'number') expect(actual).toBeCloseTo(value, 5);
      else expect(actual).toEqual(value);
    });
    const frames = outputFrames(nodes);
    const materials = frames.filter(frame => frame.role === 'material');
    expect(materials).toHaveLength(8);
    expect(materials[2].node.visible).toBe(false);
    expect(new Set(frames.map(frame => frame.node.frameIndex)).size).toBe(frames.length);
  }
});
