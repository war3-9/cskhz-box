import { beforeEach, expect, test } from 'vitest';
import { useLayoutStore } from '../state/layout';
import { anchorOffset } from './position';
import type { AnchorPoint, UiNode } from './model';
import { buildTActionPlan } from '../export/tActions';
import { exportJass } from '../export/jass';

const node = (id: string, patch: Partial<UiNode> = {}): UiNode => ({ id, kind: 'panel', name: id,
  x: 100, y: 80, width: 400, height: 200, color: '#ffffff', ...patch });
beforeEach(() => useLayoutStore.setState({ nodes: [], past: [], future: [], selectedId: null }));

test('changing anchors aligns all 81 combinations, clearing offsets from previous dragging', () => {
  const anchors: AnchorPoint[] = ['TOPLEFT','TOP','TOPRIGHT','LEFT','CENTER','RIGHT','BOTTOMLEFT','BOTTOM','BOTTOMRIGHT'];
  const fractions = [[0,0],[.5,0],[1,0],[0,.5],[.5,.5],[1,.5],[0,1],[.5,1],[1,1]];
  const s = useLayoutStore.getState();
  for (const selfAnchor of anchors) for (const targetAnchor of anchors) {
    s.replace([node('a', { selfAnchor: selfAnchor === 'CENTER' ? 'TOPLEFT' : 'CENTER' })]);
    s.setNode('a', { selfAnchor, targetAnchor });
    const self = fractions[anchors.indexOf(selfAnchor)], target = fractions[anchors.indexOf(targetAnchor)];
    expect(useLayoutStore.getState().nodes[0]).toMatchObject({ x: 1920 * target[0] - 400 * self[0], y: 1080 * target[1] - 200 * self[1] });
    expect(anchorOffset(useLayoutStore.getState().nodes[0])).toEqual({x:0,y:0});
  }
});

test('a dragged child centers on its parent immediately; descendants follow and undo restores the move', () => {
  const s = useLayoutStore.getState();
  s.replace([node('A'), node('B', { parentId: 'A', x: 600, y: 500, width: 80, height: 60 }),
    node('C', { parentId: 'B', x: 615, y: 510, width: 20, height: 10 })]);
  const before = useLayoutStore.getState().nodes;
  s.setNode('B', { selfAnchor: 'CENTER', targetAnchor: 'CENTER' });
  const after = useLayoutStore.getState().nodes;
  expect(after[1]).toMatchObject({ x: 260, y: 150 }); expect(after[2]).toMatchObject({ x: 275, y: 160 });
  expect(anchorOffset(after[1], after[0])).toEqual({ x: 0, y: 0 });
  s.undo(); expect(useLayoutStore.getState().nodes).toEqual(before);
  s.redo(); expect(useLayoutStore.getState().nodes).toEqual(after);
});

test('parent and size changes propagate anchored offsets through three levels', () => {
  const s = useLayoutStore.getState();
  s.replace([node('p'), node('b', {parentId:'p',x:460,y:250,width:80,height:60,selfAnchor:'CENTER',targetAnchor:'BOTTOMRIGHT'}),
    node('c', {parentId:'b',x:480,y:260,width:20,height:10,targetAnchor:'BOTTOMRIGHT'})]);
  const original = useLayoutStore.getState().nodes;
  const offsets = [anchorOffset(original[1],original[0]),anchorOffset(original[2],original[1])];
  s.setNode('p',{width:600,height:300});
  const after = useLayoutStore.getState().nodes;
  expect(after.map(n=>[n.x,n.y])).toEqual([[100,80],[660,350],[680,360]]);
  expect([anchorOffset(after[1],after[0]),anchorOffset(after[2],after[1])]).toEqual(offsets);
  s.undo();expect(useLayoutStore.getState().nodes).toEqual(original);
  s.redo();expect(useLayoutStore.getState().nodes).toEqual(after);
  s.setNode('b',{parentId:undefined});
  expect(anchorOffset(useLayoutStore.getState().nodes[1])).toEqual(offsets[0]);
});

test('detaching a whole subtree preserves positions and converts offsets; one undo/redo restores order and parent', () => {
  const s = useLayoutStore.getState();
  s.replace([node('p'),node('b',{parentId:'p',x:460,y:250,selfAnchor:'CENTER',targetAnchor:'BOTTOMRIGHT'}),
    node('c',{parentId:'b',x:480,y:270})]);
  const before = useLayoutStore.getState().nodes, history = useLayoutStore.getState().past.length;
  s.moveTree('b',null,'inside');const detached=useLayoutStore.getState().nodes;
  expect(detached).toHaveLength(3);expect(detached.find(n=>n.id==='b')!.parentId).toBeUndefined();
  expect(detached.find(n=>n.id==='c')!.parentId).toBe('b');
  for(const n of before)expect(detached.find(x=>x.id===n.id)).toMatchObject({x:n.x,y:n.y});
  expect(anchorOffset(detached.find(n=>n.id==='b')!)).not.toEqual(anchorOffset(before[1],before[0]));
  expect(useLayoutStore.getState().past.length).toBe(history+1);
  s.undo();expect(useLayoutStore.getState().nodes).toEqual(before);
  s.redo();expect(useLayoutStore.getState().nodes).toEqual(detached);
});

test('editable button has no skin template and preserves label/font/color and positioning in T/JASS', () => {
  const button=node('button',{kind:'button',text:'确认',fontSize:36,textColor:'#ffaa00',selfAnchor:'CENTER',targetAnchor:'TOPLEFT'});
  const actions=buildTActionPlan([button]), jass=exportJass([button]);
  expect(actions[0].args![1].call!.args!.map(a=>a.value)).toEqual(['GLUEBUTTON','button','','','0']);
  expect(actions.find(a=>a.name==='DzFrameSetText')!.args![1].value).toBe('|cffffaa00确认|r');
  expect(actions.find(a=>a.name==='DzFrameSetTextAlignment')!.args![1].value).toBe('18');
  expect(actions.some(a=>a.name==='DzFrameSetTexture')).toBe(false);
  for(const output of [jass]){expect(output).not.toContain('ScriptDialogButton');expect(output).toContain('GLUEBUTTON');expect(output).toContain('0.125000, -0.100000');}
});
