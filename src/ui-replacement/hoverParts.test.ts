import { expect, it } from 'vitest';
import { nativeLayers } from './native';
import { hoverParts, consoleGlow } from './hoverParts';
import { defaultLayers, useConsole } from './store';

it('keeps all fifteen independent hover colors distinct and reserves the console edge color', () => {
  expect(hoverParts).toHaveLength(15);
  expect(new Set([...hoverParts.map(part => part.color), consoleGlow]).size).toBe(16);
  expect(hoverParts.find(part => part.id === 'human-console-buttonstates2')?.width).toBeCloseTo(816);
  expect(hoverParts.filter(part => part.id.includes('heroattributes'))).toHaveLength(3);
  expect(nativeLayers.filter(part => part.id.includes('bar-fill'))).toHaveLength(2);
});
it('replaces the current document and clears previous map edit history when opening another map', () => {
  const layers = defaultLayers();
  useConsole.getState().replace([{ ...layers[0], image: 'changed' }]);
  const metadata = { path: 'map.w3x', name: 'map', entries: 0, overrides: 0 };
  useConsole.getState().loadMap(metadata, layers);
  expect(useConsole.getState().map).toBe(metadata);
  expect(useConsole.getState().layers).toBe(layers);
  expect(useConsole.getState().past).toEqual([]);
  expect(useConsole.getState().future).toEqual([]);
});

