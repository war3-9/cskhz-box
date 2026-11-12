import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }));
import { defaultLayers, useConsole } from './store';
import { changedConsoleLayers, saveConsoleMap } from './saveMap';
import { consoleTextures } from './native';

beforeEach(() => {
  vi.resetAllMocks(); useConsole.setState({ busy: false });
  useConsole.getState().loadMap({ path: 'F:/private/map.w3x', name: 'map', entries: 0, overrides: 0, fingerprint: 'original' }, defaultLayers());
});
it('right reset restores the opened map asset and leaves other edited components untouched', () => {
  const original = defaultLayers(); original[0] = { ...original[0], image: 'map-custom' };
  useConsole.getState().loadMap({ path: 'map.w3x', name: 'map', entries: 0, overrides: 1 }, original);
  useConsole.getState().replace([{ ...original[0], image: 'added-console' }, { id: 'ResourceGold', image: 'added-gold', filename: 'gold.png' }]);
  useConsole.getState().replace([{ id: 'human-console-buttonstates2', image: 'added-menu', filename: 'menu.png' }]);
  useConsole.getState().resetPart('console');
  expect(useConsole.getState().layers[0].image).toBe('map-custom');
  expect(useConsole.getState().layers.find(layer => layer.id === 'human-console-buttonstates2')).toEqual(original.find(layer => layer.id === 'human-console-buttonstates2'));
  expect(useConsole.getState().layers.find(layer => layer.id === 'ResourceGold')?.image).toBe('added-gold');
  useConsole.getState().resetPart('ResourceGold');
  expect(useConsole.getState().layers).toEqual(original);
  useConsole.getState().undo(); expect(useConsole.getState().layers.find(layer => layer.id === 'ResourceGold')?.image).toBe('added-gold');
  expect(consoleTextures).toHaveLength(6);
});
it('resets minimap to earth and does not modify history for an unchanged component', () => {
  useConsole.getState().resetPart('minimap'); expect(useConsole.getState().past).toHaveLength(0);
  useConsole.getState().replace([{ id: 'minimap', image: 'added', filename: 'map.png' }]);
  useConsole.getState().resetPart('minimap'); expect(useConsole.getState().layers.find(layer => layer.id === 'minimap')?.image).toBe('');
});
it('tracks save differences separately from the original reset baseline', () => {
  useConsole.getState().replace([{ id: 'ResourceGold', image: 'added', filename: 'gold.png' }]);
  const state = useConsole.getState(); expect(changedConsoleLayers(state.layers, state.savedLayers).map(l => l.id)).toEqual(['ResourceGold']);
  state.markSaved('after-save');
  expect(changedConsoleLayers(useConsole.getState().layers, useConsole.getState().savedLayers)).toEqual([]);
  useConsole.getState().resetPart('ResourceGold');
  expect(changedConsoleLayers(useConsole.getState().layers, useConsole.getState().savedLayers).map(l => l.id)).toEqual(['ResourceGold']);
});
it('saves a native reset as removal at its actual MPQ path and updates the fingerprint', async () => {
  const native = useConsole.getState().layers;
  useConsole.getState().loadMap({ path: 'F:/private/map.w3x', name: 'map', entries: 0, overrides: 0, fingerprint: 'old' },
    native.map(layer => layer.id === 'ResourceGold' ? { ...layer, image: 'saved-custom' } : layer));
  useConsole.getState().replace([native.find(layer => layer.id === 'ResourceGold')!]);
  mock.invoke.mockResolvedValue({ fingerprint: 'new', backup: 'backup.w3x' });
  await saveConsoleMap();
  expect(mock.invoke).toHaveBeenCalledWith('console_save_map', { path: 'F:/private/map.w3x', fingerprint: 'old',
    changes: [{ path: 'UI\\Feedback\\Resources\\ResourceGold.blp', bytes: null }] });
  expect(useConsole.getState().map?.fingerprint).toBe('new'); expect(useConsole.getState().busy).toBe(false);
});
it('restores original minimap bytes rather than deleting the map preview', async () => {
  const original = defaultLayers(); original.find(l => l.id === 'minimap-original')!.sourceBytes = [1, 2, 3];
  useConsole.getState().loadMap({ path: 'F:/map.w3x', name: 'map', entries: 0, overrides: 0, fingerprint: 'hash' }, original);
  useConsole.setState({ savedLayers: original.map(l => l.id === 'minimap' ? { ...l, image: 'saved-custom' } : l) });
  mock.invoke.mockRejectedValue(new Error('occupied'));
  await expect(saveConsoleMap()).rejects.toThrow('occupied');
  expect(mock.invoke.mock.calls[0][1].changes).toEqual([{ path: 'war3mapMap.blp', bytes: [1, 2, 3] }]);
  expect(useConsole.getState().map?.fingerprint).toBe('hash'); expect(useConsole.getState().busy).toBe(false);
});
it('saves existing BLP source bytes without lossy image conversion', async () => {
  useConsole.getState().replace([{ id: 'ResourceGold', image: 'custom', filename: 'gold.blp', sourceBytes: [66, 76, 80, 49] }]);
  mock.invoke.mockResolvedValue({ fingerprint: 'saved', backup: 'backup.w3x' });
  await saveConsoleMap();
  expect(mock.invoke.mock.calls[0][1].changes).toEqual([{ path: 'UI\\Feedback\\Resources\\ResourceGold.blp', bytes: [66, 76, 80, 49] }]);
});
