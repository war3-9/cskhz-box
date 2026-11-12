export function zoomAt(zoom: number, next: number, panX: number, panY: number, x: number, y: number) {
  const ratio = next / zoom;
  return { zoom: next, panX: x - (x - panX) * ratio, panY: y - (y - panY) * ratio };
}
export function wheelZoom(zoom: number, delta: number) {
  return Math.max(0.1, Math.min(2, zoom * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.002)));
}
