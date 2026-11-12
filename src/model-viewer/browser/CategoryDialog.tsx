import { useState } from 'react';
import { useViewer } from '../workspace/store';

export function CategoryDialog({ close, keys = [] }: { close: () => void; keys?: string[] }) {
  const [name, setName] = useState(''), [error, setError] = useState('');
  const create = () => {
    try { useViewer.getState().createCategory(name, keys); close(); }
    catch (error) { setError(String(error instanceof Error ? error.message : error)); }
  };
  return <div className="viewer-dialog-backdrop" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } }}><form className="viewer-dialog" role="dialog" aria-modal="true" aria-label="添加模型分类" onSubmit={e => { e.preventDefault(); create(); }}>
    <h3>添加模型分类</h3><label>分类名称<input autoFocus aria-label="分类名称" maxLength={100} value={name} onChange={e => { setName(e.target.value); setError(''); }} /></label>
    {keys.length > 0 && <p>创建后应用到 {keys.length} 个模型</p>}
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" onClick={close}>取消</button><button type="submit">{keys.length ? '创建并应用' : '创建分类'}</button></footer>
  </form></div>;
}
