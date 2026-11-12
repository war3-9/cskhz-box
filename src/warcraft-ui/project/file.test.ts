import { expect, test } from 'vitest';
import { exampleNodes } from '../state/layout';
import { parseLayout, serializeLayout } from './file';
import { frameGeometry } from '../output/geometry';

test('portable image bytes and Chinese text survive a project roundtrip', () => {
  const nodes = [{ ...exampleNodes[0], imageData: 'data:image/png;base64,iVBORw0KGgo=' }, exampleNodes[1]];
  expect(parseLayout(serializeLayout(nodes))).toEqual(nodes);
});

test('V1 geometry migrates once while preserving game coordinates, bytes and variables', () => {
  const legacy = { ...exampleNodes[0], x: 320, y: 240, width: 160, height: 120,
    imageData: 'data:image/png;base64,iVBORw0KGgo=' };
  const migrated = parseLayout(JSON.stringify({ format: 'war3-ui-lab', version: 1, nodes: [legacy] }));
  expect(frameGeometry(migrated[0])).toEqual({ x: '0.400000', y: '0.300000', width: '0.200000', height: '0.150000' });
  expect(migrated[0].tVariable).toBe(legacy.tVariable);
  expect(migrated[0].imageData).toBe(legacy.imageData);
  expect(parseLayout(serializeLayout(migrated))).toEqual(migrated);
  expect(JSON.parse(serializeLayout(migrated)).version).toBe(2);
});
test('reject malformed data, duplicate IDs, invalid dimensions and remote images', () => {
  for (const data of [null, { version: 2 }, { format: 'war3-ui-lab', version: 1, nodes: [exampleNodes[0], exampleNodes[0]] },
    { format: 'war3-ui-lab', version: 1, nodes: [{ ...exampleNodes[0], height: -1 }] },
    { format: 'war3-ui-lab', version: 1, nodes: [{ ...exampleNodes[0], imageData: 'https://example.com/image.png' }] }]) {
    expect(() => parseLayout(JSON.stringify(data))).toThrow();
  }
});
