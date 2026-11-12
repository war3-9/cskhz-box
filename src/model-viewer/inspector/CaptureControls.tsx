import { useState, type MutableRefObject } from 'react';
import { Settings } from 'lucide-react';
import { useViewer } from '../workspace/store';
import { CaptureSettings } from './CaptureSettings';
import { saveCapture } from './saveCapture';

export function CaptureControls({ captureRef, name, enabled }: { captureRef: MutableRefObject<(() => Promise<Blob>) | undefined>; name: string; enabled: boolean }) {
  const [settings, showSettings] = useState(false), [busy, setBusy] = useState(false);
  const generate = async () => {
    if (!captureRef.current || busy) return;
    setBusy(true);
    const state = useViewer.getState();
    try {
      const blob = await captureRef.current();
      const path = await saveCapture(blob, name, state.captureDirectory);
      if (path) state.patch({ status: `PNG 已保存：${path}`, error: '' });
    } catch (failure) { state.patch({ error: `PNG 生成失败：${String(failure)}` }); }
    finally { setBusy(false); }
  };
  return <>
    <button title="生成 PNG" aria-label="生成 PNG" disabled={!enabled || busy} onClick={() => void generate()}>{busy ? '生成中' : '生成 PNG'}</button>
    <button className="viewer-capture-settings-button" title="PNG 截图设置" aria-label="PNG 截图设置" onClick={() => showSettings(true)}><Settings size={16} /></button>
    {settings && <CaptureSettings close={() => showSettings(false)} />}
  </>;
}
