import { useEffect, useState } from 'react';
import { get } from 'idb-keyval';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ArchiveRestore, FolderOpen, ShieldCheck } from 'lucide-react';
import { Modal } from '../shared/components/Modal';
import { useWorkspaceRecovery, recoverWorkspace } from './recovery';
import { retryWorkspaceProtection } from './persistence';
import { getBuiltinLibrary } from '../assets/services/builtin';
import { useTasks } from '../tasks/store';
import { mergeProjectLibrary } from './mergeLibrary';
import './workspaceRecovery.css';

export function WorkspaceRecoveryDialog() {
  const { issues, protected: locked, location } = useWorkspaceRecovery();
  const [copies, setCopies] = useState<string[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [listing, setListing] = useState(isTauri);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void invoke<string[]>('workspace_recovery_list').then(value => { if (active) setCopies(value); })
      .catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setListing(false); });
    return () => { active = false; };
  }, []);
  const load = async (id?: string, filename?: string) => {
    setBusy(true); setError('');
    try {
      const key = isTauri() ? null : await get<string>('layerforge-workspace-recovery-latest');
      const raw = isTauri() ? await invoke<string>('workspace_recovery_read', { id, filename }) : key ? await get<string>(key) : undefined;
      if (!raw) throw new Error('没有可读取的恢复副本');
      const result = await recoverWorkspace(raw, getBuiltinLibrary());
      mergeProjectLibrary(result.library);
      for (const task of result.entries) useTasks.getState().open(task.document, !task.dirty);
      setError(`已打开 ${result.entries.length} 个恢复任务，原副本保留。${result.issues.join('；')}`);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const close = () => useWorkspaceRecovery.setState({ open: false });
  return <Modal title="恢复工作区" className="workspace-recovery-dialog" close={close} dismissDisabled={busy}>
    <div className="workspace-recovery-body">
      <div className="workspace-recovery-intro"><ShieldCheck size={22} aria-hidden="true" /><div><strong>从保全副本找回任务</strong>
        <p>恢复的任务会追加到当前工作区，现有作品保持不变。原始工作区、任务和素材引用仍保留在独立副本中。</p></div></div>
      {!!issues.length && <section className="workspace-recovery-issues" aria-label="恢复提示"><strong>需要留意</strong><ul>{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></section>}
      {location && <div className="workspace-recovery-location"><span>保全位置</span><code>{location}</code></div>}
      {locked && <button className="workspace-recovery-action" disabled={busy} onClick={() => { setBusy(true); void retryWorkspaceProtection().then(() => setError('数据已保全，自动保存已恢复')).catch(e => setError(String(e))).finally(() => setBusy(false)); }}>重试保全并恢复自动保存</button>}
      {listing && <p className="workspace-recovery-status" role="status">正在读取恢复副本…</p>}
      {isTauri() ? copies.map(id => <section className="workspace-recovery-copy" key={id}><div className="workspace-recovery-copy-heading"><ArchiveRestore size={18} aria-hidden="true" /><strong>恢复副本</strong><code title={id}>{id.slice(0, 12)}</code></div>
        <div className="workspace-recovery-actions">{[['工作区','workspace.json'],['滚动备份','workspace.backup.json'],['中断的保存','workspace.pending.json']].map(([label, filename]) => <button className="workspace-recovery-action" key={filename} disabled={busy} onClick={() => void load(id, filename)}>打开{label}</button>)}
        <button className="workspace-recovery-action" disabled={busy} onClick={() => void invoke('workspace_recovery_open', { id }).catch(e => setError(String(e)))}><FolderOpen size={15} aria-hidden="true" />查看原始文件</button></div></section>)
        : <button className="workspace-recovery-action" disabled={busy} onClick={() => void load()}><ArchiveRestore size={16} aria-hidden="true" />打开本地恢复副本</button>}
      {!listing && !copies.length && !error && isTauri() && <div className="workspace-recovery-empty"><span><ArchiveRestore size={28} aria-hidden="true" /></span><strong>暂无已保全副本</strong><p>完成异常工作区的数据保全后，<br />可在这里查看并恢复任务。</p></div>}
      {error && <p className="workspace-recovery-status" role="status">{error}</p>}
    </div>
    <footer className="workspace-recovery-footer"><button className="workspace-recovery-action" disabled={busy} onClick={close}>关闭</button></footer>
  </Modal>;
}
