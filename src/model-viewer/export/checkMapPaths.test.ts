import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), textures: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('./textureNames', () => ({ modelTexturePaths: mocks.textures }));
import { checkMapPaths } from './checkMapPaths';
beforeEach(() => { mocks.invoke.mockReset(); mocks.textures.mockReset().mockReturnValue(['jz(15)1.blp']); });
it('finds the reported subfolder mismatch instead of accepting viewer fallback', async () => {
  mocks.invoke.mockImplementation(async(command, args) => {
    if (command === 'viewer_open') return { entries: [{ path: 'unit/jz(15).mdx' }, { path: 'unit/jz(15)1.blp' }] };
    if (command === 'viewer_read') { if (args.path === 'unit\\jz(15).mdx') return new ArrayBuffer(4); throw new Error('missing'); }
  });
  const result = await checkMapPaths('map.w3x', ['unit\\jz(15).mdx'], new AbortController().signal, () => {});
  expect(result.issues).toEqual([{ model: 'unit\\jz(15).mdx', path: 'jz(15)1.blp', kind: 'texture', candidates: ['unit/jz(15)1.blp'] }]);
  expect(mocks.invoke).toHaveBeenLastCalledWith('viewer_close', expect.anything());
});
it('accepts exact normalized paths, and probes names missing from an incomplete list', async () => {
  mocks.textures.mockReturnValue(['unit\\jz(15)1.blp', 'hidden.blp']);
  mocks.invoke.mockImplementation(async command => command === 'viewer_open' ? { entries: [{ path: 'UNIT/jz(15)1.blp' }] } : new ArrayBuffer(4));
  const result = await checkMapPaths('map.w3x', ['unit/jz(15).mdx'], new AbortController().signal, () => {});
  expect(result).toEqual({ models: 1, textures: 2, issues: [] });
  expect(mocks.invoke.mock.calls.filter(([command]) => command === 'viewer_read')).toHaveLength(2);
});
it('closes the private source after cancellation while opening, without reading models', async () => {
  const abort = new AbortController();
  mocks.invoke.mockImplementation(async command => { if (command === 'viewer_open') { abort.abort(); return { entries: [] }; } });
  await expect(checkMapPaths('map.w3x', ['a.mdx'], abort.signal, () => {})).rejects.toThrow('已取消');
  expect(mocks.invoke).toHaveBeenCalledWith('viewer_cancel', expect.anything());
  expect(mocks.invoke).toHaveBeenLastCalledWith('viewer_close', expect.anything());
  expect(mocks.invoke.mock.calls.some(([command]) => command === 'viewer_read')).toBe(false);
});
