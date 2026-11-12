import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), image: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }));
vi.mock('./images', () => ({ consoleImage: mock.image }));
import { openConsoleMap } from './openMap';
import { defaultLayers, useConsole } from './store';

beforeEach(() => {
  vi.resetAllMocks(); 
  useConsole.setState({ layers: defaultLayers(), map: null, busy: false, past: [], future: [] });
  mock.image.mockResolvedValue('data:map-texture');
  mock.invoke.mockImplementation(async (command: string, args: { path?: string }) => {
    if (command === 'viewer_open') return { kind: 'archive', name: '地图.w3x', entries: [], complete: false };
    if (command === 'viewer_read') {
      if (args.path?.endsWith('HumanUITile01.blp')) return new ArrayBuffer(4);
      throw '资源不存在或已损坏';
    }
  });
});
it('reads console and HUD paths without requiring a listfile and falls back to native textures', async () => {
  const original = useConsole.getState().layers;
  const result = await openConsoleMap('F:/private/地图.w3x');
  expect(result?.overrides).toBe(1);
  expect(mock.invoke.mock.calls.filter(([command]) => command === 'viewer_read')).toHaveLength(19);
  expect(mock.invoke.mock.calls.some(([, args]) => args?.path === 'UI\\Feedback\\Resources\\ResourceGold.blp')).toBe(true);
  expect(mock.invoke.mock.calls.some(([, args]) => args?.path?.includes('InventoryCover'))).toBe(true);
  expect(useConsole.getState().layers[0].image).toBe('data:map-texture');
  expect(useConsole.getState().layers.slice(1)).toEqual(original.slice(1));
  expect(useConsole.getState().map?.path).toBe('F:/private/地图.w3x');
  expect(mock.invoke.mock.calls.at(-1)?.[0]).toBe('viewer_close');
  expect(useConsole.getState().busy).toBe(false);
});
it('preserves the previous document on a corrupt texture and always closes the archive', async () => {
  const original = useConsole.getState().layers;
  mock.image.mockRejectedValue(new Error('BLP 已损坏'));
  await expect(openConsoleMap('F:/private/broken.w3m')).rejects.toThrow('BLP 已损坏');
  expect(useConsole.getState().layers).toBe(original); expect(useConsole.getState().map).toBe(null);
  expect(mock.invoke.mock.calls.at(-1)?.[0]).toBe('viewer_close'); expect(useConsole.getState().busy).toBe(false);
});
it('does not swallow permission or IO errors as missing textures', async () => {
  mock.invoke.mockImplementation(async (command: string) => {
    if (command === 'viewer_open') return { kind: 'archive', name: '地图', entries: [] };
    if (command === 'viewer_read') throw '地图文件暂时不可用';
  });
  await expect(openConsoleMap('F:/private/error.w3x')).rejects.toThrow('地图文件暂时不可用');
  expect(useConsole.getState().map).toBe(null);
});
it('does not fall back for an entry explicitly present in the archive', async () => {
  mock.invoke.mockImplementation(async (command: string) => {
    if (command === 'viewer_open') return { kind: 'archive', name: '地图', entries: [{ path: 'ui/console/human/humanuitile01.blp' }] };
    if (command === 'viewer_read') throw '资源不存在或已损坏';
  });
  await expect(openConsoleMap('F:/private/error.w3x')).rejects.toThrow('读取 HumanUITile01 失败');
});
it('loads an override texture and retains the source map path', async () => {
  mock.image.mockImplementation(async () => {  return 'data:map'; });
  await expect(openConsoleMap('F:/private/map.w3x')).resolves.toMatchObject({ overrides: 1 });
  expect(useConsole.getState().map?.path).toBe('F:/private/map.w3x');
});
it('rejects non-map input before invoking native commands', async () => {
  await expect(openConsoleMap('F:/private/file.png')).rejects.toThrow('请选择魔兽争霸地图');
  expect(mock.invoke).not.toHaveBeenCalled();
});

it('rejects a file changed during the final fingerprint read', async () => {
  const previous = mock.invoke.getMockImplementation()!; let fingerprints = 0;
  mock.invoke.mockImplementation(async (command: string, args: { path?: string }) => {
    if (command === 'console_map_fingerprint') return ++fingerprints === 2 ? 'changed' : 'original';
    return previous(command, args);
  });
  await expect(openConsoleMap('F:/private/map.w3x')).rejects.toThrow('读取期间地图已变化');
  expect(useConsole.getState().map).toBeNull();
});
