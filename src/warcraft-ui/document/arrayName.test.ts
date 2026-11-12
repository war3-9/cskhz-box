import { afterEach, beforeEach, expect, test } from 'vitest';
import { validateArrayName } from './arrayName';
import { useLayoutStore, exampleNodes } from '../state/layout';
import { frameVariable } from './frameVariables';
import { parseDocument, serializeLayout } from '../project/file';
import { buildTActionPlan, type TEca } from '../export/tActions';
import { exportT } from '../export/wtg';
import { exportJass } from '../export/jass';

beforeEach(() => useLayoutStore.setState({ nodes: [], arrayName: 'ui', selectedId: null, past: [], future: [] }));
afterEach(() => useLayoutStore.setState({ nodes: [], arrayName: 'ui', selectedId: null, past: [], future: [] }));

test('layout-level rename is one reversible change and stable slots survive edits, clear and redo', () => {
  const state = useLayoutStore.getState(); state.replace(exampleNodes);
  const original = useLayoutStore.getState().nodes, past = useLayoutStore.getState().past.length;
  state.setArrayName('hud'); expect(useLayoutStore.getState().past).toHaveLength(past + 1);
  expect(useLayoutStore.getState().nodes).toBe(original);
  expect(original.map(node => frameVariable(node, 'hud'))).toEqual(['hud[1]', 'hud[2]']);
  state.undo(); expect(useLayoutStore.getState().arrayName).toBe('ui');
  state.redo(); expect(useLayoutStore.getState().arrayName).toBe('hud');
  state.replace([]); expect(useLayoutStore.getState().arrayName).toBe('hud');
  state.undo(); expect(useLayoutStore.getState().nodes).toBe(original);
  state.setNode(original[0].id, { x: 300 }); state.undo(); expect(useLayoutStore.getState().arrayName).toBe('hud');
  state.undo(); expect(useLayoutStore.getState().arrayName).toBe('ui');
});

test('custom and empty documents preserve array name; old layouts default to ui; invalid names fail without mutation', () => {
  for (const nodes of [exampleNodes, []]) expect(parseDocument(serializeLayout(nodes, 'Hud_2'))).toEqual({ nodes, arrayName: 'Hud_2', background: null });
  const old = JSON.parse(serializeLayout(exampleNodes)); delete old.arrayName;
  expect(parseDocument(JSON.stringify(old)).arrayName).toBe('ui');
  const state = useLayoutStore.getState(); const before = useLayoutStore.getState();
  for (const name of ['', '中文', '1hud', 'a b', 'a-b', 'udg_hud', 'array', 'endfunction', 'A'.repeat(100)]) {
    expect(() => validateArrayName(name)).toThrow(); expect(() => state.setArrayName(name)).toThrow();
    expect(() => parseDocument(JSON.stringify({ ...old, arrayName: name }))).toThrow();
    expect(() => buildTActionPlan(exampleNodes, name)).toThrow();
    expect(() => exportT(exampleNodes, name)).toThrow(); expect(() => exportJass(exampleNodes, name)).toThrow();
  }
  for (const value of [null, 1, false, {}]) expect(() => parseDocument(JSON.stringify({ ...old, arrayName: value }))).toThrow();
  expect(useLayoutStore.getState()).toBe(before);
  expect(validateArrayName('a'.repeat(99))).toHaveLength(99);
});

test('custom array declaration and every parent, anchor, material and text reference use the chosen array', () => {
  const nodes = [ { ...exampleNodes[0], kind: 'panel' as const }, { ...exampleNodes[1], kind: 'button' as const,
    parentId: exampleNodes[0].id, texture: 'war3mapImported\\button.blp' } ];
  const plan = buildTActionPlan(nodes, 'hud');
  const references: [string,string][] = [];
  const visit = (action: TEca) => action.args?.forEach(arg => {
    if (arg.type === 1) references.push([arg.value, arg.index!.value]);
    if (arg.call) visit(arg.call);
  });
  plan.forEach(visit);
  expect(new Set(references.map(([name]) => name))).toEqual(new Set(['hud']));
  expect(new Set(references.map(([,index]) => index))).toEqual(new Set(['1','2','3','4']));
  const creates = plan.filter(a => a.name === 'SetVariable');
  expect(creates[1].args![1].call!.args![2].value).toBe('hud');
  expect(creates[1].args![1].call!.args![2].index!.value).toBe('1');
  expect(creates[2].args![1].call!.args![2].index!.value).toBe('2');
  const wtg = new TextDecoder().decode(exportT(nodes, 'hud').wtg);
  expect(wtg).toContain('hud\0frame\0'); expect(wtg).not.toContain('ui\0');
  const jass = exportJass(nodes, 'hud'); expect(jass).toContain('integer array hud');
  expect(jass).not.toContain('War3LabFrames'); expect(jass).toContain('hud[4]'); expect(jass).not.toContain('hud[0]');
  expect(jass).toContain('DzCreateFrameByTagName("GLUEBUTTON", "标题", hud[1], "", 0)');
  expect(jass).toContain('DzFrameSetTexture(hud[3], "war3mapImported\\\\button.blp", 0)');
  expect(jass).toContain('DzFrameSetText(hud[4]');
  expect(jass).toContain('DzFrameSetPoint(hud[4], 0, hud[2], 0, 0.000000, 0.000000)');
});
