import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X } from 'lucide-react';
import { ColorDialog } from '../dialogs/ColorDialog';
import type { PaletteDraft, PaletteTarget } from './model';
import { useObjectPreferences } from '../settings/store';
import '../../app/theme/store';
import '../workspace.css';
import '../dialogs/dialogs.css';
import './palette.css';

export function PaletteWindow() {
  const [target, setTarget] = useState<PaletteTarget | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const draft = useRef<PaletteDraft | null>(null), pending = useRef(new Map<string, { resolve: (target: PaletteTarget) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const saving = useRef<Promise<boolean> | null>(null), closeRequest = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    document.body.classList.add('object-palette-window'); const cleanup: (() => void)[] = []; let alive = true;
    const theme = (event: StorageEvent) => { if (event.key === 'box-ui-theme') document.documentElement.dataset.theme = event.newValue === 'dark' ? 'dark' : 'light'; };
    window.addEventListener('storage', theme); cleanup.push(() => window.removeEventListener('storage', theme));
    void (async () => {
      const register = async <T,>(name: string, callback: (payload: T) => void) => { const off = await listen<T>(name, e => callback(e.payload)); if (alive) cleanup.push(off); else off(); };
      await register<PaletteTarget>('object-palette-target', next => { draft.current = { target: next, value: next.raw }; setTarget(next); setError(''); });
      await register<string>('object-palette-error', setError);
      await register<void>('object-palette-close-requested', () => { void closeRequest.current(); });
      await register<string>('object-palette-snapshot', request => { void emitTo('main', 'object-palette-snapshot-result', { request, draft: draft.current }); });
      await register<PaletteTarget>('object-palette-applied', next => { if (draft.current?.target.token === next.token) { draft.current = { target: next, value: draft.current.value }; setTarget(next); } });
      await register<{ request: string; target?: PaletteTarget; error?: string }>('object-palette-result', result => {
        const request = pending.current.get(result.request); if (!request) return; clearTimeout(request.timer); pending.current.delete(result.request);
        if (result.target) request.resolve(result.target); else request.reject(new Error(result.error ?? '写入失败'));
      });
      const next = await invoke<PaletteTarget | null>('object_palette_target'); if (alive && next) { draft.current = { target: next, value: next.raw }; setTarget(next); }
      // A hidden WebView may suspend animation frames; readiness must not depend on one.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (alive) await invoke('object_palette_ready');
    })().catch(error => setError(String(error)));
    return () => { alive = false; cleanup.forEach(off => off()); for (const p of pending.current.values()) { clearTimeout(p.timer); p.reject(new Error('色板已关闭')); } pending.current.clear(); };
  }, []);
  const save = async (value: string) => {
    const token = draft.current?.target.token;
    while (saving.current) await saving.current;
    if (!draft.current || draft.current.target.token !== token) return false;
    setBusy(true); setError('');
    const request = crypto.randomUUID(), current = { target: draft.current.target, value };
    const operation = (async () => { try {
      const result = new Promise<PaletteTarget>((resolve, reject) => {
        const timer = setTimeout(() => { pending.current.delete(request); reject(new Error('主窗口未响应，文案仍保留在色板中。')); }, 5000);
        pending.current.set(request, { resolve, reject, timer });
      });
      const [, next] = await Promise.all([emitTo('main', 'object-palette-apply', { request, draft: current }), result]);
      if (draft.current?.target.token !== token) return false;
      draft.current = { target: next, value: draft.current.value }; setTarget(next); return true;
    } catch (error) { const waiting = pending.current.get(request); if (waiting) { clearTimeout(waiting.timer); pending.current.delete(request); } setError(String(error)); return false; } finally { setBusy(false); } })();
    saving.current = operation;
    try { return await operation; } finally { if (saving.current === operation) saving.current = null; }
  };
  const close = async () => {
    const token = draft.current?.target.token;
    try {
      if (saving.current) await saving.current;
      if (draft.current?.target.token !== token) return;
      if (draft.current && draft.current.value !== draft.current.target.raw && !await save(draft.current.value)) return;
      if (draft.current?.target.token !== token || (draft.current && draft.current.value !== draft.current.target.raw)) return;
      await invoke('object_palette_hide', { token });
      await emitTo('main', 'object-palette-closed', token);
    } catch (error) { setError(String(error)); }
  };
  closeRequest.current = close;
  const discard = async () => {
    const token = draft.current?.target.token;
    try {
      await invoke('object_palette_hide', { token });
      await emitTo('main', 'object-palette-discard', token);
      if (draft.current?.target.token === token) { draft.current = null; setTarget(null); setError(''); }
    } catch (error) { setError(String(error)); }
  };
  const saveAndClose = async (value: string) => {
    const token = draft.current?.target.token;
    if (await save(value) && useObjectPreferences.getState().closePaletteOnSave && draft.current?.target.token === token) await close();
  };
  return <section role="dialog" aria-modal="false" aria-label="单元格文字调色" className="ot-dialog ot-palette-shell ot-native-palette"><header onPointerDown={e => { if (e.button === 0 && !(e.target as HTMLElement).closest('button')) void getCurrentWindow().startDragging(); }}>单元格文字调色<button className="ot-window-close" aria-label="关闭色板" title="关闭色板" onClick={() => void close()}><X size={18} /></button></header>{target && <ColorDialog key={target.token} value={draft.current?.value ?? target.raw} savedValue={target.raw} title={target.title} change={value => { if (draft.current?.target.token !== target.token) return; const current = { target: draft.current.target, value }; draft.current = current; void emitTo('main', 'object-palette-draft', current); }} save={value => { void saveAndClose(value); }} />}{(error || busy) && <div role={error ? 'alert' : 'status'} className="ot-palette-status"><p>{error || '正在应用…'}</p>{error && <button className="ot-button" disabled={busy} onClick={() => void discard()}>放弃草稿并关闭</button>}</div>}</section>;
}
