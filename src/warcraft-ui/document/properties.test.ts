import { beforeEach, expect, test } from 'vitest';
import { useLayoutStore } from '../state/layout';
import type { UiNode, AnchorPoint } from './model';
import { frameName, frameVariable } from './frameVariables';
import { parseLayout, serializeLayout } from '../project/file';
import { buildTActionPlan } from '../export/tActions';
import { exportJass } from '../export/jass';
import { effectiveVisible } from './relations';
import { framePosition } from '../output/geometry';

const make = (id: string, patch: Partial<UiNode> = {}): UiNode => ({ id, kind: 'text', name: '', x: 480, y: 270,
  width: 480, height: 270, color: '#ffffff', text: 'hello', ...patch });
beforeEach(() => useLayoutStore.setState({ nodes: [], selectedId: null, past: [], future: [] }));

test('explicit name edits update bounded stable names with undo and legacy reload preservation', () => {
  const s = useLayoutStore.getState(); s.add(make('a')); const original = useLayoutStore.getState().nodes[0];
  s.setNode('a', { name: 'Health Bar' });
  const named = useLayoutStore.getState().nodes[0]; expect(frameName(named)).toBe('Health Bar'); expect(frameVariable(named)).toBe('ui[1]');
  s.undo(); expect(useLayoutStore.getState().nodes[0].tVariable).toBe(original.tVariable);
  s.redo(); expect(useLayoutStore.getState().nodes[0].tVariable).toBe(named.tVariable);
  s.setNode('a', { name: '中文'.repeat(100) }); expect(frameVariable(useLayoutStore.getState().nodes[0]).length).toBeLessThanOrEqual(99);
  s.add(make('b')); s.setNode('a', { name: '重复' }); s.setNode('b', { name: '重复' });
  expect(useLayoutStore.getState().nodes.map(frameName)).toEqual(['重复', '重复 (2)']);
  const legacy = make('old', { name: 'legacy', tVariable: 'War3Lab_0' });
  expect(parseLayout(serializeLayout([legacy]))[0].tVariable).toBe('War3Lab_0');
});

test('moving parents moves descendants once; deleting a parent releases children and remains loadable', () => {
  const s = useLayoutStore.getState(); s.replace([make('a'), make('b', { parentId: 'a' }), make('c', { parentId: 'b' })]);
  s.setNode('a', { x: 500, y: 300 });
  expect(useLayoutStore.getState().nodes.map(n => [n.x, n.y])).toEqual([[500,300],[500,300],[500,300]]);
  s.setNode('a', { parentId: 'c' }); expect(useLayoutStore.getState().nodes[0].parentId).toBeUndefined();
  s.select('a'); s.removeSelected(); expect(useLayoutStore.getState().nodes[0].parentId).toBeUndefined();
  expect(() => parseLayout(serializeLayout(useLayoutStore.getState().nodes))).not.toThrow();
  s.undo(); expect(useLayoutStore.getState().nodes).toHaveLength(3);
});

test('parent-first T/JASS share relative anchors, fonts, colors and opacity restoration', () => {
  const parent = make('p', { kind: 'panel', name: 'Panel' });
  const child = make('c', { parentId: 'p', selfAnchor: 'CENTER', targetAnchor: 'BOTTOMRIGHT', fontSize: 36, fontPath: 'Fonts\\custom.ttf', textColor: '#ff0000', opacity: 1 });
  const nodes = [child, parent], actions = buildTActionPlan(nodes);
  expect(actions[0].args![0]).toEqual({ type: 1, value: 'ui', index: { type: 3, value: '2' } });
  expect(actions[0].args![1].call!.args![1].value).toBe('Panel');
  const anchor = actions.find(a => a.name === 'DzFrameSetPoint')!;
  expect(anchor.args![1]).toEqual({ type: 0, value: 'FramePoints_Center' });
  expect(anchor.args![3]).toEqual({ type: 0, value: 'FramePoints_BottomRight' });
  expect(anchor.args!.slice(4).map(a => a.value)).toEqual(['-0.100000','0.075000']);
  expect(exportJass(nodes)).toContain('DzFrameSetPoint(War3LabFrames[1], 4, War3LabFrames[0], 8, -0.100000, 0.075000)');
  
  
  expect(actions.find(a => a.name === 'DzFrameSetFont')!.args![2].value).toBe('0.020000');
  expect(actions.find(a => a.name === 'DzFrameSetText')!.args![1].value).toContain('|cffff0000');
});

test('tree reparent is reflected by Copy T creation and point parent references', () => {
  const s = useLayoutStore.getState();
  s.replace([make('child', { name: 'Child' }), make('parent', { kind: 'panel', name: 'Parent', x: 200, y: 150 })]);
  s.moveTree('child', 'parent', 'inside');
  const nodes = useLayoutStore.getState().nodes, actions = buildTActionPlan(nodes);
  const childCreate = actions.find(action => action.name === 'SetVariable' && action.args?.[0].index?.value === '1')!;
  const childPoint = actions.find(action => action.name === 'DzFrameSetPoint' && action.args?.[0].index?.value === '1')!;
  expect(childCreate.args![1].call!.args![2]).toEqual({ type: 1, value: 'ui', index: { type: 3, value: '2' } });
  expect(childPoint.args![2]).toEqual({ type: 1, value: 'ui', index: { type: 3, value: '2' } });
  expect(actions.findIndex(action => action === childCreate)).toBeGreaterThan(-1);
  expect(actions.findIndex(action => action.name === 'SetVariable' && action.args?.[0].index?.value === '2')).toBeLessThan(actions.findIndex(action => action === childCreate));
});

test('all nine root anchors preserve the document rectangle and malformed graphs are refused', () => {
  const anchors: AnchorPoint[] = ['TOPLEFT','TOP','TOPRIGHT','LEFT','CENTER','RIGHT','BOTTOMLEFT','BOTTOM','BOTTOMRIGHT'];
  anchors.forEach(selfAnchor => anchors.forEach(targetAnchor => {
    const node = make('a', { selfAnchor, targetAnchor });
    const point = buildTActionPlan([node]).find(a => a.name === 'DzFrameSetPoint')!;
    expect(point.args!.slice(4).map(a => a.value)).toEqual(Object.values(framePosition(node)));
    expect(exportJass([node])).toContain('DzFrameSetPoint'); 
  }));
  for (const nodes of [[make('a', { parentId: 'missing' })], [make('a', { parentId: 'b' }), make('b', { parentId: 'a' })]]) {
    expect(() => buildTActionPlan(nodes)).toThrow(); expect(() => exportJass(nodes)).toThrow(); 
  }
  expect(effectiveVisible(make('c', { parentId: 'p' }), [make('p', { visible: false })])).toBe(false);
  for (const patch of [{ visible: 'false' }, { opacity: 2 }, { textColor: 'red' }, { locked: 1 }]) {
    expect(() => parseLayout(JSON.stringify({ format: 'war3-ui-lab', version: 2, nodes: [make('a', patch as Partial<UiNode>)] }))).toThrow();
  }
});
