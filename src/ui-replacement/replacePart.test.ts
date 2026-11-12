import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), image: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }));
vi.mock('./images', () => ({ consoleImage: mock.image }));
import { defaultLayers, useConsole } from './store';
import { replacementHints } from './hoverParts';
import { canReplacePart, replaceConsolePart } from './replacePart';

beforeEach(() => {
  vi.resetAllMocks(); 
  useConsole.setState({ layers: defaultLayers(), busy: false, past: [], future: [],
    map: { path: 'target.w3x', name: 'target', entries: 0, overrides: 0 } });
  mock.invoke.mockResolvedValue(new ArrayBuffer(4)); mock.image.mockResolvedValue('data:new-image');
});

it.each(Object.keys(replacementHints).filter(canReplacePart))('replaces only %s and includes it in undo/redo', async id => {
  const before = useConsole.getState();
  await replaceConsolePart(id, 'F:/private/new.png');
  const after = useConsole.getState();
  expect(after.map).toBe(before.map);
  expect(after.layers.find(layer => layer.id === id)).toEqual({ id, image: 'data:new-image', filename: 'F:/private/new.png' });
  expect(after.layers.filter(layer => layer.id !== id)).toEqual(before.layers.filter(layer => layer.id !== id));
  expect(after.busy).toBe(false);
  useConsole.getState().undo(); expect(useConsole.getState().layers).toEqual(before.layers);
  useConsole.getState().redo(); expect(useConsole.getState().layers).toEqual(after.layers);
});

it.each(['read', 'decode'])('keeps the old preview after a %s failure', async failure => {
  const before = useConsole.getState().layers;
  (failure === 'read' ? mock.invoke : mock.image).mockRejectedValueOnce(new Error('损坏文件'));
  await expect(replaceConsolePart('minimap', 'F:/private/broken.blp')).rejects.toThrow('损坏文件');
  expect(useConsole.getState().layers).toBe(before);
  expect(useConsole.getState().past).toEqual([]); expect(useConsole.getState().busy).toBe(false);
});

it('rejects invalid component, extension, missing map and concurrent import without reading', async () => {
  await expect(replaceConsolePart('console', 'F:/file.png')).rejects.toThrow('不支持');
  await expect(replaceConsolePart('ResourceGold', 'F:/file.exe')).rejects.toThrow('请选择');
  useConsole.setState({ busy: true });
  await expect(replaceConsolePart('ResourceGold', 'F:/file.png')).rejects.toThrow('正在读取');
  useConsole.setState({ busy: false, map: null });
  await expect(replaceConsolePart('ResourceGold', 'F:/file.png')).rejects.toThrow('请先打开');
  expect(mock.invoke).not.toHaveBeenCalled();
});

it('rejects a changed map during decoding', async () => {
  const before = useConsole.getState().layers;
  mock.image.mockImplementation(async () => { useConsole.setState({ map: null }); return 'data:new'; });
  await expect(replaceConsolePart('ResourceGold', 'F:/file.png')).rejects.toThrow('已变化');
  expect(useConsole.getState().layers).toBe(before);
});
