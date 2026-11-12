import { useState } from 'react';
import { Modal } from '../../shared/components/Modal';
import { createFolderChild, createFolderGroup } from '../folders';
export function FolderCategoryDialog({ parentId, close }: { parentId?: string; close: () => void }) {
  const [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <Modal title={parentId ? '新建小分类' : '新建大分类'} close={close} dismissDisabled={busy}><form onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { if (parentId) { await createFolderChild(parentId, name.trim()); close(); } else if (await createFolderGroup()) close(); }
    catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  }}>{parentId ? <label>小分类名称<input autoFocus required maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label> : <p>请选择一个空文件夹（包括隐藏文件也必须为空），软件以文件夹名称创建大分类。以后可直接在里面建立子文件夹、放入PNG或JPG素材。</p>}
    {error && <p role="alert" className="error-text">{error}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy || !!parentId && !name.trim()}>{busy ? '处理中…' : parentId ? '创建' : '选择空文件夹'}</button></div>
  </form></Modal>;
}
