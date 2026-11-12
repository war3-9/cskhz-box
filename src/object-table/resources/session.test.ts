import { expect, test, vi } from 'vitest';
const mock=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mock.invoke}));
vi.mock('../../model-viewer/renderer/engine',()=>({War3Engine:class{}}));
import { ResourceSession } from './session';
test('close cancels only its own source and cleans a late native open without leaking it',async()=>{
  let finish!:(value:unknown)=>void;
  mock.invoke.mockReset().mockImplementation((command:string)=>command==='viewer_open'?new Promise(resolve=>{finish=resolve}):Promise.resolve());
  const first=new ResourceSession(),second=new ResourceSession();expect(first.id).not.toBe(second.id);
  const opening=first.open('F:/private/map.w3x');first.close();finish({id:first.id,entries:[]});
  await expect(opening).rejects.toThrow('已取消');
  expect(mock.invoke.mock.calls.every(call=>call[1].id===first.id)).toBe(true);
  expect(mock.invoke.mock.calls.filter(call=>call[0]==='viewer_close')).toHaveLength(2);
  await expect(first.read('a.mdx')).rejects.toThrow('已关闭');
});
test('read completion after close is discarded, preventing stale models being published',async()=>{
  let finish!:(value:unknown)=>void;
  mock.invoke.mockReset().mockImplementation((command:string)=>command==='viewer_read'?new Promise(resolve=>{finish=resolve}):Promise.resolve());
  const session=new ResourceSession();const reading=session.read('Models/a.mdx');session.close();finish(new ArrayBuffer(4));
  await expect(reading).rejects.toThrow('已关闭');
});
