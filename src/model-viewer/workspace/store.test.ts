import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sortModelEntries, useViewer, visibleModels } from './store';
import { resourceKey, type Source } from '../types';
import { validateSavedViewer } from '../persistence/schema';
import { safePath } from '../export/output';
import { useEditor } from '../../layers/store';
const source = (id: string, path: string): Source => ({ id, path, name: id, kind: 'folder', complete: true, entries: [{ path: 'Units/A.mdx', size: 20, model: true, anonymous: false }, { path: 'UnitsElse/B.mdx', size: 10, model: true, anonymous: false }, { path: 'Textures/A.blp', size: 4, model: false, anonymous: false }] });
beforeEach(() => { vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }); useViewer.setState({ sources: [], activeSource: '', selected: [], favorites: [], categories: {}, categoryNames: [], sessionPaths: [], query: '', directory: '', category: '', kind: 'model', sort: 'name', current: undefined, detail: false, page: 0 }); });
describe('independent viewer state', () => {
  it('viewer navigation, filters and favorite mutations preserve icon document and history identities', () => {
    const icon = useEditor.getState();
    const s = source('one', 'F:/模型'); useViewer.getState().add(s); useViewer.getState().toggle(resourceKey(s, 'Units/A.mdx')); useViewer.getState().favorite(resourceKey(s, 'Units/A.mdx')); useViewer.getState().focus({ sourceId: s.id, path: 'Units/A.mdx' }, true); useViewer.getState().patch({ query: 'a', detail: false });
    expect(useEditor.getState()).toBe(icon);
  });
  it('supplement mount preserves the focused model, camera and browser state', () => {
    const a = source('one', 'F:/模型'), b = source('two', 'F:/贴图'); useViewer.getState().add(a); useViewer.getState().focus({ sourceId: a.id, path: 'Units/A.mdx' }, true); useViewer.getState().patch({ query: 'A', page: 3, camera: { yaw: 1, pitch: 0, distance: 3, panX: 0, panY: 0 } }); const before = useViewer.getState(); useViewer.getState().add(b, true);
    expect(useViewer.getState().activeSource).toBe(a.id); expect(useViewer.getState().current).toBe(before.current); expect(useViewer.getState().camera).toBe(before.camera); expect(useViewer.getState().page).toBe(3);
  });
  it('directory boundaries, case-insensitive full paths and texture mode use one filter', () => {
    useViewer.getState().add(source('one', 'F:/模型')); useViewer.getState().patch({ directory: 'Units', query: 'UNITS/a' }); expect(visibleModels(useViewer.getState()).map(e => e.path)).toEqual(['Units/A.mdx']); useViewer.getState().patch({ kind: 'texture', directory: '', query: '' }); expect(visibleModels(useViewer.getState()).map(e => e.path)).toEqual(['Textures/A.blp']);
  });
  it('closing one source preserves selections and models in the other source', () => {
    const a = source('one', 'F:/一'), b = source('two', 'F:/二'); useViewer.getState().add(a); useViewer.getState().toggle(resourceKey(a, 'Units/A.mdx')); useViewer.getState().add(b); useViewer.getState().toggle(resourceKey(b, 'Units/A.mdx')); useViewer.getState().remove(a.id); expect(useViewer.getState().selected).toEqual([resourceKey(b, 'Units/A.mdx')]); expect(useViewer.getState().sources).toEqual([b]);
  });
  it('stable favorites survive a source reopening with case/slash differences', () => { expect(resourceKey(source('a', 'F:\\模型'), 'Units\\A.mdx')).toBe(resourceKey(source('b', 'f:/模型'), 'units/a.mdx')); });
  it('invalid persisted state cannot install source handles, functions or out-of-range settings', () => { expect(validateSavedViewer({ sources: [{ id: 'fake' }], patch: 'bad', page: 4 })).toEqual({ page: 4 }); expect(validateSavedViewer({ page: -2 })).toEqual({}); expect(validateSavedViewer({ camera: { yaw: 1, pitch: 8, distance: 0, panX: 0, panY: 0 } })).toEqual({}); });
  it('output filenames remove Windows reserved and traversal components', () => { expect(safePath('../CON.png/a:b.mdx')).toBe('_/_CON.png/a_b.mdx'); expect(safePath('纹理\\单位.blp')).toBe('纹理/单位.blp'); });
  it('units precede buildings and decorations; explicit alphabetical sorting still works', () => {
    const entries = [{ path: 'A.mdx', modelGroup: 2 }, { path: 'Z.mdx', modelGroup: 0 }, { path: 'B.mdx', modelGroup: 1 }].map(item => ({ ...item, size: 1, model: true, anonymous: true }));
    expect(sortModelEntries([...entries], 'group').map(item => item.path)).toEqual(['Z.mdx', 'B.mdx', 'A.mdx']);
    expect(sortModelEntries([...entries], 'name').map(item => item.path)).toEqual(['A.mdx', 'B.mdx', 'Z.mdx']);
  });
  it('appearance changes reuse filtered entries; filters and source replacement invalidate them', () => {
    useViewer.getState().add(source('one', 'F:/模型'));
    const initial = visibleModels(useViewer.getState());
    useViewer.getState().configure({ background: '#abcdef', speed: 2 });
    expect(visibleModels(useViewer.getState())).toBe(initial);
    useViewer.getState().patch({ query: 'Units/A' });
    const filtered = visibleModels(useViewer.getState());
    expect(filtered).not.toBe(initial); expect(filtered.map(e => e.path)).toEqual(['Units/A.mdx']);
    useViewer.getState().patch({ category: '*' }); expect(visibleModels(useViewer.getState())).toEqual([]);
    useViewer.getState().favorite(resourceKey(useViewer.getState().sources[0], 'Units/A.mdx'));
    expect(visibleModels(useViewer.getState()).map(e => e.path)).toEqual(['Units/A.mdx']);
    useViewer.getState().add(source('two', 'F:/另一来源')); expect(visibleModels(useViewer.getState())).not.toBe(initial);
  });
  it('old persisted settings remain valid and receive the current preview size default', () => {
    const { cardSize: _, ...old } = useViewer.getState().settings;
    expect(validateSavedViewer({ settings: old }).settings).toEqual(old);
    const merged = useViewer.persist.getOptions().merge!({ settings: old }, useViewer.getState());
    expect(merged.settings.cardSize).toBe('medium');
  });
  it('startup ignores old map sessions while retaining saved preferences, favorites and aliases', () => {
    const saved = { sessionPaths: ['F:/old.w3x'], activeSource: 'old', current: { sourceId: 'old', path: 'a.mdx' }, selected: ['old|a.mdx'], query: 'a', directory: 'Units', page: 7, mode: 'exhibit', kind: 'texture', scroll: 999, settings: { ...useViewer.getState().settings, speed: 2 }, favorites: ['f:/old.w3x|a.mdx'], exportNames: { 'f:/old.w3x|a.mdx': '名字.mdx' }, recent: ['F:/old.w3x'] };
    const current = { ...useViewer.getState(), sources: [], activeSource: '', sessionPaths: [], current: undefined, selected: [], query: '', directory: '', page: 0, mode: 'grid' as const, kind: 'model' as const, scroll: 0 };
    const merged = useViewer.persist.getOptions().merge!(saved, current);
    expect(merged).toMatchObject({ sources: [], activeSource: '', sessionPaths: [], current: undefined, selected: [], query: '', directory: '', page: 0, mode: 'grid', kind: 'model', scroll: 0, favorites: saved.favorites, exportNames: saved.exportNames, recent: saved.recent });
    expect(merged.settings.speed).toBe(2);
    const written = useViewer.persist.getOptions().partialize!(merged);
    expect(written).not.toHaveProperty('sessionPaths'); expect(written).not.toHaveProperty('activeSource'); expect(written).not.toHaveProperty('mode');
  });
  it('late preferences hydration preserves an already opened map and its current navigation', () => {
    useViewer.getState().add(source('new', 'F:/new'));
    useViewer.getState().patch({ query: 'new', page: 2 });
    const current = useViewer.getState(), merged = useViewer.persist.getOptions().merge!({ sessionPaths: ['F:/old.w3x'], activeSource: 'old', query: 'old', page: 4 }, current);
    expect(merged.sources).toBe(current.sources); expect(merged.activeSource).toBe('new'); expect(merged.query).toBe('new'); expect(merged.page).toBe(2);
  });
});
