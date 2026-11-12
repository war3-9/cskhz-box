import { useState } from 'react';
import { Columns3, Search, X } from 'lucide-react';
import type { ObjectCategory, ObjectColumn } from './schema';
import { fieldPresentation } from './native/fieldLabels';

export function FieldPicker({ category, parent = '', onPick }: { category: ObjectCategory; parent?: string; onPick: (column: ObjectColumn) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const label = (column: ObjectColumn) => parent ? fieldPresentation(category.id, parent, column) : { title: column.title, search: `${column.title} ${column.field} ${column.letter}` };
  const fields = category.columns.filter(column => label(column).search.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="ot-field-picker" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
    <button className="ot-button" aria-expanded={open} onClick={() => { setOpen(!open); setQuery(''); }}><Columns3 size={15} />定位字段</button>
    {open && <section className="ot-field-popover" aria-label="定位字段">
      <header><strong>{category.title}字段 <small>{category.columns.length}</small></strong><button aria-label="关闭字段定位" onClick={() => setOpen(false)}><X size={15} /></button></header>
      <label className="ot-search"><Search size={15} /><input autoFocus aria-label="搜索字段" placeholder="中文标题 / 字段名" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="ot-field-list">{fields.length ? fields.map(column => <button key={column.key} onClick={() => { onPick(column); setOpen(false); }}>
        <span>{label(column).title}<small>{column.field}</small></span><code>{column.letter}</code>
      </button>) : <p>没有匹配的字段</p>}</div>
    </section>}
  </div>;
}
