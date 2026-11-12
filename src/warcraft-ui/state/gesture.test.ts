import { beforeEach, expect, it } from 'vitest';
import { previewNodes, useLayoutGesture } from './gesture';
import { useLayoutStore } from './layout';
import type { UiNode } from '../document/model';

const node = (id: string, parentId?: string): UiNode => ({ id, parentId, name:'',kind:'panel',x:10,y:20,width:100,height:50,color:'#ffffff' });
beforeEach(() => {
  useLayoutGesture.getState().clear();
  useLayoutStore.setState({ nodes:[],past:[],future:[],selectedId:null });
});
it('previews all descendants without document mutations; commit is one history entry', () => {
  const s = useLayoutStore.getState();
  s.replace([node('a'),node('b','a'),node('c','b'),node('d')]);
  const before = useLayoutStore.getState();
  const g = useLayoutGesture.getState();
  g.begin(before.nodes,'a');g.move(50,70);
  expect(previewNodes(before.nodes,useLayoutGesture.getState().drag).map(n=>[n.x,n.y]))
    .toEqual([[50,70],[50,70],[50,70],[10,20]]);
  expect(useLayoutStore.getState().nodes).toBe(before.nodes);
  expect(useLayoutStore.getState().past).toHaveLength(before.past.length);
  s.setNode('a',{x:50,y:70});g.clear();
  expect(useLayoutStore.getState().past).toHaveLength(before.past.length+1);
  s.undo();expect(useLayoutStore.getState().nodes).toEqual(before.nodes);
});
it('cancels previews and ignores stale documents and locked roots', () => {
  const nodes = [node('a'),node('b','a')],g=useLayoutGesture.getState();
  g.begin(nodes,'a');g.move(40,50);
  expect(previewNodes([...nodes],useLayoutGesture.getState().drag)).toEqual(nodes);
  g.clear();expect(previewNodes(nodes,useLayoutGesture.getState().drag)).toBe(nodes);
  g.begin([{...node('a'),locked:true}],'a');expect(useLayoutGesture.getState().drag).toBeNull();
});

it('resizes a parent with centered descendants in preview and commits exactly one reversible history entry', () => {
  const s = useLayoutStore.getState();
  s.replace([node('A'), { ...node('B', 'A'), x: 50, y: 40, width: 20, height: 10, selfAnchor: 'CENTER', targetAnchor: 'CENTER' }, node('other')]);
  const before = useLayoutStore.getState(), g = useLayoutGesture.getState();
  g.begin(before.nodes, 'A');
  g.resize({ x: -20, y: 5, width: 160, height: 80 });
  const preview = previewNodes(before.nodes, useLayoutGesture.getState().drag);
  expect(preview[0]).toMatchObject({ x: -20, y: 5, width: 160, height: 80 });
  expect(preview[1]).toMatchObject({ x: 50, y: 40, width: 20, height: 10 });
  expect(preview[2]).toBe(before.nodes[2]); expect(useLayoutStore.getState().past).toHaveLength(before.past.length);
  s.setNode('A', { x: -20, y: 5, width: 160, height: 80 }); g.clear();
  expect(useLayoutStore.getState().nodes).toEqual(preview); expect(useLayoutStore.getState().past).toHaveLength(before.past.length + 1);
  s.undo(); expect(useLayoutStore.getState().nodes).toEqual(before.nodes);
  s.redo(); expect(useLayoutStore.getState().nodes).toEqual(preview);
});

it('rejects invalid resize bounds and cancels resizing without changing the document', () => {
  const nodes = [node('A')], g = useLayoutGesture.getState(); g.begin(nodes, 'A');
  const original = useLayoutGesture.getState().drag;
  for (const box of [{ x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: 10, height: -1 }, { x: NaN, y: 0, width: 10, height: 10 }]) g.resize(box);
  expect(useLayoutGesture.getState().drag).toBe(original);
  g.resize({ x: 10, y: 20, width: 200, height: 100 }); g.clear();
  expect(previewNodes(nodes, useLayoutGesture.getState().drag)).toBe(nodes);
});
