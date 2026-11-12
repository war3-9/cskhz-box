import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), image: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }));
vi.mock('./images', () => ({ consoleImage: mock.image }));
import { consoleTextures, consoleReplacementTextures } from './native';
import { defaultLayers, useConsole } from './store';
import { replaceConsoleFromSource } from './replaceConsole';

beforeEach(() => {
  vi.resetAllMocks();
  
  useConsole.setState({ layers: defaultLayers(), busy: false, past: [], future: [],
    map: { path: 'target.w3x', name: 'target', entries: 10, overrides: 0 } });
  mock.image.mockImplementation(async (_bytes, name) => `data:${name}`);
  mock.invoke.mockImplementation(async (command) => {
    if (command === 'viewer_open') return { kind: 'folder', entries: consoleTextures.map(t => ({ path: `子目录/${t.id}.PNG` })) };
    if (command === 'viewer_read') return new ArrayBuffer(4);
  });
});

it('replaces all six folder textures atomically while preserving HUD and map; undo includes hidden cover', async () => {
  const before = useConsole.getState();
  expect(await replaceConsoleFromSource('F:/private/folder', 'folder')).toEqual({ overrides: 6 });
  const after = useConsole.getState();
  expect(after.map).toBe(before.map);
  for (const texture of consoleTextures) expect(after.layers.find(l => l.id === texture.id)?.image).toBe(`data:子目录/${texture.id}.PNG`);
  expect(after.layers.find(l => l.id === 'ResourceGold')).toBe(before.layers.find(l => l.id === 'ResourceGold'));
  expect(after.past).toHaveLength(1);
  useConsole.getState().undo(); expect(useConsole.getState().layers).toEqual(before.layers);
  useConsole.getState().redo(); expect(useConsole.getState().layers).toEqual(after.layers);
  expect(mock.invoke.mock.calls.at(-1)?.[0]).toBe('viewer_close');
});

it('reads map paths without a listfile and fills absent console textures with originals', async () => {
  mock.invoke.mockImplementation(async (command, args) => {
    if (command === 'viewer_open') return { kind: 'archive', entries: [] };
    if (command === 'viewer_read') {
      if (args.path.endsWith('HumanUITile01.blp')) return new ArrayBuffer(4);
      throw '资源不存在或已损坏';
    }
  });
  expect(await replaceConsoleFromSource('F:/private/source.w3m', 'map')).toEqual({ overrides: 1 });
  expect(mock.invoke.mock.calls.filter(([command]) => command === 'viewer_read')).toHaveLength(7);
  for (const texture of consoleTextures.slice(1)) expect(useConsole.getState().layers.find(l => l.id === texture.id)?.image).toBe(texture.image);
});

it.each(['missing', 'duplicate'])('rejects a %s folder before reading or replacing anything', async mode => {
  const before = useConsole.getState().layers;
  mock.invoke.mockResolvedValue({ kind: 'folder', entries: mode === 'missing' ? [] : consoleTextures.flatMap(t => [{ path: `${t.id}.blp` }, { path: `${t.id}.png` }]) });
  await expect(replaceConsoleFromSource('F:/private/folder', 'folder')).rejects.toThrow(mode === 'missing' ? '缺少' : '同名');
  expect(useConsole.getState().layers).toBe(before);
  expect(useConsole.getState().busy).toBe(false);
  expect(mock.invoke.mock.calls.filter(([command]) => command === 'viewer_read')).toHaveLength(0);
  expect(mock.invoke.mock.calls.at(-1)?.[0]).toBe('viewer_close');
});

it('preserves the whole preview if a later texture cannot decode', async () => {
  const before = useConsole.getState().layers;
  mock.image.mockResolvedValueOnce('data:first').mockRejectedValueOnce(new Error('贴图损坏'));
  await expect(replaceConsoleFromSource('F:/private/folder', 'folder')).rejects.toThrow('贴图损坏');
  expect(useConsole.getState().layers).toBe(before);
  expect(useConsole.getState().past).toEqual([]);
  expect(useConsole.getState().busy).toBe(false);
});

