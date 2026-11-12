import { StyledSelect } from '../shared/components/StyledSelect';
import { useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ArrowUpDown, FileOutput, FilePlus2, LockKeyholeOpen, Mountain, RotateCcw, Save, Undo2, X } from 'lucide-react';
import { MapCanvas } from './MapCanvas';
import { defaultOptions, useTerrainClone } from './store';
import type { CopyOption, TerrainMapInfo } from './types';
import { useFeatureActive } from '../app/FeatureActivity';
import { openMapPath } from './openMap';
import { useNativeMapDrop } from './useNativeMapDrop';
import { heightSelection, worldPlacement, worldSelection } from './worldCoordinates';
import './terrain-clone.css';

const copyOptions: ReadonlyArray<[CopyOption, string]> = [
  ['terrain', '地形'], ['groundArt', '地面纹理'], ['cliffArt', '悬崖类型'], ['doodads', '装饰物'], ['units', '单位/物品'],
  ['paths', '寻路'], ['shadows', '阴影'], ['regions', '区域'], ['objectData', '物编合并'],
];

async function chooseMap(title: string): Promise<string | null> {
  if (!isTauri()) throw new Error('地图读写需要在桌面版中运行');
  const path = await open({ title, multiple: false, filters: [{ name: '魔兽争霸 III 地图', extensions: ['w3x', 'w3m'] }] });
  return typeof path === 'string' ? path : null;
}

