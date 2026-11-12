import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 16;
export const clampZoom = (value: number) =>
  Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

export function useCanvasViewport(
  width: number,
  height: number,
  zoom: number,
  setZoom: (value: number) => void,
) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pending = useRef<{ x: number; y: number } | null>(null);
  const content = {
    width: Math.max(size.width, width * zoom + 80),
    height: Math.max(size.height, height * zoom + 80),
  };
  const origin = {
    x: (content.width - width * zoom) / 2,
    y: (content.height - height * zoom) / 2,
  };
  useLayoutEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth && element.clientHeight)
        setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = host.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!event.deltaY) return;
      const rect = element.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const next = clampZoom(
        zoom * Math.exp(-Math.max(-300, Math.min(300, event.deltaY)) * 0.002),
      );
      if (next === zoom) return;
      const nextOrigin = {
        x: (Math.max(size.width, width * next + 80) - width * next) / 2,
        y: (Math.max(size.height, height * next + 80) - height * next) / 2,
      };
      const point = {
        x: (pointer.x + scroll.x - origin.x - offset.x) / zoom,
        y: (pointer.y + scroll.y - origin.y - offset.y) / zoom,
      };
      pending.current = {
        x: nextOrigin.x + point.x * next - pointer.x,
        y: nextOrigin.y + point.y * next - pointer.y,
      };
      setOffset({ x: 0, y: 0 });
      setZoom(next);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoom, setZoom, size, width, height, scroll, origin.x, origin.y, offset]);
  useLayoutEffect(() => {
    if (!pending.current) return;
    const target = pending.current;
    const element = host.current!;
    element.scrollLeft = target.x;
    element.scrollTop = target.y;
    setScroll({ x: element.scrollLeft, y: element.scrollTop });
    setOffset({
      x: element.scrollLeft - target.x,
      y: element.scrollTop - target.y,
    });
    pending.current = null;
  }, [zoom]);
  useLayoutEffect(() => {
    setOffset({ x: 0, y: 0 });
    host.current!.scrollTo(0, 0);
    setScroll({ x: 0, y: 0 });
  }, [width, height]);
  return {
    host,
    size,
    content,
    scroll,
    offset,
    setOffset,
    setScroll,
    x: origin.x - scroll.x + offset.x,
    y: origin.y - scroll.y + offset.y,
  };
}
