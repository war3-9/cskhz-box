import { useState } from 'react';
import { FolderOpen, Save } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ConsoleCanvas } from './ConsoleCanvas';
import { useConsole } from './store';
import { useUi } from '../app/uiStore';
import { openConsoleMap } from './openMap';
import { ConsoleReplaceDialog } from './ConsoleReplaceDialog';
import { canReplacePart, replaceConsolePart } from './replacePart';
import { replacementHints } from './hoverParts';
import { changedConsoleLayers, saveConsoleMap } from './saveMap';
import { isFontTarget } from './fontTypes';
import { replaceConsoleFont } from './fonts';
import './replacement.css';

export function UiReplacementPage({ active }: { active: boolean }) {
  const state = useConsole();
  const [choosing, setChoosing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const disabled = state.busy || choosing;
  async function saveMap() {
    if (disabled) return;
    try {
      const result = await saveConsoleMap();
      if (result) useUi.getState().notify(`地图已保存，原文件备份：${result.backup}`, 'success');
    } catch (error) { useUi.getState().notify(String(error), 'error'); }
  }
  async function chooseTexture(id: string) {
    const font = isFontTarget(id);
    if (disabled || !state.map || !(font || canReplacePart(id))) return;
    if (!isTauri()) { useUi.getState().notify('请在桌面版选择贴图文件', 'error'); return; }
    const map = state.map;
    setChoosing(true);
    try {
      const path = await open({ title: font ? '更换全地图原生界面字体（建议包含中文）' : replacementHints[id], multiple: false,
        filters: font ? [{ name: 'TrueType 字体', extensions: ['ttf'] }]
          : [{ name: '贴图文件', extensions: ['blp', 'tga', 'dds', 'png', 'jpg', 'jpeg'] }] });
      if (typeof path !== 'string') return;
      if (useConsole.getState().map !== map)
        throw new Error('当前地图已变化，请重新选择');
      if (font) {
        const chinese = await replaceConsoleFont(path);
        useUi.getState().notify(chinese ? '全局字体已预览，点击“保存地图”写入地图'
          : '全局字体已预览；该字体缺少部分常用中文字，中文界面可能缺字。点击“保存地图”写入地图', 'success');
      } else {
        await replaceConsolePart(id, path);
        useUi.getState().notify('贴图已替换并显示在画布中', 'success');
      }
    } catch (error) { useUi.getState().notify(String(error), 'error'); }
    finally { setChoosing(false); }
  }
  async function chooseMap() {
    if (disabled) return;
    if (!isTauri()) { useUi.getState().notify('请在桌面版打开魔兽地图', 'error'); return; }
    setChoosing(true);
    try {
      const path = await open({ title: '打开魔兽地图', multiple: false,
        filters: [{ name: '魔兽争霸 III 地图', extensions: ['w3x', 'w3m'] }] });
      if (typeof path !== 'string') return;
      await openConsoleMap(path);
    } catch (error) { useUi.getState().notify(String(error), 'error'); }
    finally { setChoosing(false); }
  }
  return <main className="ui-replacement" aria-label="魔兽UI替换">
    <header className="console-toolbar">
      <div className="console-tools" role="toolbar" aria-label="魔兽UI替换操作">
        <button className="secondary console-action" aria-label="打开地图" title={state.map?.path ?? '选择魔兽地图'}
          disabled={disabled} onClick={() => void chooseMap()}><FolderOpen size={16} />{disabled ? '正在读取…' : '打开地图'}
          {state.map && <span className="console-map-name">{state.map.name}</span>}</button>
      <button className="secondary console-action console-save" aria-label="保存地图" title={state.map?.path ?? '请先打开地图'}
        disabled={disabled || !state.map || !changedConsoleLayers(state.layers, state.savedLayers).length}
        onClick={() => void saveMap()}><Save size={16} />保存地图</button>
      </div>
    </header>
    <ConsoleCanvas active={active && !replacing && !disabled} onReplace={id => {
      if (disabled || !state.map) return;
      if (id === 'console') setReplacing(true);
      else void chooseTexture(id);
    }} onReset={id => { if (!disabled && state.map) state.resetPart(id); }} />
    {replacing && <ConsoleReplaceDialog close={() => setReplacing(false)} />}
  </main>;
}
