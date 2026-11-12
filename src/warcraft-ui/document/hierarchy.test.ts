import { expect, it } from 'vitest';
import { moveInTree } from './hierarchy';
import type { UiNode } from './model';
const n = (id:string,parentId?:string):UiNode=>({id,parentId,name:'',kind:'panel',x:0,y:0,width:10,height:10,color:'#ffffff'});
it('moves a whole branch, clears its parent and rejects descendant cycles',()=>{
  const nodes=[n('a'),n('b','a'),n('c','b'),n('d')];
  expect(moveInTree(nodes,'a','c','inside')).toBe(nodes);
  const moved=moveInTree(nodes,'b','d','inside');
  expect(moved.find(n=>n.id==='b')?.parentId).toBe('d');
  expect(moved.find(n=>n.id==='c')?.parentId).toBe('b');
  const root=moveInTree(moved,'b',null,'inside');
  expect(root.find(n=>n.id==='b')?.parentId).toBeUndefined();
  expect(root.map(n=>n.id)).toEqual(['a','d','b','c']);
});
it('orders sibling branches as reversed visual stacking and rejects locked movement',()=>{
  const nodes=[n('a'),n('b','a'),n('c'),n('d','c')];
  expect(moveInTree(nodes,'a','c','before').map(n=>n.id)).toEqual(['c','d','a','b']);
  expect(moveInTree(nodes,'c','a','after').map(n=>n.id)).toEqual(['c','d','a','b']);
  const locked=[{...n('a'),locked:true},n('b')];
  expect(moveInTree(locked,'a','b','inside')).toBe(locked);
});
