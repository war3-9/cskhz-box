import { useEffect } from 'react';
import { resourceKey } from '../types';
import { useViewer, visibleModels } from '../workspace/store';
import { selectResource } from '../workspace/selection';
import { chooseSource, openNative } from '../resources/providers';
import { copyModelFiles } from '../resources/fileClipboard';
import { clipboardModelPaths, hoveredClipboardModel } from './clipboardTargets';

export type ViewerAction = 'delete' | 'import' | 'rename' | 'export' | 'help';
export const shortcutRows = [
  ['单击 / 双击', '选择模型 / 打开单独预览'], ['Ctrl + 左键', '追加或取消选择'], ['Shift + 左键', '连续选择'],
  ['左键拖动', '框选；Shift 追加，Ctrl 反选'], ['Ctrl + A / Ctrl + Shift + A', '全选当前筛选结果 / 全不选'],
  ['Ctrl + I', '反选当前筛选结果'], ['方向键 / Home / End', '移动选择；Shift 扩展选择'], ['PageUp / PageDown', '上一页 / 下一页'],
  ['Enter', '打开选中模型的单独预览'], ['Space', '列表勾选当前模型；预览播放或暂停'], ['Delete', '确认删除选中资源'],
  ['Ctrl + E / F2', '导出选中 / 批量重命名'], ['Ctrl + C', '复制选中模型和贴图文件；未选时复制鼠标悬停模型'], ['Ctrl + Shift + C', '复制选中资源的相对路径'],
  ['Ctrl + O / Ctrl + Shift + O', '打开模型 / 打开地图'], ['Ctrl + F / F5', '搜索 / 重新扫描'],
  ['Escape', '取消框选、返回浏览或清空选择'], ['F1', '查看快捷键'],
];
export function viewerAction(action: ViewerAction) { window.dispatchEvent(new CustomEvent('viewer-action', { detail: action })); }
export function useViewerShortcuts(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const keyboard = (event: KeyboardEvent) => {
      if ((event.defaultPrevented && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) || (event.target as HTMLElement).closest('input:not([type=checkbox]),select,textarea,[contenteditable],[role=menu],[role=dialog]') || document.querySelector('.viewer-shell [role=dialog],.viewer-context-menu')) return;
      const state = useViewer.getState(); if (state.fileBusy || state.busy) return;
      const ctrl = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
      const source = state.sources.find(source => source.id === state.activeSource), entries = visibleModels(state);
      const keys = source ? entries.map(entry => resourceKey(source, entry.path)) : [];
      const action = (name: ViewerAction) => { event.preventDefault(); viewerAction(name); };
      if (event.key === 'F1' || event.key === '?') return action('help');
      if (ctrl && key === 'o') { event.preventDefault(); void chooseSource(event.shiftKey ? 'map' : 'model'); return; }
      if (ctrl && key === 'f') { event.preventDefault(); document.querySelector<HTMLInputElement>('.viewer-search input')?.focus(); return; }
      if (event.key === 'F5') { event.preventDefault(); if (source && !source.path.startsWith('browser:')) void openNative(source.path, true); return; }
      if (ctrl && key === 'e') return action('export');
      if (event.key === 'F2') return action('rename');
      if (event.key === 'Delete') return action('delete');
      if (ctrl && key === 'c') {
        event.preventDefault();
        if (event.shiftKey) {
          const paths = source?.entries.filter(entry => state.selected.includes(resourceKey(source, entry.path))).map(entry => entry.path) || [];
          if (paths.length) void navigator.clipboard.writeText(paths.join('\n')).catch(error => state.patch({ error: String(error) }));
        } else if (source) {
          const hovered = hoveredClipboardModel(source.id);
          const paths = clipboardModelPaths(source, state.selected, hovered || (state.detail ? state.current?.path : undefined));
          if (paths.length) void copyModelFiles(source, paths).catch(error => state.patch({ error: String(error) }));
          else state.patch({ status: '请先勾选模型，或将鼠标移到要复制的模型上' });
        }
        return;
      }
      if (ctrl && key === 'a') { event.preventDefault(); state.patch({ selected: event.shiftKey ? [] : [...new Set([...state.selected, ...keys])] }); return; }
      if (ctrl && key === 'i') { event.preventDefault(); state.patch({ selected: [...state.selected.filter(key => !keys.includes(key)), ...keys.filter(key => !state.selected.includes(key))] }); return; }
      if (event.key === 'Escape') { event.preventDefault(); state.patch(state.detail ? { detail: false } : state.mode === 'exhibit' ? { mode: 'grid' } : { selected: [], current: undefined }); return; }
      if (event.code === 'Space') {
        if ((event.target as HTMLElement).matches('input[type=checkbox]')) return;
        event.preventDefault(); if (state.detail || state.mode === 'exhibit') state.patch({ playing: !state.playing });
        else if (state.current && source) state.toggle(resourceKey(source, state.current.path)); return;
      }
      if (event.key === 'Enter' && state.current && state.mode !== 'exhibit') { event.preventDefault(); state.focus(state.current, true); return; }
      if (state.detail || state.mode === 'exhibit') return;
      const pages = Math.max(1, Math.ceil(entries.length / state.settings.pageSize));
      if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); state.patch({ page: Math.max(0, Math.min(pages - 1, state.page + (event.key === 'PageUp' ? -1 : 1))) }); return; }
      if (!source || !entries.length || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const cards = [...document.querySelectorAll<HTMLElement>('.viewer-card[data-path]')], first = cards[0]?.getBoundingClientRect();
      const columns = first ? cards.filter(card => Math.abs(card.getBoundingClientRect().top - first.top) < 2).length || 1 : 1;
      const current = entries.findIndex(entry => entry.path === state.current?.path), delta = event.key === 'ArrowUp' ? -columns : event.key === 'ArrowDown' ? columns : event.key === 'ArrowLeft' ? -1 : 1;
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : Math.max(0, Math.min(entries.length - 1, current < 0 ? state.page * state.settings.pageSize : current + delta));
      selectResource({ sourceId: source.id, path: entries[index].path }, { shiftKey: event.shiftKey, ctrlKey: ctrl });
      state.patch({ page: Math.floor(index / state.settings.pageSize) });
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.viewer-card.focused')?.scrollIntoView({ block: 'nearest' }));
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [active]);
}
