import { useRef, useState } from 'react';
import { FolderPlus, ImagePlus, RefreshCw } from 'lucide-react';
import { chooseSource } from '../resources/providers';
import { decodeTexture } from '../resources/textures';
import { useViewer } from '../workspace/store';
import type { LoadedModel } from '../types';
export function Dependencies({ loaded, replace }: { loaded: LoadedModel; replace: (loaded: LoadedModel) => void }) {
  const input = useRef<HTMLInputElement>(null), [target, setTarget] = useState(''), [error, setError] = useState('');
  const change = async (file?: File) => {
    if (!file || !target) return;
    try {
      const images = await decodeTexture(await file.arrayBuffer(), file.name), updated = new Map(loaded.images); updated.set(target, images);
      replace({ ...loaded, images: updated, dependencies: loaded.dependencies.map(d => d.path === target ? { ...d, error: undefined, source: `临时替代：${file.name}`, size: file.size } : d) }); setError('');
    } catch (value) { setError(String(value)); }
    finally { if (input.current) input.current.value = ''; }
  };
  return <><h3>贴图依赖<span><button title="补充贴图目录" onClick={() => void chooseSource('folder', true)}><FolderPlus size={17} /></button><button title="重新解析贴图" onClick={() => useViewer.getState().patch({ revision: useViewer.getState().revision + 1 })}><RefreshCw size={17} /></button></span></h3>
    <div className="viewer-dependencies">{loaded.dependencies.map((d, i) => <div key={i} className={d.error ? 'missing' : ''} title={d.error || d.source}><strong>{d.path || `可替换贴图 ${d.replaceableId}`}</strong><small>{d.error || d.source || '队伍颜色 / 光晕'}</small>{d.path && <button title={`临时替换 ${d.path}`} onClick={() => { setTarget(d.path); input.current?.click(); }}><ImagePlus size={14} /></button>}</div>)}</div>
    <input ref={input} hidden type="file" accept=".blp,.tga,.dds,.png,.jpg,.jpeg" onChange={e => void change(e.currentTarget.files?.[0])} />{error && <p role="alert">{error}</p>}</>;
}
