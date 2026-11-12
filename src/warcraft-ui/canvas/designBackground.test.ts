import { beforeEach, expect, test } from 'vitest';
import type { UiNode } from '../document/model';
import { designBackground } from './designBackground';
import { buildTActionPlan } from '../export/tActions';
import { exportJass } from '../export/jass';
import { exportT } from '../export/wtg';
import { parseLayout, serializeLayout } from '../project/file';
import { useLayoutStore } from '../state/layout';

const kinds: UiNode['kind'][] = ['panel', 'button', 'background', 'text', 'backdrop'];
const nodes: UiNode[] = kinds.map((kind, i) => ({ id: `node-${i}`, kind, name: `frame${i}`, x: i * 200, y: 50,
  width: 150, height: 100, color: '#ffffff', text: '按钮', opacity: 0.8 }));
beforeEach(() => useLayoutStore.setState({ nodes: [], selectedId: null, past: [], future: [] }));

test('every old and new component gets a visible default editor background', () => {
  for (const node of nodes) expect(designBackground(node)).toEqual({ fill: expect.stringMatching(/^#[0-9a-f]{6}$/), opacity: 0.7 });
});
test('editor background settings survive save/load and undo without changing T, WTG, JASS outputs', () => {
  const s = useLayoutStore.getState(); s.replace(nodes);
  const original = useLayoutStore.getState().nodes;
  s.setNode(original[0].id, { previewBackgroundOpacity: 0 });
  const edited = useLayoutStore.getState().nodes;
  expect(designBackground(edited[0]).opacity).toBe(0);
  expect(edited[0].opacity).toBe(0.8);
  expect(parseLayout(serializeLayout(edited))).toEqual(edited);
  expect(buildTActionPlan(edited)).toEqual(buildTActionPlan(original));
  expect(exportT(edited)).toEqual(exportT(original));
  expect(exportJass(edited)).toBe(exportJass(original));
  
  s.undo(); expect(useLayoutStore.getState().nodes).toEqual(original);
  s.redo(); expect(useLayoutStore.getState().nodes).toEqual(edited);
});
test.each([-1, 2, NaN, '0.5'])('rejects invalid preview opacity %j when loading saved designs', value => {
  expect(() => parseLayout(JSON.stringify({ format: 'war3-ui-lab', version: 2, nodes: [{ ...nodes[0], previewBackgroundOpacity: value }] }))).toThrow('设计背景透明度');
});
