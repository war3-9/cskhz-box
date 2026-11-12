import { useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
export function TexturePreview({ image, name }: { image: string; name: string }) {
  const [zoom, setZoom] = useState(0);
  return <div className="viewer-texture-inspector"><div className="viewer-texture-tools"><button title="适配贴图" onClick={() => setZoom(0)}><Maximize size={17} /></button><button title="缩小贴图" onClick={() => setZoom(z => Math.max(.125, (z || 1) / 2))}><Minus size={17} /></button><output>{zoom ? `${zoom * 100}%` : '适配'}</output><button title="放大贴图" onClick={() => setZoom(z => Math.min(8, (z || 1) * 2))}><Plus size={17} /></button></div><div className={`viewer-texture-scroll ${zoom ? '' : 'fit'}`}><img src={image} alt={name} style={zoom ? { width: `${zoom * 100}%`, maxWidth: 'none', maxHeight: 'none', objectFit: 'none' } : undefined} /></div></div>;
}
