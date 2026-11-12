import { useRef, useState } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, ChevronDown, ChevronRight, Eraser, Layers, MousePointer2, Type } from 'lucide-react';
import { useLayoutStore } from '../state/layout';
import { frameName, frameVariable } from '../document/frameVariables';
import { descendants } from '../document/relations';
import { useHierarchyDrag } from './useHierarchyDrag';

export function Hierarchy() {
  const state = useLayoutStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const root = useRef<HTMLElement>(null);
  const { drag, drop, start } = useHierarchyDrag(root, id => setCollapsed(previous => {
    const next = new Set(previous); next.delete(id); return next;
  }));
  const selected = state.nodes.find(node => node.id === state.selectedId);
  const dragNode = state.nodes.find(node => node.id === drag?.id);
  const siblings = state.nodes.filter(node => node.parentId === selected?.parentId);
  const index = siblings.findIndex(node => node.id === state.selectedId);
  const render = (parentId?: string): React.ReactNode => [...state.nodes].reverse().filter(node => node.parentId === parentId).map(node => {
    const children = state.nodes.filter(item => item.parentId === node.id), expanded = !collapsed.has(node.id);
    const containsSelection = descendants(state.nodes, node.id).has(state.selectedId ?? '');
    const Icon = node.kind === 'text' ? Type : node.kind === 'button' ? MousePointer2 : Layers;
    return <li key={node.id} role="treeitem" aria-selected={state.selectedId === node.id}
      aria-expanded={children.length ? expanded : undefined} data-node-id={node.id}>
      <div data-drop-id={node.id} className={`tree-row ${state.selectedId === node.id ? 'selected' : ''} ${containsSelection ? 'contains-selection' : ''} ${drop?.id === node.id ? `drop-${drop.position}` : ''} ${drag?.id === node.id ? 'drag-source' : ''}`}
        onPointerDown={event => start(event, node.id)}>
        <button className="tree-toggle" title={expanded ? '折叠' : '展开'} aria-label={`${expanded ? '折叠' : '展开'} ${frameName(node)}`}
          disabled={!children.length} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>
          {children.length ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
        </button>
        <button className="tree-select" title={`${frameName(node)} · ${frameVariable(node, state.arrayName)}`} onClick={() => state.select(node.id)}>
          <Icon size={14} /><span>{frameName(node)}</span><code>{frameVariable(node, state.arrayName)}</code>
        </button>
      </div>
      {!!children.length && expanded && <ul role="group">{render(node.id)}</ul>}
    </li>;
  });
  return <section ref={root} className={`hierarchy ${drag ? 'tree-dragging' : ''}`}><h2><Layers size={18} />层级结构<span>{state.nodes.length}</span></h2>
    <div className={`clear-parent ${drop?.id === null ? 'drop-inside' : ''}`}><Eraser size={16} />拖到这里清除父级</div>
    <div className="element-list"><ul role="tree" aria-label="控件层级">{render()}</ul>{!state.nodes.length && <div className="empty-state"><Layers size={34} /><strong>还没有控件</strong></div>}</div>
    <div className="order-tools">{([
      ['up', '上移', ArrowUp], ['down', '下移', ArrowDown], ['top', '置顶', ArrowUpToLine], ['bottom', '置底', ArrowDownToLine],
    ] as const).map(([direction, label, Icon]) => <button key={direction} title={label} aria-label={label}
      disabled={index < 0 || selected?.locked || ((direction === 'up' || direction === 'top') ? index === siblings.length - 1 : index === 0)}
      onClick={() => state.reorder(direction)}><Icon size={17} />{label}</button>)}</div>
    {drag && dragNode && <div className="tree-drag-preview" style={{ left: Math.min(drag.x + 14, window.innerWidth - 200), top: Math.min(drag.y + 14, window.innerHeight - 40) }}>
      <Layers size={14} /><span>{frameName(dragNode)}</span>
    </div>}
  </section>;
}
