import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PanelBottomClose, X } from 'lucide-react';
import { closeApplication } from './exit';
import './closeDialog.css';

const useClosePrompt = create<{ open: boolean }>(() => ({ open: false }));
export const requestApplicationClose = () => useClosePrompt.setState({ open: true });

export function CloseDialog() {
  const open = useClosePrompt(state => state.open);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const stops: (() => void)[] = [];
    void Promise.all([
      listen('app-close-requested', requestApplicationClose),
      listen('app-exit-requested', () => { useClosePrompt.setState({ open: false }); void closeApplication(); }),
    ]).then(values => { if (disposed) values.forEach(stop => stop()); else stops.push(...values); });
    return () => { disposed = true; stops.forEach(stop => stop()); };
  }, []);
  useEffect(() => { if (open) { setError(''); ref.current?.showModal(); } else ref.current?.close(); }, [open]);
  const choose = async (tray: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (tray) await invoke('desktop_hide_to_tray');
      useClosePrompt.setState({ open: false });
      if (!tray) await closeApplication();
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };
  return <dialog ref={ref} className="close-dialog" aria-labelledby="close-dialog-title" onCancel={event => {
    event.preventDefault(); if (!busy) useClosePrompt.setState({ open: false });
  }}>
    <button type="button" className="close-dialog-dismiss" aria-label="取消关闭" disabled={busy} onClick={() => useClosePrompt.setState({ open: false })}><X size={18} /></button>
    <PanelBottomClose size={30} className="close-dialog-icon" />
    <h2 id="close-dialog-title">是否将软件放入系统托盘？</h2>
    <p>选择“是”后软件继续运行，可点击托盘图标重新打开；选择“否”退出软件。</p>
    {error && <p role="alert">{error}</p>}
    <div className="close-dialog-actions"><button type="button" disabled={busy} onClick={() => void choose(false)}>否</button>
      <button type="button" className="primary" disabled={busy} onClick={() => void choose(true)}>是</button></div>
  </dialog>;
}
