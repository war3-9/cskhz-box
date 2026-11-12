import { useState } from 'react';
import { useViewer } from '../workspace/store';
import { selectedModelKeys } from '../workspace/categories';
import { CategoryDialog } from './CategoryDialog';

export function CategoryManager({ close }: { close: () => void }) {
  const state = useViewer(), [name, setName] = useState(''), [error, setError] = useState(''), [creating, setCreating] = useState(false);
  const source = state.sources.find(source => source.id === state.activeSource), keys = source ? selectedModelKeys(source, state.selected) : [];
  const run = (action: () => void) => { try { action(); setError(''); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } };
  if (creating) return <CategoryDialog close={() => setCreating(false)} />;
  return <div className="viewer-dialog-backdrop" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') close(); }}><section className="viewer-dialog" role="dialog" aria-modal="true" aria-label="管理分类">
    <h3>管理分类</h3><div className="viewer-category-edit"><input autoFocus aria-label="分类新名称" placeholder="重命名时填写新名称" maxLength={100} value={name} onChange={e => setName(e.target.value)} /><button onClick={() => setCreating(true)}>添加分类</button></div>
    <p>当前来源勾选 {keys.length} 个模型，点击分类名称应用。</p>
    {error && <p role="alert">{error}</p>}
    <div className="viewer-category-list">{state.categoryNames.map(category => <div key={category}><button disabled={!keys.length} onClick={() => run(() => { state.assign(keys, category); close(); })}>{category}</button><button aria-label={`重命名分类 ${category}`} disabled={!name.trim()} onClick={() => run(() => { state.renameCategory(category, name); setName(''); })}>重命名</button><button aria-label={`删除分类 ${category}`} onClick={() => run(() => state.deleteCategory(category))}>删除</button></div>)}</div>
    <footer><button disabled={!keys.length} onClick={() => run(() => { state.assign(keys, ''); close(); })}>清除选中分类</button><button onClick={close}>关闭</button></footer>
  </section></div>;
}
