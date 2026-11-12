import { useEffect, useState } from 'react';
import { Modal } from '../../shared/components/Modal';
import { deleteDesign, designDirectory, listDesigns, useDesignLibrary } from './library';
import type { DesignMeta } from './types';

export function SavedList({ close, open }: { close: () => void; open: (id: string, done: () => void) => void }) {
  const [designs, setDesigns] = useState<DesignMeta[]>([]);
  const [directory, setDirectory] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<DesignMeta | null>(null);
  const busy = useDesignLibrary(state => state.busy);
  const refresh = async () => {
    setError(''); setLoading(true);
    try { const [files, info] = await Promise.all([listDesigns(), designDirectory()]); setDesigns(files); setDirectory(info.directory); }
    catch (error) { setError(String(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const remove = async () => {
    if (!deleting) return;
    try { await deleteDesign(deleting.id); setDeleting(null); await refresh(); }
    catch (error) { setError(String(error)); }
  };
  return <><Modal title="保存列表" close={() => { if (!busy) close(); }} className="ui-design-dialog ui-design-list">
    <p className="ui-design-path">保存目录：{directory || '正在读取…'}</p>
    <p>点击“打开”继续设计；保存路径可在 UI 设置中修改。</p>
    {error && <p role="alert" className="ui-unsaved">{error}</p>}
    {loading ? <p>正在读取保存稿…</p> : !designs.length ? <p>还没有保存的 UI 设计。</p> :
      <div className="ui-design-rows">{designs.map(design => <div className="ui-design-row" key={design.id}>
        <div><strong>{design.name}</strong><time>{new Date(design.updatedAt).toLocaleString('zh-CN')}</time></div>
        <button disabled={busy} onClick={() => open(design.id, close)}>打开</button>
        <button className="ui-delete" disabled={busy} onClick={() => setDeleting(design)}>删除</button>
      </div>)}</div>}
    <div className="dialog-actions"><button disabled={busy || loading} onClick={() => void refresh()}>刷新列表</button><button disabled={busy} onClick={close}>关闭</button></div>
  </Modal>{deleting && <Modal title="删除保存稿" close={() => { if (!busy) setDeleting(null); }} className="ui-design-dialog">
    <p>确定删除保存稿“{deleting.name}”吗？</p><p className="ui-unsaved">删除后无法恢复，当前画布仍会保留。</p>
    {error && <p role="alert">{error}</p>}
    <div className="dialog-actions"><button disabled={busy} onClick={() => setDeleting(null)}>取消</button>
      <button className="ui-delete" disabled={busy} onClick={() => void remove()}>{busy ? '正在删除…' : '确认删除'}</button></div>
  </Modal>}</>;
}
