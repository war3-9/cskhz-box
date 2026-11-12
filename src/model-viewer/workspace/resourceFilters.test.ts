import { expect, it } from 'vitest';
import type { Source } from '../types';
import { isUnusedModel, resourceEntries } from './resourceFilters';
it('hides only confirmed model textures and keeps UI/icon textures with matching basenames', () => {
  const source: Source = { id: 'a', path: 'a', name: 'a', kind: 'folder', complete: true, entries: ['Models/a.mdx', 'Models/skin.blp', 'Icons/skin.blp', 'UI/frame.png'].map(path => ({ path, size: 1, model: path.endsWith('.mdx'), anonymous: false })), analysis: { modelTextures: ['models/skin.blp'], unusedModels: [], usageSupported: false, usageNote: '' } };
  expect(resourceEntries(source, 'texture').map(e => e.path)).toEqual(['Icons/skin.blp', 'UI/frame.png']);
  expect(resourceEntries(source, 'texture', false)).toHaveLength(3);
  expect(resourceEntries({ ...source, analysis: undefined }, 'texture')).toHaveLength(3);
});
it('allows unused filtering only with a supported analysis and invalidates with the source', () => {
  const source: Source = { id: 'a', path: 'a', name: 'a', kind: 'archive', complete: true, entries: ['A.mdx', 'B.mdx'].map(path => ({ path, size: 1, model: true, anonymous: false })), analysis: { modelTextures: [], unusedModels: ['a.mdx'], usageSupported: true, usageNote: '' } };
  expect(isUnusedModel(source, 'A.mdx')).toBe(true);
  expect(resourceEntries(source, 'model', true, 'unused').map(e => e.path)).toEqual(['A.mdx']);
  expect(resourceEntries({ ...source, analysis: { ...source.analysis!, usageSupported: false } }, 'model', true, 'unused')).toEqual([]);
  expect(resourceEntries({ ...source, analysis: { ...source.analysis!, unusedModels: ['b.mdx'] } }, 'model', true, 'unused')[0].path).toBe('B.mdx');
});
