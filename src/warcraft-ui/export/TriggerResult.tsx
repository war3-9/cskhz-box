import { useEffect, useRef, useState } from 'react';
import { Copy, FolderOpen, X } from 'lucide-react';
import { invoke, isTauri } from '@tauri-apps/api/core';

export type TriggerResultState = { status: 'saving' | 'success' | 'error'; detail: string };
export function TriggerResult({ result, onClose }: { result: TriggerResultState; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState('');
  const [opening, setOpening] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { setMessage(''); }, [result]);
  const directoryName = result.detail.split(/[\\/]/).at(-1);
  const openFolder = async () => {
    setOpening(true);
    try {
      await invoke('open_lab_export_folder', { directoryName });
      setMessage('已打开导出文件夹');
    } catch (error) { setMessage(`打开文件夹失败：${String(error)}`); }
    finally { setOpening(false); }
  };
  const pending = result.status === 'saving';
  return <dialog ref={dialog} className="trigger-result" aria-labelledby="trigger-result-title" onCancel={(event) => {
    if (pending || opening) event.preventDefault(); else onClose();
  }}>
    <div className="trigger-result-heading"><h2 id="trigger-result-title">{pending ? '正在导出 T 触发' : result.status === 'success' ? 'T 触发导出成功' : 'T 触发导出失败'}</h2>
      <button title="关闭" aria-label="关闭导出结果" disabled={pending || opening} onClick={onClose}><X size={18} /></button></div>
    {result.status === 'success' ? <>
      <ul><li>war3map.wtg</li><li>war3map.wct</li></ul>
      <label>{isTauri() ? '导出目录' : '已下载文件'}<input aria-label="T 触发导出位置" readOnly value={result.detail} onFocus={(event) => event.target.select()} /></label>
      {isTauri() && <div className="trigger-result-actions"><button className="command" disabled={opening} onClick={openFolder}><FolderOpen size={16} />打开导出文件夹</button>
        <button title="复制目录路径" aria-label="复制目录路径" onClick={async () => {
          try { await navigator.clipboard.writeText(result.detail); setMessage('已复制目录路径'); }
          catch { setMessage('复制失败，请选中目录路径'); }
        }}><Copy size={18} /></button></div>}
    </> : <p>{result.detail}</p>}
    {message && <p role="status">{message}</p>}
  </dialog>;
}
