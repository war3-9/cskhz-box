import { StyledSelect } from '../../shared/components/StyledSelect';
import { useEffect, useRef, useState } from 'react';
import { useViewer } from '../workspace/store';
import { decodeTexture } from '../resources/textures';
import { resolveResource } from '../resources/providers';
import { checkerImage } from './ground';
import manifest from './terrain/manifest.json';
const terrainFiles = import.meta.glob('./terrain/*.blp', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
const terrains = manifest as Array<{ name: string; path: string; file: string }>;
let customImage: ImageData | undefined;
export function GroundControls({ apply }: { apply: (image?: ImageData) => void }) {
  const ground = useViewer(s => s.settings.ground || 'checker'), sourceId = useViewer(s => s.activeSource), revision = useViewer(s => s.revision), configure = useViewer(s => s.configure);
  const input = useRef<HTMLInputElement>(null), [error, setError] = useState('');
  useEffect(() => {
    let alive = true; setError('');
    if (ground === 'none') apply(undefined);
    else if (ground === 'checker') apply(checkerImage());
    else if (ground === 'custom') { apply(customImage || checkerImage()); if (!customImage) setError('请选择自定义地板图片'); }
    else {
      const path = ground.replace('/Lord_', '/Lords_'), entry = terrains.find(entry => entry.path.toLowerCase() === path.toLowerCase());
      const embedded = entry && terrainFiles[`./terrain/${entry.file}`];
      const bytes = embedded ? fetch(embedded).then(response => response.arrayBuffer()) : resolveResource(sourceId, ground).then(resource => resource.bytes);
      void bytes.then(value => decodeTexture(value, ground)).then(images => {
      if (!alive) return; const image = images[0], tile = Math.max(1, Math.floor(Math.min(image.width, image.height) / 4));
      const canvas = document.createElement('canvas'); canvas.width = tile; canvas.height = tile; const context = canvas.getContext('2d')!; const atlas = document.createElement('canvas'); atlas.width = image.width; atlas.height = image.height; atlas.getContext('2d')!.putImageData(image, 0, 0); context.drawImage(atlas, 0, 0, tile, tile, 0, 0, tile, tile); apply(context.getImageData(0, 0, tile, tile));
      }, failure => { if (alive) { apply(checkerImage()); setError(`无法读取地形贴图：${String(failure)}`); } });
    }
    return () => { alive = false; };
  }, [ground, sourceId, revision, apply]);
  return <><label>地板<StyledSelect aria-label="模型地图地板" value={ground.replace('/Lord_', '/Lords_')} onChange={event => { const value = event.target.value; if (value === 'custom') input.current?.click(); else configure({ ground: value }); }}><option value="checker">棋盘格</option><option value="custom">自定义…</option><option value="none">无地板</option>{terrains.map(({name, path}) => <option key={path} value={path}>{name}</option>)}</StyledSelect></label>{ground === 'custom' && <button onClick={() => input.current?.click()}>更换地板图片</button>}
    <input ref={input} hidden type="file" accept=".png,.jpg,.jpeg,.blp,.tga,.dds" aria-label="自定义地板图片" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file) return; void file.arrayBuffer().then(bytes => decodeTexture(bytes, file.name)).then(images => { customImage = images[0]; configure({ ground: 'custom' }); apply(customImage); setError(''); }, failure => setError(String(failure))); }} />{error && <span className="viewer-exhibit-hint" role="alert">{error}</span>}</>;
}
