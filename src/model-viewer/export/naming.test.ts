import { expect, it } from 'vitest';
import { exportPath, mapDirectory, renameConflict, renamePlan, singleModelName } from './naming';
import { resourceKey, type Source } from '../types';
const source: Source = { id: 'map', name: 'map', path: 'F:/map.w3x', kind: 'archive', complete: false, entries: ['a.mdx', 'b.mdx'].map(path => ({ path, size: 1, model: true, anonymous: true })) };
it('keeps the actual model format and validates exact single export names without silent sanitization', () => {
  expect(singleModelName('hero', 'nested/a.mdx')).toBe('hero.mdx');
  expect(singleModelName('Hero.MDX', 'a.mdx', 'Models/Units')).toBe('Models\\Units\\Hero.MDX');
  expect(singleModelName('自定义模型.mdl', 'a.mdl')).toBe('自定义模型.mdl');
  for (const name of ['', ' ', '../hero', 'a/b.mdx', 'CON.mdx', 'nul', ' hero', 'hero ', 'hero.', 'a?b', 'hero.mdl']) {
    expect(() => singleModelName(name, 'a.mdx')).toThrow();
  }
  expect(() => singleModelName('中'.repeat(76), 'a.mdx')).toThrow('合计过长');
  expect(() => singleModelName('hero', 'a.mdx', '../Models')).toThrow();
});
it('numbers selected models in order using the requested parenthesized prefix', () => {
  expect(renamePlan(['nested/b.mdx', 'skin.blp', 'a.mdx'], 'tx', '1')).toEqual([{ path: 'nested/b.mdx', name: 'tx(1).mdx' }, { path: 'a.mdx', name: 'tx(2).mdx' }]);
  expect(renamePlan(['a.mdx', 'b.MDL'], '中文', '009')).toEqual([{ path: 'a.mdx', name: '中文(9).mdx' }, { path: 'b.MDL', name: '中文(10).mdl' }]);
  for (const start of ['0', '-1', '1.2', 'abc', '999999999']) expect(renamePlan(['a.mdx', 'b.mdx'], 'tx', start)).toEqual([]);
  expect(renamePlan(['a.mdx'], 'tx', '999999999')).toHaveLength(1);
  for (const prefix of ['', ' ', '../', 'tx.']) expect(renamePlan(['a.mdx'], prefix, '1')).toEqual([]);
});
it('uses a normalized map directory and rejects unsafe or silently rewritten paths', () => {
  expect(renamePlan(['a.mdx'], 'jz', '15', ' unit/ ')).toEqual([{ path: 'a.mdx', name: 'unit\\jz(15).mdx' }]);
  expect(mapDirectory('Models/Units')).toBe('Models\\Units\\');
  expect(mapDirectory('')).toBe('');
  for (const path of ['C:\\unit', '/unit', '..', 'unit/../other', 'unit//other', 'unit./x', 'CON', 'nul.txt', 'a?b', 'unit/ ./x']) expect(() => mapDirectory(path)).toThrow();
  expect(() => mapDirectory('a'.repeat(121))).toThrow('过长');
  expect(() => renamePlan(['a.mdx'], '中'.repeat(60), '1', 'a'.repeat(100))).toThrow('合计过长');
});
it('detects collisions with a model already at the target map path', () => {
  const nested = { ...source, entries: [...source.entries, { path: 'unit/tx(1).mdx', size: 1, model: true, anonymous: false }] };
  expect(renameConflict(nested, { [resourceKey(source, 'a.mdx')]: 'UNIT\\tx(1).mdx' })).toContain('重复');
});
it('exports renamed models at the root and detects flattened and case-insensitive collisions', () => {
  const names = { [resourceKey(source, 'a.mdx')]: 'tx(1).mdx', [resourceKey(source, 'nested/b.mdx')]: 'tx(2).mdx' };
  expect(exportPath({ sourceId: 'map', path: 'a.mdx' }, [source], names)).toBe('tx(1).mdx');
  expect(exportPath({ sourceId: 'map', path: 'nested/b.mdx' }, [source], names)).toBe('tx(2).mdx');
  expect(exportPath({ sourceId: 'map', path: 'war3mapImported/a.blp' }, [source], names)).toBe('war3mapImported/a.blp');
  expect(renameConflict(source, { [resourceKey(source, 'a.mdx')]: 'B.mdx' })).toContain('重复');
});
