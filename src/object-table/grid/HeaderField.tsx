import { Copy } from 'lucide-react';

export function HeaderField({ field, report }: { field: string; report: (message: string, kind?: 'success' | 'error') => void }) {
  if (!field || field.startsWith('__blank_')) return <code />;
  const copy = async () => {
    try { await navigator.clipboard.writeText(field); report(`已复制字段名：${field}`, 'success'); }
    catch (error) { report(`复制字段名失败：${String(error)}`, 'error'); }
  };
  return <div className="ot-header-field" onCopy={e => e.stopPropagation()} onCut={e => e.stopPropagation()}><code title={field}>{field}</code><button type="button" className="ot-header-copy" aria-label={`复制字段名 ${field}`} title={`复制字段名 ${field}`} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); void copy(); }}><Copy size={10} aria-hidden="true" /></button></div>;
}
