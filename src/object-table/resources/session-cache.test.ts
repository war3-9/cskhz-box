import { beforeEach, expect, test, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), parse: vi.fn(), decode: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }));
vi.mock('../../model-viewer/resources/parse', () => ({ parseModelBytes: mock.parse, modelWarning: () => undefined }));
vi.mock('../../model-viewer/resources/textures', () => ({ decodeTexture: mock.decode }));
vi.mock('../../model-viewer/renderer/engine', () => ({ War3Engine: class {} }));
import { ResourceSession } from './session';
beforeEach(() => {
  mock.invoke.mockReset().mockResolvedValue(new ArrayBuffer(4));
  mock.parse.mockReset().mockImplementation(() => ({ Info: {}, Geosets: [], Sequences: [], Textures: [{ Image: 'Textures/shared.blp' }, { Image: 'Textures/shared.blp' }] }));
  mock.decode.mockReset().mockResolvedValue([{ width: 1, height: 1 }]);
});
test('path picker asks for fast enumeration; full name recovery stays explicit', async () => {
  const session = new ResourceSession();
  await session.open('F:/private/map.w3x'); expect(mock.invoke).toHaveBeenLastCalledWith('viewer_open', { id: session.id, path: 'F:/private/map.w3x', quick: true });
  await session.open('F:/private/map.w3x', true); expect(mock.invoke).toHaveBeenLastCalledWith('viewer_open', { id: session.id, path: 'F:/private/map.w3x', quick: false });
  session.close();
});
test('thumbnail and interactive preview share the same in-flight model and decoded skins', async () => {
  const session = new ResourceSession();
  const first = session.model('Models/a.mdx'), same = session.model('models\\A.mdx');
  expect(first).toBe(same); await first; await session.model('Models/b.mdx');
  expect(mock.parse).toHaveBeenCalledTimes(2); expect(mock.decode).toHaveBeenCalledTimes(1);
  expect(mock.invoke.mock.calls.filter(([command, args]) => command === 'viewer_read' && args.path === 'Textures/shared.blp')).toHaveLength(1);
  expect((await first).dependencies).toHaveLength(1); session.close();
});
test('hot models are bounded and a closed session cannot return a cached model', async () => {
  const session = new ResourceSession();
  for (const path of ['a.mdx', 'b.mdx', 'c.mdx', 'd.mdx', 'a.mdx']) await session.model(path);
  expect(mock.parse).toHaveBeenCalledTimes(5); session.close();
  expect(() => session.model('a.mdx')).toThrow('已关闭');
});
test('off-page thumbnail work is skipped, and revisiting can replace the cancelled request', async () => {
  const session = new ResourceSession();
  vi.spyOn(session, 'model').mockRejectedValue(new Error('current request reached model loader'));
  const old = session.preview('a.mdx', true, () => false), current = session.preview('a.mdx', true);
  await expect(old).rejects.toThrow('预览已取消');
  await expect(current).rejects.toThrow('current request reached model loader');
  expect(session.model).toHaveBeenCalledTimes(1); session.close();
});
