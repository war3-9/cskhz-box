import { beforeEach, expect, it, vi } from 'vitest';
import { useViewer } from '../workspace/store';
import { exportRefs } from './scope';
import { resourceKey, type Source } from '../types';
const source = (id: string): Source => ({ id, path: `F:/${id}`, name: id, kind: 'folder', complete: true, entries: [{ path: 'a.mdx', model: true, size: 10, anonymous: false }, { path: 'nested/b.mdl', model: true, size: 20, anonymous: false }, { path: 'a.blp', model: false, size: 30, anonymous: false }] });
beforeEach(() => { vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }); useViewer.setState({ sources: [], selected: [], category: '', categoryNames: [], query: '', directory: '', current: undefined }); });
it('new folder/map source resets old type, category, exhibit and filtering to show every model', () => {
  useViewer.setState({ kind: 'texture', category: 'old', mode: 'exhibit', query: 'missing', directory: 'missing', page: 50, detail: true });
  useViewer.getState().add(source('opened'));
  expect(useViewer.getState()).toMatchObject({ activeSource: 'opened', kind: 'model', category: '', mode: 'grid', query: '', directory: '', page: 0, detail: false });
});
it('all exports ignores query, page and directory; selected exports are confined to current source', () => {
  const a = source('a'), b = source('b'); useViewer.setState({ sources: [a, b], activeSource: 'a', kind: 'model', query: 'missing', directory: 'missing', page: 99, selected: [resourceKey(a, 'nested/b.mdl'), resourceKey(b, 'a.mdx')] });
  expect(exportRefs(useViewer.getState(), 'all')).toEqual([{ sourceId: 'a', path: 'a.mdx' }, { sourceId: 'a', path: 'nested/b.mdl' }]);
  expect(exportRefs(useViewer.getState(), 'selected')).toEqual([{ sourceId: 'a', path: 'nested/b.mdl' }]);
});
