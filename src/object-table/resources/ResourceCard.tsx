import { useEffect, useState } from 'react';
import type { ResourceSession } from './session';
import type { ResourceChoice } from './paths';
import { LiveResourceCard } from './ModelCanvas';
export function ResourceCard({ item, session, model, selected, toggle, inspect, ready, live, activate, deactivate }: {
  item: ResourceChoice; session: ResourceSession; model: boolean; selected: number;
  toggle: () => void; inspect: () => void; ready: (path: string, valid: boolean) => void;
  live: boolean; activate: () => void; deactivate: () => void;
}) {
  const [url, setUrl] = useState(''), [error, setError] = useState(item.error ?? ''), [warning, setWarning] = useState('');
  useEffect(() => {
    let valid = true; setUrl(''); setError(item.error ?? '');
    if (item.error) return;
    void session.preview(item.path, model, () => valid).then(result => { if (valid) { setUrl(result.url); setWarning(result.warning); ready(item.path, true); } }, error => { if (valid) { setError(String(error)); ready(item.path, false); } });
    return () => { valid = false; };
  }, [session, item.path, item.error, model, ready]);
  return <div className={`ot-resource-card ${selected ? 'is-selected' : ''}`}>
    <button type="button" aria-label={`${model ? '预览' : '选择或取消'} ${item.path}`} onClick={model ? inspect : toggle} disabled={!!error || (!model && !url)}
      onPointerEnter={activate} onPointerLeave={deactivate} onFocus={activate} onBlur={deactivate}>
      {model && live ? <LiveResourceCard session={session} path={item.path} /> : url ? <img src={url} alt={item.path} /> : <span>{error || '加载预览…'}</span>}
    </button>
    {model && <small>移入播放 · 拖动旋转 · 点击放大</small>}
    <label title={item.path}><input type="checkbox" aria-label={`选择 ${item.path}`} disabled={!url || !!error} checked={selected > 0} onChange={toggle} />{selected > 0 && <b>{selected}. </b>}{item.path}</label>
    {warning && <small>{warning}</small>}{error && <small role="status">{error}</small>}
  </div>;
}
