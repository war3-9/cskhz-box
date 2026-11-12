import { expect, it, vi } from 'vitest';
import { migrateAnonymousKeys, migrateAnonymousPath, migrateRecoveredNames } from './anonymousNames';
import { resourceKey, type Source } from '../types';
import { useViewer } from './store';
it('preserves archive resource indices and migrates saved categories and export aliases', () => {
  const key = 'f:/map.w3x|file00005765.mdx';
  expect(migrateAnonymousKeys({ selected: [key], categories: { [key]: 'effects' }, exportNames: { [key]: 'custom.mdx' } })).toEqual({ selected: ['f:/map.w3x|file_005765.mdx'], categories: { 'f:/map.w3x|file_005765.mdx': 'effects' }, exportNames: { 'f:/map.w3x|file_005765.mdx': 'custom.mdx' } });
  expect(migrateAnonymousPath('war3mapImported/hero.mdx')).toBe('war3mapImported/hero.mdx');
  expect(migrateAnonymousKeys({ selected: ['f:/folder|file00005765.mdx'] }).selected).toEqual(['f:/folder|file00005765.mdx']);
});

it('moves saved model identity to a recovered filename without mixing sources or losing newer aliases', () => {
  const source: Source = { id: 'map', path: 'F:/map.w3x', name: 'map', kind: 'archive', complete: false, entries: [
    { path: 'war3mapImported/hero.mdx', legacyPath: 'File00005765.mdx', size: 1, model: true, anonymous: false },
    { path: 'file_000004.mdx', legacyPath: 'File00000004.mdx', size: 1, model: true, anonymous: true },
  ] };
  const old = resourceKey(source, 'File00005765.mdx'), interim = resourceKey(source, 'file_005765.mdx'), current = resourceKey(source, 'war3mapImported/hero.mdx');
  const other = 'f:/other.w3x|file00005765.mdx';
  const data = { selected: [old, interim, other], favorites: [old], categories: { [old]: '英雄' }, exportNames: { [current]: '新名称.mdx', [old]: '旧名称.mdx' }, current: { sourceId: 'map', path: 'file_005765.mdx' } };
  expect(migrateRecoveredNames(source, data)).toEqual({ selected: [current, other], favorites: [current], categories: { [current]: '英雄' }, exportNames: { [current]: '新名称.mdx' }, current: { sourceId: 'map', path: 'war3mapImported/hero.mdx' } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  useViewer.setState({ ...data, sources: [], sessionPaths: [] });
  useViewer.getState().add(source, true);
  expect(useViewer.getState().selected).toEqual([current, other]);
  expect(useViewer.getState().current?.path).toBe('war3mapImported/hero.mdx');
  expect(migrateRecoveredNames({ ...source, kind: 'folder' }, data)).toEqual({});
});
