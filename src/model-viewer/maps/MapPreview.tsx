import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { decodeTexture } from '../resources/textures';
export function MapPreview({ path }: { path?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null), [error, setError] = useState('');
  useEffect(() => {
    let alive = true; setError(''); const node = canvas.current; if (node) { node.width = 1; node.height = 1; }
    if (path) void invoke<ArrayBuffer>('viewer_map_preview', { path }).then(bytes => decodeTexture(bytes, 'map.tga')).then(images => {
      if (!alive || !canvas.current) return; const image = images[0]; canvas.current.width = image.width; canvas.current.height = image.height; canvas.current.getContext('2d')!.putImageData(image, 0, 0);
    }).catch(error => { if (alive) setError(String(error)); });
    return () => { alive = false; };
  }, [path]);
  return <div className="viewer-map-preview"><canvas ref={canvas} aria-label="地图预览图" />{error && <span>{error}</span>}{!path && <span>选择地图查看预览</span>}</div>;
}
