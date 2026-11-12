import { useEffect, useMemo, useRef, useState } from 'react';
import { useFeatureActive } from '../app/FeatureActivity';
import { drawMap, drawSelection } from './canvasDrawing';
import { mapTransform, placementRect, type Point } from './selectionGeometry';
import { useSelectionGesture, type GestureProps } from './useSelectionGesture';
import { useTheme } from '../app/theme/store';

export function MapCanvas(props: GestureProps) {
  const active = useFeatureActive();
  const theme = useTheme(state => state.theme);
  const { side, map, selection, placement } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>([0, 0]);
  const [redraw, setRedraw] = useState(0);
  const transform = map ? mapTransform(map, size.width, size.height, zoom, pan) : null;
  const gesture = useSelectionGesture(props, canvas, transform, setPan, active);
  const rect = side === 'source' ? gesture.dragging ? gesture.draft ?? selection : selection : placementRect(gesture.draft ?? selection, gesture.draftPlacement ?? placement);
  const layer = useMemo(() => {
    if (!map) return null;
    const count = map.width * map.height;
    if (![count * 3, count * 4].includes(map.pixels.length)) return null;
    const rgba = new Uint8ClampedArray(count * 4);
    if (map.pixels.length === count * 4) rgba.set(map.pixels);
    else for (let source = 0, target = 0; source < map.pixels.length; source += 3, target += 4) {
      rgba[target] = map.pixels[source]; rgba[target + 1] = map.pixels[source + 1]; rgba[target + 2] = map.pixels[source + 2]; rgba[target + 3] = 255;
    }
    const image = document.createElement('canvas'); image.width = map.width; image.height = map.height;
    image.getContext('2d')?.putImageData(new ImageData(rgba, map.width, map.height), 0, 0);
    return image;
  }, [map]);
  useEffect(() => { setZoom(1); setPan([0, 0]); }, [map?.id]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ width: box.width, height: box.height });
    });
    if (active) resize.observe(element);
    return () => resize.disconnect();
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const element = canvas.current, ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(size.width * dpr)); element.height = Math.max(1, Math.round(size.height * dpr));
    const palette = getComputedStyle(document.documentElement);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = palette.getPropertyValue('--workspace').trim(); ctx.fillRect(0, 0, size.width, size.height);
    if (!map || !layer || !transform) {
      ctx.fillStyle = palette.getPropertyValue('--muted').trim(); ctx.font = '12px Microsoft YaHei, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('打开 .w3x 地图文件', size.width / 2, size.height / 2); return;
    }
    drawMap(ctx, map, layer, transform);
    if (rect) {
      if (rect.mask && side === 'source') {
        ctx.fillStyle = 'rgba(42,188,132,.3)';
        rect.mask.forEach((value, i) => { if (value) ctx.fillRect(transform.left + i % map.width * transform.scale, transform.top + Math.floor(i / map.width) * transform.scale, transform.scale, transform.scale); });
      }
      drawSelection(ctx, rect, transform, side === 'source');
    }
  }, [active, map, layer, pan, rect, redraw, side, size, zoom, theme]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const fit = () => { setZoom(1); setPan([0, 0]); };
    const redrawCanvas = () => setRedraw(value => value + 1);
    element.addEventListener('terrain-fit', fit); element.addEventListener('terrain-redraw', redrawCanvas);
    return () => { element.removeEventListener('terrain-fit', fit); element.removeEventListener('terrain-redraw', redrawCanvas); };
  }, []);
  return <canvas ref={canvas} className="terrain-map-canvas" aria-label={side === 'source' ? '源地图画布' : '目标地图画布'}
    data-map-id={map?.id} data-map-width={map?.width} data-map-height={map?.height} data-doodad-count={map?.doodadPoints?.length ?? 0}
    data-selection={rect ? JSON.stringify({ x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 }) : ''}
    style={{ cursor: props.disabled ? 'wait' : gesture.cursor }} onContextMenu={event => event.preventDefault()}
    onPointerDown={gesture.pointerDown} onPointerMove={gesture.pointerMove} onPointerUp={gesture.pointerUp} onPointerCancel={gesture.cancel} onLostPointerCapture={gesture.cancel}
    onWheel={event => { event.preventDefault(); if (!props.disabled && !gesture.dragging) setZoom(value => Math.max(.3, Math.min(8, value * (event.deltaY < 0 ? 1.12 : .89)))); }} />;
}
