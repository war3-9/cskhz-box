import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextModelKeys, selectedModelKeys } from './categories';
import { useViewer, visibleModels } from './store';
import { resourceKey, type Source } from '../types';

const source: Source = { id: 'one', path: 'F:/models', name: 'models', kind: 'folder', complete: true, entries: [
  ...Array.from({ length: 30 }, (_, i) => ({ path: `${i}.mdx`, model: true, size: 1, anonymous: false })),
  { path: 'texture.blp', model: false, size: 1, anonymous: false },
] };
const key = (path: string) => resourceKey(source, path);
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  useViewer.setState({ sources: [source], activeSource: source.id, categoryNames: [], categories: {}, category: '', selected: [], directory: '', query: '', kind: 'model', modelUsage: 'all', sort: 'name', page: 0, status: '' });
});
describe('模型单分类与批量归属', () => {
  it('工具栏创建只新增分类，右键创建可原子应用，非法名称与数量上限不写入', () => {
    useViewer.getState().patch({ selected: [key('0.mdx')] });
    expect(useViewer.getState().createCategory('  英雄  ')).toBe('英雄');
    expect(useViewer.getState().categories).toEqual({});
    for (const name of ['', '  ', '?', '*', '全部分类', '未分类', '收藏', '英雄', '长'.repeat(101)]) {
      const before = useViewer.getState();
      expect(() => before.createCategory(name, [key('0.mdx')])).toThrow(); expect(useViewer.getState()).toBe(before);
    }
    useViewer.getState().createCategory('单位', [key('0.mdx'), key('0.mdx')]);
    expect(useViewer.getState().categories).toEqual({ [key('0.mdx')]: '单位' });
    expect(useViewer.getState().status).toContain('1 个模型');
    useViewer.setState({ categoryNames: Array.from({ length: 200 }, (_, i) => `分类${i}`) });
    expect(() => useViewer.getState().createCategory('额外')).toThrow('200');
  });
  it('已勾选目标包含跨页模型，过滤其他来源、贴图及失效键；未勾选只操作当前模型', () => {
    const selected = [key('0.mdx'), key('29.mdx'), key('texture.blp'), key('missing.mdx'), 'f:/other|0.mdx'];
    expect(contextModelKeys(source, selected, '0.mdx')).toEqual([key('0.mdx'), key('29.mdx')]);
    expect(contextModelKeys(source, selected, '1.mdx')).toEqual([key('1.mdx')]);
    expect(contextModelKeys(source, selected, 'texture.blp')).toEqual([]);
    expect(selectedModelKeys(source, selected)).toHaveLength(2);
  });
  it('替换、移出与筛选即时更新，并保留其他模型与来源的分类', () => {
    useViewer.getState().createCategory('英雄'); useViewer.getState().createCategory('单位');
    useViewer.getState().patch({ categories: { [key('0.mdx')]: '英雄', 'f:/other|0.mdx': '英雄' }, category: '英雄', page: 3 });
    expect(visibleModels(useViewer.getState()).map(e => e.path)).toEqual(['0.mdx']);
    expect(useViewer.getState().assign([key('0.mdx'), key('29.mdx')], '单位')).toBe(2);
    expect(visibleModels(useViewer.getState())).toEqual([]); expect(useViewer.getState().page).toBe(0);
    expect(useViewer.getState().categories['f:/other|0.mdx']).toBe('英雄');
    useViewer.getState().assign([key('0.mdx')], ''); expect(useViewer.getState().categories).not.toHaveProperty(key('0.mdx'));
    expect(useViewer.getState().categories[key('29.mdx')]).toBe('单位');
    expect(() => useViewer.getState().assign([key('0.mdx')], '不存在')).toThrow();
  });
  it('改名同步归属及筛选，删除只清除对应归属，原存储格式可恢复', () => {
    useViewer.getState().createCategory('英雄', [key('0.mdx')]); useViewer.getState().createCategory('单位', [key('29.mdx')]);
    useViewer.getState().patch({ category: '英雄' });
    expect(() => useViewer.getState().renameCategory('英雄', '单位')).toThrow('已存在');
    useViewer.getState().renameCategory('英雄', '  人族  ');
    expect(useViewer.getState()).toMatchObject({ category: '人族', categoryNames: ['人族', '单位'], categories: { [key('0.mdx')]: '人族' } });
    const saved = useViewer.persist.getOptions().partialize!(useViewer.getState());
    const restored = useViewer.persist.getOptions().merge!(JSON.parse(JSON.stringify(saved)), { ...useViewer.getState(), categories: {}, categoryNames: [] });
    expect(restored.categoryNames).toEqual(['人族', '单位']); expect(restored.categories[key('0.mdx')]).toBe('人族');
    useViewer.getState().deleteCategory('人族');
    expect(useViewer.getState()).toMatchObject({ category: '', categoryNames: ['单位'], categories: { [key('29.mdx')]: '单位' } });
    expect(useViewer.getState().categories).not.toHaveProperty(key('0.mdx'));
  });
});
