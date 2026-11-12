import { useMemo, useState } from 'react';
import { ObjectModal } from '../dialogs/Modal';
import { categoryById, type CategoryId } from '../schema';
import { templatesFor, templateTree, type TemplateFolder } from './catalog';
import { TemplateIcon } from './TemplateIcon';
import { chooseIconDirectory } from './icons';

export function TemplateDialog({ kind, current, choose, cancel }: { kind: CategoryId; current: string; choose: (id: string) => void; cancel: () => void }) {
  const [library, setLibrary] = useState<CategoryId>(kind), [revision, setRevision] = useState(0), [message, setMessage] = useState('');
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(current), [expanded, setExpanded] = useState<Set<string>>(() => {
    const all = templatesFor(kind), paths = all.map(e => '/' + e.folders[0]);
    const entry = all.find(e => e.id === current); entry?.folders.forEach((_, i) => paths.push('/' + entry.folders.slice(0, i + 1).join('/')));
    return new Set(paths);
  });
  const entries = useMemo(() => templatesFor(library, query), [library, query]), tree = useMemo(() => templateTree(entries), [entries]);
  const tabs: CategoryId[] = kind === 'unit' || kind === 'item' ? ['unit', 'item'] : ['unit', 'item', kind];
  const switchLibrary = (next: CategoryId) => { setLibrary(next); setSelected(''); setQuery(''); setExpanded(new Set(templatesFor(next).map(e => '/' + e.folders[0]))); };
  const folders = (nodes: TemplateFolder[], depth = 0) => nodes.map(node => {
    const open = !!query || expanded.has(node.path);
    return <div role="treeitem" aria-expanded={open} key={node.path}><button className="ot-template-folder" style={{ paddingLeft: 12 + depth * 20 }} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next; })}>{open ? '▾' : '▸'}　📁 {node.name}</button>
      {open && <div role="group">{folders(node.children, depth + 1)}{node.entries.map(entry => <button role="treeitem" aria-selected={selected === entry.id} key={entry.id} className={`ot-template-leaf ${selected === entry.id ? 'is-selected' : ''}`} style={{ paddingLeft: 32 + depth * 20 }} onClick={() => setSelected(entry.id)} onDoubleClick={() => choose(entry.id)}><TemplateIcon key={`${library}:${entry.id}`} kind={library} entry={entry} revision={revision} /><span>{entry.name}</span><code>{entry.id}</code></button>)}</div>}
    </div>;
  });
  return <ObjectModal title="选择模板" close={cancel} className="ot-template-dialog"><div className="ot-template-tabs" role="tablist" aria-label="模板库">{tabs.map(tab => <button role="tab" aria-selected={library === tab} className={`ot-button ${library === tab ? 'ot-primary' : ''}`} key={tab} onClick={() => switchLibrary(tab)}>{categoryById[tab].title}模板</button>)}<button className="ot-button ot-icon-directory" onClick={() => { void chooseIconDirectory().then(changed => { if (changed) { setRevision(r => r + 1); setMessage('已连接编辑器图标库（只读）'); } }).catch(error => setMessage(String(error))); }}>读取编辑器图标</button></div>{message && <p role="status" className="ot-dialog-hint">{message}</p>}<input className="ot-template-search" aria-label="搜索物编ID模板" placeholder="输入名字、ID 或分类查找" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="ot-template-heading"><span>模板分类与名称</span><span>ID</span></div>
    <div className="ot-template-tree" role="tree" aria-label="物编ID模板">{folders(tree)}{!entries.length && <p className="ot-dialog-hint">没有匹配的物编模板</p>}</div>
    <footer><small>{entries.length} 个模板{selected ? ` · 已选 ${selected}` : ''}</small><button className="ot-button" onClick={cancel}>取消</button><button className="ot-button ot-primary" disabled={!selected} onClick={() => choose(selected)}>确定</button></footer>
  </ObjectModal>;
}
