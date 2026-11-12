import type { ExhibitScene } from './scene';
export function Minimap({ map, selected, navigate }: { map?: ReturnType<ExhibitScene['minimap']>; selected: number; navigate: (x: number, y: number) => void }) {
  if (!map) return null;
  const { bounds: b } = map, width = b.maxY - b.minY, height = b.maxX - b.minX;
  const x = (value: number) => (value - b.minY) / width * 160, y = (value: number) => (value - b.minX) / height * 160;
  return <div className="viewer-minimap"><strong>小地图</strong><svg viewBox="0 0 160 160" role="img" aria-label="当前视角范围与模型位置" onPointerDown={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); navigate(b.minX + (event.clientY - rect.top) / rect.height * height, b.minY + (event.clientX - rect.left) / rect.width * width); }}>
    <defs><pattern id="viewer-map-grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M 8 0 L 0 0 0 8" fill="none" stroke="#24445a" strokeWidth=".5" /></pattern></defs><rect width="160" height="160" fill="url(#viewer-map-grid)" />
    {map.positions.map(point => <circle key={point.index} data-model-index={point.index} data-visible={point.visible} cx={x(point.y)} cy={y(point.x)} r={point.index === selected ? 3 : 1.6} fill={point.visible ? point.index === selected ? '#fff' : '#edc459' : '#4e5e6a'} />)}
    <polygon data-testid="minimap-frustum" points={map.footprint.map(p => `${x(p.y)},${y(p.x)}`).join(' ')} fill="#53ed6b18" stroke="#64ff6e" strokeWidth="1.7" />
    <circle cx={x(map.camera.y)} cy={y(map.camera.x)} r="2" fill="#71bfff" />
  </svg></div>;
}
