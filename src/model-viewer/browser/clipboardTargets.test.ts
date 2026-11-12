import { describe, expect, it } from 'vitest';
import { clipboardModelPaths } from './clipboardTargets';
import { resourceKey, type Source } from '../types';

const source: Source = { id: 'test', path: 'F:/models', name: 'models', kind: 'folder', complete: true,
  entries: ['a.mdx', 'b.mdl', 'skin.blp'].map(path => ({ path, model: /md[xl]$/.test(path), anonymous: false, size: 10 })) };
describe('file clipboard targets', () => {
  it('copies checked models before the hovered model and ignores texture selection', () => {
    expect(clipboardModelPaths(source, [resourceKey(source, 'a.mdx'), resourceKey(source, 'skin.blp')], 'b.mdl')).toEqual(['a.mdx']);
  });
  it('falls back to the hovered model without selecting or copying a texture', () => {
    expect(clipboardModelPaths(source, [], 'b.mdl')).toEqual(['b.mdl']);
    expect(clipboardModelPaths(source, [], 'skin.blp')).toEqual([]);
    expect(clipboardModelPaths(source, [])).toEqual([]);
  });
});
