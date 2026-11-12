import { FilePlus2, FolderOpen, ImagePlus, Layers, MousePointer2, Redo2, Trash2, Type, Undo2 } from 'lucide-react';
import { Hierarchy } from './Hierarchy';
import { ExportControls } from '../export/ExportControls';
import { useLayoutStore } from '../state/layout';

export function Toolbar({ onError, onNewBlank, onSavedList, busy, hasTask }: { onError: (message: string) => void; onNewBlank: () => void; onSavedList: () => void; busy: boolean; hasTask: boolean }) {
  const state = useLayoutStore();
  const add = (kind: 'text' | 'panel' | 'background' | 'button') => state.add({
    id: crypto.randomUUID(), kind, name: '', x: 480, y: 405,
    width: 600, height: 135, color: kind === 'text' ? '#ffffff' : '#43514d',
    text: kind === 'text' ? '新文字' : kind === 'button' ? '按钮' : undefined,
    textColor: '#ffffff',
  });
  return <aside className="elements">
    <div className="creation-tools">
    <button title="新建面板" aria-label="新建面板" disabled={!hasTask} onClick={() => add('panel')}><Layers size={19} />面板</button>
    <button title="新建文字" aria-label="新建文字" disabled={!hasTask} onClick={() => add('text')}><Type size={19} />文本</button>
    <button title="新建按钮" aria-label="新建按钮" disabled={!hasTask} onClick={() => add('button')}><MousePointer2 size={19} />按钮</button>
    <button title="新建背景" aria-label="新建背景" disabled={!hasTask} onClick={() => add('background')}><ImagePlus size={19} />背景</button>
    <button title="新建空白布局" aria-label="新建空白布局" disabled={busy} onClick={onNewBlank}><FilePlus2 size={19} />新建</button>
    <button title="保存列表" aria-label="保存列表" disabled={busy} onClick={onSavedList}><FolderOpen size={19} />保存列表</button>
    </div>
    <div className="tools">
    <button title="撤销" aria-label="撤销" disabled={!state.past.length} onClick={state.undo}><Undo2 size={18} /></button>
    <button title="重做" aria-label="重做" disabled={!state.future.length} onClick={state.redo}><Redo2 size={18} /></button>
    <button title="删除元素" aria-label="删除元素" disabled={!state.selectedId} onClick={state.removeSelected}><Trash2 size={18} /></button>
    </div>
    {hasTask && <><Hierarchy /><ExportControls onMessage={onError} /></>}
  </aside>;
}
