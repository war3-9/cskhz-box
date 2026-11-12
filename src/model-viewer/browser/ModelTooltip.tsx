import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadModel } from '../resources/models';
import type { Entry, LoadedModel, Source } from '../types';
import { basename } from '../types';
const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
export function ModelTooltip({ source, entry, x, y }: { source: Source; entry: Entry; x: number; y: number }) {
  const [loaded, setLoaded] = useState<LoadedModel>(), [error, setError] = useState('');
  useEffect(() => { let alive = true; void loadModel({ sourceId: source.id, path: entry.path }).then(value => { if (alive) setLoaded(value); }, failure => { if (alive) setError(String(failure)); }); return () => { alive = false; }; }, [source.id, entry.path]);
  const dependencies = loaded?.dependencies.filter(d => d.path) || [], sizes = new Map(dependencies.filter(d => d.ref && d.size !== undefined).map(d => [`${d.ref!.sourceId}:${d.ref!.path}`, d.size!]));
  const missing = dependencies.filter(d => d.error).length;
  return createPortal(<aside className="viewer-model-tooltip" role="tooltip" style={{ left: Math.max(8, Math.min(x + 18, window.innerWidth - 348)), top: Math.max(8, Math.min(y + 18, window.innerHeight - 252)) }}><h4>模型信息</h4><strong>{basename(entry.path)}</strong><dl>
    <dt>模型大小</dt><dd>{size(entry.size)}</dd><dt>贴图总大小</dt><dd>{loaded ? size([...sizes.values()].reduce((a, b) => a + b, 0)) + (missing ? `（缺少 ${missing} 项）` : '') : '读取中…'}</dd><dt>动作数量</dt><dd>{loaded?.model.Sequences.length ?? '读取中…'}</dd><dt>贴图数量</dt><dd>{loaded?.model.Textures.length ?? '读取中…'}</dd>
  </dl>{loaded?.warning && <small>{loaded.warning}</small>}{error && <small>{error}</small>}</aside>, document.body);
}
