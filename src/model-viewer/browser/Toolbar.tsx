import { StyledSelect } from '../../shared/components/StyledSelect';
import { Box, Camera, CopyCheck, Download, Grid3X3, Image, Keyboard, List, RefreshCw, Tags, Upload, Plus } from 'lucide-react';
import { useState } from 'react';
import { useViewer } from '../workspace/store';
import { openNative, chooseSource } from '../resources/providers';
import { ExportDialog } from '../export/ExportDialog';
import { CategoryDialog } from './CategoryDialog';
import { CategoryManager } from './CategoryManager';
import { viewerAction } from './shortcuts';
import { DuplicateDialog } from './DuplicateDialog';
import type { DuplicateKind } from '../resources/duplicates';
export function Toolbar() {
  const state = useViewer(), [exporting, setExporting] = useState(false), [category, setCategory] = useState(false), [creating, setCreating] = useState(false);
  const source = state.sources.find(s => s.id === state.activeSource);
  const [duplicates, setDuplicates] = useState<DuplicateKind>();
  return <><header className="viewer-toolbar">
    <button className="viewer-icon" aria-label="模型查看快捷键（F1）" title="模型查看快捷键（F1）" onClick={() => viewerAction('help')}><Keyboard size={18} /></button>
    <StyledSelect aria-label="资源类型" value={state.kind} onChange={e => state.patch({ kind: e.target.value as 'model' | 'texture' | 'terrain' | 'music', page: 0, directory: '', query: '', category: '', current: undefined, detail: false })}><option value="model">模型</option><option value="texture">贴图</option><option value="terrain">地形纹理</option><option value="music">音乐</option></StyledSelect>
    {state.kind === 'model' ? <StyledSelect aria-label="模型使用情况" title={source?.analysis?.usageNote || '仅地图支持未使用模型识别'} value={state.modelUsage} onChange={e => state.patch({ modelUsage: e.target.value as 'all' | 'unused', page: 0 })}><option value="all">全部模型</option><option value="unused" disabled={!source?.analysis?.usageSupported}>未使用模型</option></StyledSelect> : state.kind === 'music' ? null : <StyledSelect aria-label="贴图范围" value={state.settings.hideModelTextures === false ? 'all' : 'standalone'} onChange={e => { state.configure({ hideModelTextures: e.target.value !== 'all' }); state.patch({ page: 0 }); }}><option value="standalone">排除模型贴图</option><option value="all">全部贴图</option></StyledSelect>}
    <button className="viewer-icon" aria-label="重新扫描当前来源" title="重新扫描当前来源" disabled={!source || !!state.busy} onClick={() => source && !source.path.startsWith('browser:') && void openNative(source.path)}><RefreshCw size={18} /></button>
    {state.kind !== 'music' && <button className="viewer-icon" aria-label="刷新地图模型显示" title="刷新地图模型显示" disabled={!source} onClick={() => state.patch({ revision: state.revision + 1 })}><Box size={18} /></button>}
    <button className="viewer-icon" aria-label="模型查重" title="模型查重" disabled={!source || !!state.busy || state.fileBusy} onClick={() => setDuplicates('models')}><CopyCheck size={18} /></button>
    <button className="viewer-icon" aria-label="贴图查重" title="贴图查重" disabled={!source || !!state.busy || state.fileBusy} onClick={() => setDuplicates('textures')}><Image size={18} /></button>
    {state.kind !== 'music' && <><div className="viewer-size-controls" role="group" aria-label="预览尺寸">{([{ size: 'small', label: '小尺寸：每行 9 个模型', Icon: Camera }, { size: 'medium', label: '中尺寸：每行 6 个模型', Icon: Grid3X3 }, { size: 'large', label: '大尺寸：每行 3 个模型', Icon: List }] as const).map(({ size, label, Icon }) => <button key={size} className={`viewer-icon ${state.settings.cardSize === size ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={state.settings.cardSize === size} onClick={() => { state.configure({ cardSize: size }); state.patch({ mode: 'grid', detail: false }); }}><Icon size={18} /></button>)}</div>
    <input className="viewer-background" aria-label="预览背景颜色" title="预览背景颜色" type="color" value={state.settings.background} onChange={e => state.configure({ background: e.target.value })} /></>}
    <StyledSelect aria-label="模型分类" value={state.category} onChange={e => state.patch({ category: e.target.value, page: 0 })}><option value="">全部分类</option><option value="?">未分类</option><option value="*">收藏</option>{state.categoryNames.map(c => <option key={c} value={c}>{c}</option>)}</StyledSelect>
    <button className="viewer-icon viewer-category-add" title="添加模型分类" aria-label="添加模型分类" onClick={() => setCreating(true)}><Plus size={16} /></button>
    <button className="viewer-icon" aria-label="管理分类" title="管理分类" onClick={() => setCategory(true)}><Tags size={18} /></button>
    {state.kind === 'model' && <StyledSelect aria-label="全局动画" value={state.settings.action} onChange={e => state.configure({ action: e.target.value })}>{['stand', 'walk', 'attack', 'spell', 'death', 'birth'].map(action => <option key={action}>{action}</option>)}</StyledSelect>}
    <StyledSelect aria-label="排序" value={state.sort} onChange={e => state.patch({ sort: e.target.value, page: 0 })}><option value="group">{state.kind === 'music' ? '默认排序' : '单位优先'}</option><option value="name">名称 A-Z</option><option value="name-desc">名称 Z-A</option><option value="size">大小升序</option><option value="size-desc">大小降序</option><option value="type">类型 A-Z</option><option value="type-desc">类型 Z-A</option></StyledSelect>
    <button className="viewer-icon" aria-label={state.kind === 'music' ? '打开音乐' : '打开模型'} title={state.kind === 'music' ? '打开音乐' : '打开模型'} onClick={() => void chooseSource(state.kind === 'music' ? 'music' : 'model')}><Upload size={18} /></button>
    {state.kind !== 'music' && <button className="viewer-icon" aria-label="导出预览图片或动画" title="导出预览图片或动画" onClick={() => setExporting(true)} disabled={!state.current && !state.selected.length}><Download size={18} /></button>}
  </header>
  {exporting && <ExportDialog close={() => setExporting(false)} />}
  {category && <CategoryManager close={() => setCategory(false)} />}
  {creating && <CategoryDialog close={() => setCreating(false)} />}
  {duplicates && source && <DuplicateDialog key={`${source.id}:${duplicates}`} source={source} kind={duplicates} close={() => setDuplicates(undefined)} />}
  </>;
}
