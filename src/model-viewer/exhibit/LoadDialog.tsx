import { ChevronRight, Grid3X3, Infinity, Layers, X } from 'lucide-react';
import { useViewer, visibleModels } from '../workspace/store';
import { exhibitEntries, type ExhibitLimit } from './scope';
export function LoadDialog({ close }: { close: () => void }) {
  const state = useViewer(), entries = visibleModels(state);
  const choose = (limit: ExhibitLimit) => { state.patch({ exhibitLimit: limit, mode: 'exhibit', detail: false }); close(); };
  return <div className="viewer-dialog-backdrop"><section className="viewer-dialog viewer-load-dialog" role="dialog" aria-modal="true" aria-label="模型地图加载方式" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <h3>模型地图加载方式<button aria-label="关闭加载方式" onClick={close}><X size={17} /></button></h3>
    {(['page', 200, 500, 1000, 'all'] as const).map((limit, index) => { const count = exhibitEntries(entries, state.page, state.settings.pageSize, limit).length, Icon = index === 0 ? Layers : limit === 'all' ? Infinity : Grid3X3; return <button key={limit} autoFocus={index === 0} disabled={!count} onClick={() => choose(limit)}><Icon size={24} /><span>{limit === 'page' ? `加载当前页（${count}）` : limit === 'all' ? `加载全部（${count}）` : `加载${limit}个`}</span><ChevronRight size={21} /></button>; })}
    <p>按当前目录、搜索、分类及排序加载。大批量模型按当前视角分配渲染资源。</p>
  </section></div>;
}
