import { StyledSelect } from '../../shared/components/StyledSelect';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useViewer } from '../workspace/store';
export function Pagination({ count }: { count: number }) {
  const state = useViewer(), pages = Math.max(1, Math.ceil(count / state.settings.pageSize)), page = Math.min(state.page, pages - 1);
  const start = Math.max(0, Math.min(pages - 5, page - 2));
  return <footer className="viewer-pagination"><div className="viewer-page-buttons"><button className="viewer-icon" title="上一页" disabled={!page} onClick={() => state.patch({ page: page - 1, scroll: 0 })}><ChevronLeft size={18} /></button>{Array.from({ length: Math.min(5, pages) }, (_, i) => start + i).map(n => <button key={n} className={n === page ? 'active' : ''} onClick={() => state.patch({ page: n, scroll: 0 })}>{n + 1}</button>)}<button className="viewer-icon" title="下一页" disabled={page + 1 >= pages} onClick={() => state.patch({ page: page + 1, scroll: 0 })}><ChevronRight size={18} /></button>
      <StyledSelect aria-label="每页数量" value={state.settings.pageSize} onChange={e => { state.configure({ pageSize: Number(e.target.value) }); state.patch({ page: 0, scroll: 0 }); }}>{[24, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</StyledSelect></div><span>总数：{count}　选中 {state.selected.length}　{page + 1}/{pages} 页</span></footer>;
}
