import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), load: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }));
import { defaultLayers, useConsole } from './store';
import { replaceConsoleFont } from './fonts';
import { saveConsoleMap } from './saveMap';
import { fontLayerId } from './fontTypes';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('document', { fonts: { add: mock.add, delete: mock.remove } });
  vi.stubGlobal('FontFace', class {
    constructor(public family: string) {}
    async load() { await mock.load(); return this; }
  });
  
  useConsole.setState({ busy: false });
  useConsole.getState().loadMap({ path: 'F:/map.w3x', name: 'map', entries: 0, overrides: 0, fingerprint: 'original' },
    defaultLayers(), { skin: [91, 93], stored: [1, 2], preview: null });
  mock.invoke.mockResolvedValue({ bytes: [0, 1, 0, 0], chinese: true });
});

it.each(['gold-quantity', 'lumber-quantity', 'human-healthbar-fill', 'human-manabar-fill'])(
  'shares one global font and restores it from %s, with undo/redo', async id => {
    await replaceConsoleFont('F:/font.ttf');
    const changed = useConsole.getState().layers.find(l => l.id === fontLayerId)!;
    expect(changed.image).toMatch(/^BoxConsoleFont/);
    useConsole.getState().resetPart(id);
    expect(useConsole.getState().layers.find(l => l.id === fontLayerId)?.image).toBe('');
    useConsole.getState().undo();
    expect(useConsole.getState().layers.find(l => l.id === fontLayerId)).toBe(changed);
    useConsole.getState().redo();
    expect(useConsole.getState().layers.find(l => l.id === fontLayerId)?.image).toBe('');
  });

it('saves fonts through the dedicated transaction and resets to exact opening bytes after saving', async () => {
  await replaceConsoleFont('F:/font.ttf');
  mock.invoke.mockResolvedValue({ fingerprint: 'saved', backup: 'backup.w3x' });
  await saveConsoleMap();
  expect(mock.invoke).toHaveBeenLastCalledWith('console_save_map', { path: 'F:/map.w3x', fingerprint: 'original',
    changes: [], font: { reset: false, bytes: [0, 1, 0, 0], skin: null, stored: null } });
  useConsole.getState().resetPart('gold-quantity');
  await saveConsoleMap();
  expect(mock.invoke).toHaveBeenLastCalledWith('console_save_map', { path: 'F:/map.w3x', fingerprint: 'saved',
    changes: [], font: { reset: true, bytes: null, skin: [91, 93], stored: [1, 2] } });
});

it('preserves the document when native validation or browser font decoding fails', async () => {
  const before = useConsole.getState().layers;
  mock.invoke.mockRejectedValueOnce(new Error('缺少数字'));
  await expect(replaceConsoleFont('F:/bad.ttf')).rejects.toThrow('缺少数字');
  mock.load.mockRejectedValueOnce(new Error('无法解码'));
  await expect(replaceConsoleFont('F:/bad.ttf')).rejects.toThrow('无法解码');
  expect(useConsole.getState().layers).toBe(before);
  expect(useConsole.getState().busy).toBe(false);
});

it('rejects a changed map before committing and removes its loaded font', async () => {
  mock.load.mockImplementationOnce(() => useConsole.setState({ map: null }));
  await expect(replaceConsoleFont('F:/font.ttf')).rejects.toThrow('已变化');
  expect(useConsole.getState().past).toHaveLength(0);
  expect(mock.remove).toHaveBeenCalled();
});

it('retains undo fonts and releases them after opening another map', async () => {
  await replaceConsoleFont('F:/font.ttf');
  useConsole.getState().resetPart('gold-quantity');
  await Promise.resolve();
  expect(mock.remove).not.toHaveBeenCalled();
  useConsole.getState().loadMap({ path: 'F:/other.w3x', name: 'other', entries: 0, overrides: 0 }, defaultLayers());
  await Promise.resolve();
  expect(mock.remove).toHaveBeenCalled();
});