export function TerrainClonePage() {
  const active = useFeatureActive();
  const state = useTerrainClone();
  const [heightDelta, setHeightDelta] = useState(0);
  const [exportScope, setExportScope] = useState<'selection' | 'all'>('selection');
  const undoSteps = state.target?.undoSteps ?? Number(!!state.target?.canUndo);
  const selectedCount = useMemo(() => {
    const selection = state.selection;
    if (!selection) return 0;
    return selection.mask ? selection.mask.reduce((sum, cell) => sum + Number(cell), 0) : (selection.x1 - selection.x0 + 1) * (selection.y1 - selection.y0 + 1);
  }, [state.selection]);

  const openSide = async (side: 'source' | 'target', title?: string) => {
    state.setBusy(true); state.notify('');
    try {
      const path = await chooseMap(title ?? (side === 'source' ? '打开源地图' : '打开目标地图'));
      if (!path) return;
      await openMapPath(side, path);
    } catch (error) { state.notify(String(error)); }
    finally { state.setBusy(false); }
  };

  useNativeMapDrop(active);

  const clone = async () => {
    if (useTerrainClone.getState().busy) return;
    if (!state.source || !state.target || !state.selection || !state.placement) { state.notify('请先打开两张地图，框选源区域并在目标地图放置。'); return; }
    state.setBusy(true); state.notify('');
    try {
      const result = await invoke<{ changedTilepoints: number; log: string[]; target: TerrainMapInfo }>('terrain_clone_copy_region', {
        sourceId: state.source.id, targetId: state.target.id, selection: worldSelection(state.selection, state.source),
        destination: worldPlacement(state.placement, state.selection, state.target.height), options: state.options,
      });
      state.setMap('target', result.target); state.addLog(result.log); state.notify(`地形复制完成，共 ${result.changedTilepoints} 个 tilepoint。`);
    } catch (error) { state.notify(String(error)); state.addLog([`复制失败：${String(error)}`]); }
    finally { state.setBusy(false); }
  };

  const undo = async () => {
    if (!state.target || !state.target.canUndo || useTerrainClone.getState().busy) return;
    state.setBusy(true);
    try { const target = await invoke<TerrainMapInfo>('terrain_clone_undo', { mapId: state.target.id }); state.setMap('target', target); state.addLog([`已撤销最近一次操作，剩余 ${target.undoSteps ?? Number(target.canUndo)} 步可撤销`]); }
    catch (error) { state.notify(String(error)); }
    finally { state.setBusy(false); }
  };

  const adjustHeight = async () => {
    if (!state.source || !state.target || !state.selection || !state.placement || !heightDelta) return;
    state.setBusy(true); state.notify('');
    try {
      const rect = heightSelection(state.selection, state.placement, state.source, state.target);
      const target = await invoke<TerrainMapInfo>('terrain_clone_adjust_height', {
        mapId: state.target.id, rect, destination: [rect.x0, rect.y0], deltaWorld: heightDelta,
      });
      state.setMap('target', target); state.addLog([`目标选区高度调整 ${heightDelta > 0 ? '+' : ''}${heightDelta} 世界单位`]);
      state.notify('高度调整完成。');
    } catch (error) { state.notify(String(error)); }
    finally { state.setBusy(false); }
  };

  useEffect(() => {
    if (!active) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && state.target?.canUndo) {
        event.preventDefault(); void undo();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [active, state.target?.canUndo, undo]);

  const saveMap = async () => {
    if (!state.target) { state.notify('请先打开目标地图。'); return; }
    try {
      let path = state.target.path;
      if (state.target.blank) {
        const suggested = state.target.path.replace(/(\.w3[xm])$/i, '-地形克隆$1');
        const selected = await save({ title: '保存克隆后的地图', defaultPath: suggested, filters: [{ name: '魔兽争霸 III 地图', extensions: ['w3x', 'w3m'] }] });
        if (!selected) return;
        path = selected;
      }
      state.setBusy(true);
      const output = await invoke<string>('terrain_clone_save_map', { mapId: state.target.id, destination: path });
      state.setMap('target', { ...state.target, path: output, name: output.split(/[\\/]/).pop() ?? state.target.name, dirty: false, canUndo: false, undoSteps: 0, blank: false });
      state.addLog([`目标地图已保存：${output}`]); state.notify('目标地图已保存。可用编辑器重新打开该文件。');
    } catch (error) { state.notify(String(error)); }
    finally { state.setBusy(false); }
  };

  const exportTable = async () => {
    const map = state.source;
    if (useTerrainClone.getState().busy) return;
    if (!map) { state.notify('请先打开源地图。'); return; }
    const selection = exportScope === 'selection' && state.selection ? worldSelection(state.selection, map) : null;
    const scope = selection ? '选区' : '全图';
    state.setBusy(true); state.notify('');
    try {
      const path = await save({ title: `导出${scope}地形表`, defaultPath: map.name.replace(/\.[^.]+$/, `-${scope}地形表.txt`), filters: [{ name: '文本文件', extensions: ['txt'] }] });
      if (!path) return;
      const text = await invoke<string>('terrain_clone_export_table', { mapId: map.id, selection });
      await invoke('write_file', { path, bytes: Array.from(new TextEncoder().encode(text)) });
      state.addLog([`${scope}地形表已导出：${path}`]); state.notify(`${scope}地形表导出完成。`);
    } catch (error) { state.notify(String(error)); }
    finally { state.setBusy(false); }
  };

  const saveLog = async () => {
    try {
      const path = await save({ title: '保存操作日志', defaultPath: '地形克隆日志.txt', filters: [{ name: '文本文件', extensions: ['txt'] }] });
      if (!path) return;
      await invoke('write_file', { path, bytes: Array.from(new TextEncoder().encode(state.log.join('\r\n'))) });
      state.notify('操作日志已保存。');
    } catch (error) { state.notify(String(error)); }
  };

  const newBlank = async () => {
    if (!state.source) { state.notify('请先打开一张源地图，作为空白地图模板。'); return; }
    state.setBusy(true); state.notify('');
    try {
      const blank = await invoke<TerrainMapInfo>('terrain_clone_new_blank', { templateId: state.source.id });
      if (state.target) await invoke('terrain_clone_close_map', { mapId: state.target.id });
      state.setMap('target', blank); state.setPlacement(null); state.addLog(['已根据源地图创建空白目标地图模板。']);
    } catch (error) { state.notify(String(error)); }
    finally { state.setBusy(false); }
  };
  const clearSelection = () => { state.setSelection(null); state.setPlacement(null); };
  const resetViews = () => document.querySelectorAll<HTMLCanvasElement>('.terrain-map-canvas').forEach(canvas => canvas.dispatchEvent(new Event('terrain-fit')));

  return <main className="terrain-clone-page" aria-label="地形克隆">
    <div className="terrain-toolbar" aria-label="地图操作">
      <div className="terrain-toolbar-group terrain-file-group">
        <button className="terrain-button terrain-open" disabled={state.busy} onClick={() => void openSide('source')}><Mountain size={15} />打开源地图</button>
        <button className="terrain-button terrain-encrypt" disabled={state.busy} title="打开已兼容的保护地图；未知保护格式会提示错误" onClick={() => void openSide('source', '打开兼容的保护地图')}><LockKeyholeOpen size={14} />加密图</button>
        <span className="terrain-file-name" title={state.source?.path}>{state.source?.name ?? '未选择'}</span>
      </div>
      <div className="terrain-toolbar-group terrain-file-group">
        <button className="terrain-button terrain-open" disabled={state.busy} onClick={() => void openSide('target')}><Mountain size={15} />打开目标地图</button>
        <button className="terrain-button terrain-new" disabled={state.busy} onClick={newBlank}><FilePlus2 size={15} />新建空白</button>
        <span className="terrain-file-name" title={state.target?.path}>{state.target?.name ?? '未选择'}</span>
      </div>
      <div className="terrain-toolbar-group terrain-action-group">
        <button className="terrain-button terrain-muted" disabled={state.busy || !state.selection || !state.placement} onClick={() => void clone()}>执行复制</button>
        <button className="terrain-button terrain-muted" title="撤销未保存的复制或高度调整，最多20步；保存后清空撤销记录" disabled={state.busy || !state.target?.canUndo} onClick={() => void undo()}><Undo2 size={15} />撤销 Ctrl+Z{undoSteps ? `（${undoSteps}/20）` : ''}</button>
        <button className="terrain-button terrain-muted" disabled={state.busy || !state.target?.dirty} onClick={() => void saveMap()}><Save size={15} />保存地图</button>
      </div>
      <div className="terrain-toolbar-group terrain-final-group">
        <button className="terrain-button terrain-danger" disabled={!state.selection} onClick={clearSelection}><X size={15} />取消选区</button>
        <button className="terrain-button terrain-purple" onClick={resetViews}><RotateCcw size={15} />重置视图</button>
        <StyledSelect aria-label="地形表导出范围" disabled={state.busy || !state.source} value={state.selection ? exportScope : 'all'} onChange={event => setExportScope(event.target.value as 'selection' | 'all')}><option value="selection" disabled={!state.selection}>当前选区</option><option value="all">全图</option></StyledSelect>
        <button className="terrain-button terrain-teal" disabled={state.busy || !state.source} onClick={() => void exportTable()}><FileOutput size={15} />导出地形表</button>
      </div>
    </div>

    <div className="terrain-options-row">
      <span className="terrain-options-label">选区模式:</span>
      <label><input type="radio" name="terrain-mode" checked={state.mode === 'rectangle'} onChange={() => state.setMode('rectangle')} />矩形框选</label>
      <label><input type="radio" name="terrain-mode" checked={state.mode === 'paint'} onChange={() => state.setMode('paint')} />涂鸦自由选区</label>
      <span className="terrain-control-divider" />
      <label className="terrain-number-control">笔刷: <input aria-label="笔刷大小" type="number" min={1} max={99} value={state.brush} onChange={event => state.setBrush(Number(event.target.value))} /></label>
      <label>形状: <StyledSelect aria-label="笔刷形状" value={state.shape} onChange={event => state.setShape(event.target.value as 'square' | 'circle')}><option value="square">square</option><option value="circle">circle</option></StyledSelect></label>
      <label><input type="checkbox" checked={state.eraser} onChange={event => state.setEraser(event.target.checked)} />橡皮擦</label>
      <span className="terrain-control-divider" />
      <label className="terrain-number-control">高度调整: <input aria-label="高度调整世界单位" type="number" min={-8192} max={8192} step={32} value={heightDelta} onChange={event => setHeightDelta(Number(event.target.value))} /></label>
      <button className="terrain-text-action terrain-height-action" disabled={state.busy || !state.target || !state.selection || !state.placement || !heightDelta} onClick={() => void adjustHeight()}><ArrowUpDown size={13} />应用高度</button>
      <span className="terrain-hint">{state.mode === 'rectangle' ? '左键框选；框内拖动；八点缩放' : '左键涂抹（按住 Ctrl 临时擦除）'}；右键平移；滚轮缩放</span>
    </div>

    <div className="terrain-options-row terrain-copy-row">
      <span className="terrain-options-label">复制内容:</span>
      {copyOptions.map(([id, label]) => <label key={id} title={id === 'objectData' ? '仅合并本次复制的单位、物品和装饰物定义；未选类别与选区外对象不合并' : undefined}><input type="checkbox" checked={state.options[id]} onChange={event => state.setOption(id, event.target.checked)} />{label}</label>)}
      <label title="只替换目标地图全局 Cliff0/Cliff1 两张悬崖贴图，不控制模型/贴图/音频资源复制；会影响整张目标地图的悬崖。检测到自定义悬崖模型时会跳过，避免贴图错位。"><input type="checkbox" checked={state.options.nativeCliffs} onChange={event => state.setOption('nativeCliffs', event.target.checked)} />恢复游戏原版悬崖贴图（整张目标图）</label>
      <label title="复制源地图中的全部模型、贴图和音频资源"><input type="checkbox" checked={state.options.allResources} onChange={event => state.setOption('allResources', event.target.checked)} />全部模型</label>
      <span className="terrain-control-divider" />
      <button className="terrain-text-action" onClick={() => { for (const option of Object.keys(defaultOptions) as CopyOption[]) state.setOption(option, true); }}>全选</button>
      <button className="terrain-text-action" onClick={() => { for (const option of Object.keys(defaultOptions) as CopyOption[]) state.setOption(option, false); }}>全不选</button>
      <span className="terrain-hint">资源冲突时以源地图同名资源覆盖；保存地图会写回当前目标文件</span>
    </div>

    {state.message && <div className="terrain-stage-message" role="status">{state.message}<button aria-label="关闭提示" onClick={() => state.notify('')}><X size={14} /></button></div>}

    <div className="terrain-map-grid">
      <section className="terrain-map-pane terrain-map-source" aria-label="源地图">
        <header className="terrain-map-heading"><strong>源地图</strong><span>拖入 .w3x/.w3m 加载；白色圆点：装饰物；框内拖动 / 八点缩放</span></header>
        <MapCanvas side="source" disabled={state.busy} map={state.source} mode={state.mode} brush={state.brush} shape={state.shape} eraser={state.eraser} selection={state.selection} placement={state.placement} onSelection={state.setSelection} onPlacement={state.setPlacement} onOpen={() => void openSide('source')} />
      </section>
      <section className="terrain-map-pane terrain-map-target" aria-label="目标地图">
        <header className="terrain-map-heading"><strong>目标地图</strong><span>拖入 .w3x/.w3m 加载；左键设置放置位置；右键平移 / 滚轮缩放</span></header>
        <MapCanvas side="target" disabled={state.busy} sourceSize={state.source ? [state.source.width, state.source.height] : undefined} map={state.target} mode={state.mode} brush={state.brush} shape={state.shape} eraser={state.eraser} selection={state.selection} placement={state.placement} onSelection={state.setSelection} onPlacement={state.setPlacement} onOpen={() => void openSide('target')} />
      </section>
    </div>

    <div className="terrain-selection-status"><span>选区: {state.selection ? `${selectedCount} 个 tilepoint` : '无'}</span><span>放置: {state.placement ? `${state.placement[0]}, ${state.placement[1]}` : '无'}</span></div>
    <section className="terrain-log" aria-label="操作日志">
      <header className="terrain-log-heading"><span>操作日志</span><div><button className="terrain-button terrain-teal" disabled={!state.log.length} onClick={() => void saveLog()}>保存日志</button><button className="terrain-button terrain-log-clear" onClick={state.clearLog}>清空</button></div></header>
      <textarea aria-label="操作日志内容" value={state.log.join('\n')} readOnly spellCheck={false} />
    </section>
  </main>;
}
