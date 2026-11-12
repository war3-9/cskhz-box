import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { removeFolderGroup } from '../folders';
import { Modal } from '../../shared/components/Modal';
export function FolderCategoryMenu({ id, x, y, close }: { id: string; x: number; y: number; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null), [expanded, setExpanded] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false);
  useEffect(() => { const outside = (e: Event) => { if (!busy && !confirming && !ref.current?.contains(e.target as Node)) close(); }; window.addEventListener('pointerdown', outside); return () => window.removeEventListener('pointerdown', outside); }, [close, busy, confirming]);
  const remove = async (recycle: boolean) => {
    if (busy) return;
    setBusy(true); try { await removeFolderGroup(id, recycle); close(); } catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  };
  return <>{createPortal(<div ref={ref} role="menu" aria-label="分类右键菜单" className="ot-context-menu" style={{ left: Math.max(4, Math.min(x, innerWidth - 290)), top: Math.max(4, Math.min(y, innerHeight - 210)), maxWidth: 280 }} onKeyDown={e => { if (!busy && !confirming && e.key === 'Escape') close(); }}>
    <button role="menuitem" aria-haspopup="menu" aria-expanded={expanded} disabled={busy} onMouseEnter={() => setExpanded(true)} onClick={() => setExpanded(!expanded)}>删除大分类　›</button>
    {expanded && <div role="menu"><button role="menuitem" disabled={busy} onClick={() => void remove(false)}>仅移除软件关联</button><button role="menuitem" disabled={busy} onClick={() => setConfirming(true)}>文件夹及内容移入回收站</button></div>}{!confirming && error && <p role="alert">{error}</p>}
  </div>, document.body)}{confirming && <Modal title="确认移入回收站" close={() => setConfirming(false)} dismissDisabled={busy}><p>将关联文件夹及其中全部内容移入系统回收站？已用于作品的图片会保留。</p>{error && <p role="alert">{error}</p>}<div className="dialog-actions"><button disabled={busy} onClick={() => setConfirming(false)}>取消</button><button disabled={busy} onClick={() => void remove(true)}>{busy ? '处理中…' : '确认移入回收站'}</button></div></Modal>}</>;
}
