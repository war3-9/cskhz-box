import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, X } from 'lucide-react';
import { useViewer } from '../workspace/store';
import { defaultCaptureFrame, resizeCaptureFrame } from './captureFrame';

export function CaptureSettings({ close }: { close: () => void }) {
  const state = useViewer(), panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  const choose = async () => {
    try {
      const directory = await open({ directory: true, multiple: false, title: '选择 PNG 保存目录', defaultPath: state.captureDirectory || undefined });
      if (typeof directory === 'string') state.patch({ captureDirectory: directory });
    } catch (error) { state.patch({ error: `PNG 目录设置失败：${String(error)}` }); }
  };
  const resize = (width: number, height: number) => state.patch({ captureFrame: resizeCaptureFrame(state.captureFrame, width, height) });
  return <div className="viewer-dialog-backdrop">
    <section ref={panel} tabIndex={-1} className="viewer-dialog viewer-capture-settings" role="dialog" aria-modal="true" aria-labelledby="viewer-capture-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header><h3 id="viewer-capture-title">PNG 截图设置</h3><button className="viewer-icon" title="关闭" aria-label="关闭 PNG 截图设置" onClick={close}><X size={17} /></button></header>
      <div className="viewer-capture-path"><span>保存目录</span><output title={state.captureDirectory}>{state.captureDirectory || (isTauri() ? '未设置，生成时选择保存位置' : '浏览器下载目录')}</output></div>
      {isTauri() && <div className="viewer-capture-actions"><button onClick={() => void choose()}><FolderOpen size={16} />选择目录</button>{state.captureDirectory && <button onClick={() => state.patch({ captureDirectory: '' })}>每次选择位置</button>}</div>}
      <label>截图宽度 <output>{Math.round(state.captureFrame.width * 100)}%</output><input aria-label="截图宽度" type="range" min="20" max="100" value={Math.round(state.captureFrame.width * 100)} onChange={event => resize(Number(event.target.value) / 100, state.captureFrame.height)} /></label>
      <label>截图高度 <output>{Math.round(state.captureFrame.height * 100)}%</output><input aria-label="截图高度" type="range" min="20" max="100" value={Math.round(state.captureFrame.height * 100)} onChange={event => resize(state.captureFrame.width, Number(event.target.value) / 100)} /></label>
      <p>拖动红框上方的移动柄调整位置，拖动右下角调整大小。PNG 保留当前背景、视角和动作，只保存红框内画面。</p>
      <footer><button onClick={() => state.patch({ captureFrame: { ...defaultCaptureFrame } })}>恢复默认范围</button><button onClick={close}>完成</button></footer>
    </section>
  </div>;
}
