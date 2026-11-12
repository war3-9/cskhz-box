import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke, isTauri: () => true }));
import { mutateSource, mutationReason } from './mutations';
import { resourceKey, type Source } from '../types';
import { useViewer } from '../workspace/store';

const source: Source = { id: 'folder', name: 'models', path: 'F:/models', kind: 'folder', complete: true, entries: [
  { path: 'target.mdx', size: 4, model: true, anonymous: false },
  { path: 'other.mdx', size: 4, model: true, anonymous: false },
  { path: 'shared.blp', size: 4, model: false, anonymous: false },
] };
beforeEach(() => {
  mocks.invoke.mockReset();
  useViewer.setState({ sources: [], activeSource: '', selected: [], favorites: [], categories: {}, exportNames: {}, sourceRoles: {}, fileBusy: false, busy: undefined, error: '', status: '', current: undefined, detail: false });
  useViewer.getState().add(source);
});
it('deletes only explicit targets and clears their stale state while retaining other selections and textures', async () => {
  const target = resourceKey(source, 'target.mdx'), other = resourceKey(source, 'other.mdx');
  useViewer.setState({ selected: [other], favorites: [target, other], categories: { [target]: 'A', [other]: 'B' }, exportNames: { [target]: 'target-name.mdx', [other]: 'other-name.mdx' }, current: { sourceId: source.id, path: 'target.mdx' }, detail: true });
  mocks.invoke.mockResolvedValue({ source: { ...source, entries: source.entries.slice(1) }, renamed: {}, changed: 1, backup: 'F:/models/.box-model-backups/test' });
  await mutateSource(source, 'delete', ['target.mdx'], {});
  expect(mocks.invoke).toHaveBeenCalledWith('viewer_mutate', expect.objectContaining({ operation: 'delete', paths: ['target.mdx'] }));
  expect(useViewer.getState()).toMatchObject({ selected: [other], favorites: [other], categories: { [other]: 'B' }, exportNames: { [other]: 'other-name.mdx' }, current: undefined, detail: false });
  expect(useViewer.getState().sources[0].entries.map(e => e.path)).toEqual(['other.mdx', 'shared.blp']);
});
it('deletes in the current map and ignores stale copy destinations while preserving the resource tab', async () => {
  const map: Source = { ...source, id: 'map', path: 'F:/source.w3x', kind: 'archive', complete: false };
  useViewer.getState().add(map); useViewer.setState({ kind: 'texture', exportNames: { original: 'keep' } });
  const refreshed: Source = { ...map, entries: map.entries.slice(0, 2) };
  mocks.invoke.mockResolvedValue({ source: refreshed, renamed: {}, changed: 1, backup: 'C:/Downloads/已删除模型/test' });
  await mutateSource(map, 'delete', ['shared.blp'], { destination: 'F:/old-copy.w3x' });
  expect(mocks.invoke).toHaveBeenCalledWith('viewer_mutate', expect.objectContaining({ destination: undefined, newId: map.id }));
  expect(useViewer.getState()).toMatchObject({ activeSource: 'map', kind: 'texture', exportNames: { original: 'keep' } });
  expect(useViewer.getState().sources.find(s => s.id === 'map')).toEqual(refreshed);
  expect(useViewer.getState().sources.some(s => s.path === 'F:/old-copy.w3x')).toBe(false);
});
it('allows explicit anonymous map deletion, keeps import restricted, and rejects MPQ mutations', () => {
  const map: Source = { ...source, kind: 'archive', path: 'F:/map.w3x', complete: false };
  expect(mutationReason(map, 'delete')).toBe('');
  expect(mutationReason(map, 'import')).toContain('无法导入');
  expect(mutationReason({ ...map, path: 'F:/War3.mpq' }, 'delete')).not.toBe('');
});
it('keeps source entries and selections on native failure', async () => {
  const selected = [resourceKey(source, 'other.mdx')]; useViewer.setState({ selected });
  mocks.invoke.mockRejectedValue(new Error('拒绝覆盖原地图'));
  await expect(mutateSource(source, 'delete', ['target.mdx'], {})).rejects.toThrow('拒绝覆盖');
  expect(useViewer.getState().sources[0]).toEqual(source);
  expect(useViewer.getState().selected).toEqual(selected);
  expect(useViewer.getState().error).toContain('拒绝覆盖');
});
