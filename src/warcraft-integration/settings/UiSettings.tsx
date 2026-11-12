import { useEffect } from 'react';
import { X } from 'lucide-react';
import './settings.css';
import { DesignDirectorySettings } from './DesignDirectorySettings';
import { useDesignLibrary } from '../../warcraft-ui/tasks/library';

export function UiSettings({ close }: { close: () => void }) {
  const busy = useDesignLibrary(state => state.busy);
  const requestClose = () => { if (!busy) close(); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); if (!busy) close(); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [busy, close]);
  return <div className="box-ui-settings-overlay">
    <section className="box-ui-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="box-ui-settings-title">
      <header><h2 id="box-ui-settings-title">UI 设置</h2><button aria-label="关闭 UI 设置" disabled={busy} onClick={requestClose}><X size={18} /></button></header>
      <DesignDirectorySettings />
      <footer><button disabled={busy} onClick={requestClose}>关闭</button></footer>
    </section>
  </div>;
}
