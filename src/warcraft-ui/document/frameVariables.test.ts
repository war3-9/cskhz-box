import { expect, test } from 'vitest';
import { frameVariable, planFrameVariables, withFrameVariables } from './frameVariables';
import { exampleNodes } from '../state/layout';
import { parseLayout, serializeLayout } from '../project/file';
import { buildTActionPlan } from '../export/tActions';

const node = (id: string) => ({ ...exampleNodes[1], id, name: '', tVariable: undefined, frameIndex: undefined, autoName: undefined });
test('stable identity survives deletion, reorder and project reload without reusing a name', () => {
  const nodes = withFrameVariables([node('a-b'), node('ab'), node('中文')]);
  expect(new Set(nodes.map(node => frameVariable(node))).size).toBe(3);
  const reordered = [nodes[2], nodes[1]];
  const restored = parseLayout(serializeLayout(reordered));
  expect(restored.map(node => frameVariable(node))).toEqual(reordered.map(node => frameVariable(node)));
  const actions = buildTActionPlan(restored);
  expect(actions.filter(item => item.name === 'SetVariable').map(item => item.args![0].value))
    .toEqual(['ui', 'ui']);
  expect(actions.filter(item => item.name === 'SetVariable').map(item => item.args![0].index?.value)).toEqual(['3', '2']);
  expect(nodes.map(n => n.autoName)).toEqual(['text_1', 'text_2', 'text_3']);
});
test('old V1 projects freeze their original positional variables on loading', () => {
  const legacy = [node('a'), node('b')];
  const loaded = parseLayout(JSON.stringify({ format: 'war3-ui-lab', version: 1, nodes: legacy }));
  expect(loaded.map(node => frameVariable(node))).toEqual(['ui[1]', 'ui[2]']);
  expect(loaded.map(n => n.tVariable)).toEqual(['War3Lab_0', 'War3Lab_1']);
  expect(parseLayout(serializeLayout([loaded[1]])).map(node => frameVariable(node))).toEqual(['ui[2]']);
});
test('missing and retained bound names are reported without changing their assignment', () => {
  const before = JSON.stringify(exampleNodes);
  const plan = planFrameVariables([exampleNodes[1], node('new')], ['ui', 'War3Lab_0']);
  expect(plan.rows.map(row => row.status)).toEqual(['available', 'available']);
  expect(plan.missing).toEqual([]);
  expect(planFrameVariables([node('new')], []).missing).toEqual(['ui']);
  expect(plan.retained).toEqual(['War3Lab_0']);
  expect(JSON.stringify(exampleNodes)).toBe(before);
  expect(planFrameVariables([], ['War3Lab_0']).retained).toEqual(['War3Lab_0']);
  expect(planFrameVariables(exampleNodes, null).rows.every(row => row.status === 'unbound')).toBe(true);
});
test('rejects duplicate identity/names, invalid identifiers and lossy Unicode IDs', () => {
  expect(() => withFrameVariables([node('a'), node('a')])).toThrow('重复');
  expect(() => withFrameVariables([{ ...node('a'), frameIndex: 1 }, { ...node('b'), frameIndex: 1 }])).toThrow('重复');
  for (const frameIndex of [0, -1, 8192, 1.5, NaN]) {
    expect(() => frameVariable({ ...node('a'), frameIndex })).toThrow();
  }
  expect(() => withFrameVariables([node('\ud800')])).toThrow('ID');
  expect(frameVariable(node('a'.repeat(150))).length).toBeLessThan(50);
});