it('does not treat permission failures or explicitly listed broken textures as missing', async () => {
  for (const [entries, error] of [[[], '账号验证失败'], [[{ path: consoleTextures[0].archivePath }], '资源不存在或已损坏']] as const) {
    mock.invoke.mockImplementation(async command => {
      if (command === 'viewer_open') return { kind: 'archive', entries };
      if (command === 'viewer_read') throw error;
    });
    await expect(replaceConsoleFromSource('F:/private/source.w3x', 'map')).rejects.toThrow('读取 HumanUITile01 失败');
  }
  expect(useConsole.getState().past).toEqual([]);
});

it('rejects a changed document before committing the six textures', async () => {
  mock.image.mockImplementation(async () => { useConsole.setState({ map: null }); return 'data:test'; });
  await expect(replaceConsoleFromSource('F:/private/folder', 'folder')).rejects.toThrow('已变化');
  expect(useConsole.getState().past).toEqual([]);
});

it('rejects invalid map extensions and missing target without native reads', async () => {
  await expect(replaceConsoleFromSource('bad.png', 'map')).rejects.toThrow('请选择魔兽争霸地图');
  useConsole.setState({ map: null });
  await expect(replaceConsoleFromSource('F:/folder', 'folder')).rejects.toThrow('请先打开');
  expect(mock.invoke).not.toHaveBeenCalled();
});

it('includes the menu atlas from a source map in the same undo operation', async () => {
  const before = useConsole.getState().layers;
  mock.invoke.mockImplementation(async command => command === 'viewer_open'
    ? { kind: 'archive', entries: [] } : new ArrayBuffer(4));
  expect(await replaceConsoleFromSource('F:/source.w3x', 'map')).toEqual({ overrides: 7 });
  for (const texture of consoleReplacementTextures)
    expect(useConsole.getState().layers.find(l => l.id === texture.id)?.image).toBe(`data:${texture.archivePath}`);
  expect(useConsole.getState().past).toHaveLength(1);
  useConsole.getState().undo(); expect(useConsole.getState().layers).toEqual(before);
});

it.each(['folder', 'map'] as const)('uses default menus when the %s source has no menu atlas', async kind => {
  const menu = consoleReplacementTextures.at(-1)!;
  useConsole.getState().replace([{ id: menu.id, image: 'old-custom-menu', filename: 'old.blp' }]);
  mock.invoke.mockImplementation(async (command, args) => {
    if (command === 'viewer_open') return { kind: kind === 'map' ? 'archive' : 'folder',
      entries: consoleTextures.map(t => ({ path: `${t.id}.png` })) };
    if (command === 'viewer_read') {
      if (args.path === menu.archivePath) throw '资源不存在或已损坏';
      return new ArrayBuffer(4);
    }
  });
  await replaceConsoleFromSource(kind === 'map' ? 'F:/source.w3x' : 'F:/folder', kind);
  expect(useConsole.getState().layers.find(l => l.id === menu.id)?.image).toBe(menu.image);
  useConsole.getState().undo();
  expect(useConsole.getState().layers.find(l => l.id === menu.id)?.image).toBe('old-custom-menu');
});

it('reads an optional folder menu and rejects a listed broken map menu atomically', async () => {
  const menu = consoleReplacementTextures.at(-1)!;
  mock.invoke.mockImplementation(async command => command === 'viewer_open'
    ? { kind: 'folder', entries: consoleReplacementTextures.map(t => ({ path: `${t.id}.png` })) }
    : new ArrayBuffer(4));
  expect(await replaceConsoleFromSource('F:/folder', 'folder')).toEqual({ overrides: 7 });
  expect(useConsole.getState().layers.find(l => l.id === menu.id)?.image).toBe(`data:${menu.id}.png`);
  const before = useConsole.getState().layers;
  mock.invoke.mockImplementation(async (command, args) => {
    if (command === 'viewer_open') return { kind: 'archive', entries: [{ path: menu.archivePath }] };
    if (args?.path === menu.archivePath) throw '资源不存在或已损坏';
    return new ArrayBuffer(4);
  });
  await expect(replaceConsoleFromSource('F:/source.w3x', 'map')).rejects.toThrow(`读取 ${menu.id} 失败`);
  expect(useConsole.getState().layers).toBe(before);
});
