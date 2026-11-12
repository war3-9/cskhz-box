import { useState } from 'react';
import { FolderOpen, Map } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Modal } from '../shared/components/Modal';
import { useUi } from '../app/uiStore';
import { consoleTextures } from './native';
import { replaceConsoleFromSource, type ConsoleSourceKind } from './replaceConsole';

export function ConsoleReplaceDialog({ close }: { close: () => void }) {
  const [busy, setBusy] = useState(false);
  async function choose(kind: ConsoleSourceKind) {
    if (busy) return;
    if (!isTauri()) { useUi.getState().notify('请在桌面版选择替换素材', 'error'); return; }
    setBusy(true);
    try {
      const path = await open(kind === 'folder'
        ? { title: '选择包含控制台6张贴图的文件夹', directory: true, multiple: false }
        : { title: '选择提供控制台的地图', multiple: false,
          filters: [{ name: '魔兽争霸 III 地图', extensions: ['w3x', 'w3m'] }] });
      if (typeof path !== 'string') return;
      const result = await replaceConsoleFromSource(path, kind);
      useUi.getState().notify(kind === 'map' && result.overrides === 0
        ? '该地图未自定义控制台，已在画布显示原生控制台' : '控制台已替换并显示在画布中', 'success');
      close();
    } catch (error) { useUi.getState().notify(String(error), 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title="替换控制台" close={close} dismissDisabled={busy} className="console-replace-dialog">
    <div className="console-replace-options">
      <button type="button" className="secondary" disabled={busy} onClick={() => void choose('folder')} aria-label="文件夹">
        <FolderOpen size={32} /><strong>文件夹</strong>
        <span>文件夹必须包含控制台6张贴图；菜单按钮贴图可选，缺少则用原生。</span>
        <small>尽量选取和原生尺寸相同的贴图。</small>
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => void choose('map')} aria-label="地图">
        <Map size={32} /><strong>地图</strong>
        <span>控制台与左上四菜单一起替换；地图缺少菜单贴图时使用原生按钮。</span>
        <small>尽量选取和原生尺寸相同的贴图。</small>
      </button>
    </div>
    <details className="console-replace-files"><summary>6张贴图名称与原生尺寸</summary>
      {consoleTextures.map(texture => <div key={texture.id}>{texture.id}（{texture.textureWidth} × {texture.textureHeight}）</div>)}
      <p>四菜单可选图集：human-console-buttonstates2。按文件名匹配，支持 BLP、TGA、DDS、PNG、JPG；地图缺失的部分使用原生贴图。</p>
    </details>
    {busy && <p role="status">正在读取，请稍候…</p>}
  </Modal>;
}
