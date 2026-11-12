import { beforeEach, describe, expect, it } from 'vitest';
import { nativeLayers, canvasSize, hudTexts } from './native';
import { defaultLayers, useConsole } from './store';

beforeEach(() => useConsole.setState({ layers: defaultLayers(), map: null, busy: false, past: [], future: [] }));
describe('fixed native human console', () => {
  it('keeps the original layout and excludes the inventory cover', () => {
    expect(canvasSize).toEqual({ width: 1920, height: 1080 });
    expect(nativeLayers).toHaveLength(17);
    expect(nativeLayers.some(layer => layer.id === 'HumanUITile-InventoryCover')).toBe(false);
    expect(nativeLayers.reduce((n, layer) => n + layer.regions.length, 0)).toBe(25);
    expect(nativeLayers[0].x).toBe(0);
    expect(nativeLayers[3].x + nativeLayers[3].width).toBeCloseTo(1920, 3);
    expect(nativeLayers[3].width).toBeCloseTo(76.8, 3);
    expect(nativeLayers[1].regions.filter(region => region.y < 1)).toHaveLength(2);
    expect(nativeLayers[4].x).toBeCloseTo(808.8, 3);
    expect(nativeLayers[4].y).toBeCloseTo(0, 3);
    // Position and visibility are not editable document properties.
    expect(Object.keys(useConsole.getState().layers[0]).sort()).toEqual(['filename', 'id', 'image']);
  });
  it('adds native resource paths and four upper buttons without moving the console', () => {
    expect(nativeLayers.slice(5, 8).map(layer => layer.archivePath)).toEqual([
      'UI\\Widgets\\Console\\Human\\human-console-buttonstates2.blp',
      'UI\\Feedback\\Resources\\ResourceGold.blp', 'UI\\Feedback\\Resources\\ResourceLumber.blp',
    ]);
    expect(hudTexts.slice(0, 4).map(item => item.text)).toEqual(['任务 (F9)', '菜单 (F10)', '盟友 (F11)', '聊天 (F12)']);
  });
  it('keeps every UV crop within the source texture', () => {
    for (const layer of nativeLayers) for (const region of layer.regions) {
      expect(region.width).toBeGreaterThan(0); expect(region.height).toBeGreaterThan(0);
      expect(region.u).toBeGreaterThanOrEqual(0); expect(region.v).toBeGreaterThanOrEqual(0);
      expect(region.u + region.uw).toBeLessThanOrEqual(1.000001);
      expect(region.v + region.vh).toBeLessThanOrEqual(1.000001);
    }
  });
  it('uses native movement, stop, hold and attack icons in the original top-row order', () => {
    const commands = nativeLayers.slice(-4);
    expect(commands.map(layer => layer.id)).toEqual(['BTNMove', 'BTNStop', 'BTNHoldPosition', 'BTNAttack']);
    expect(commands.every(layer => layer.archivePath.startsWith('ReplaceableTextures\\CommandButtons\\'))).toBe(true);
    for (let i = 0; i < commands.length; i++) {
      expect(commands[i].x).toBeCloseTo(1480.8 + i * 104.4);
      expect(commands[i].y).toBeCloseTo(840.6);
    }
  });
  it('undoes a multi-file console replacement as one operation', () => {
    const original = useConsole.getState().layers;
    const changed = original.slice(0, 2).map(layer => ({ ...layer, image: 'data:test' }));
    useConsole.getState().replace(changed);
    expect(useConsole.getState().past).toHaveLength(1);
    expect(useConsole.getState().layers.slice(0, 2)).toEqual(changed);
    useConsole.getState().undo(); expect(useConsole.getState().layers).toEqual(original);
    useConsole.getState().redo(); expect(useConsole.getState().layers.slice(0, 2)).toEqual(changed);
    useConsole.getState().reset(); expect(useConsole.getState().layers).toEqual(original);
  });
  it('blocks history and edits while a map is loading', () => {
    useConsole.getState().replace([{ ...useConsole.getState().layers[0], image: 'changed' }]);
    const layers = useConsole.getState().layers;
    useConsole.setState({ busy: true });
    useConsole.getState().reset(); useConsole.getState().undo();
    useConsole.getState().replace(defaultLayers());
    expect(useConsole.getState().layers).toBe(layers);
  });
});
