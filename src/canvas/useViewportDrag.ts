import { useEffect, useRef, useState } from "react";
import { useFeatureActive } from '../app/FeatureActivity';

type Point = { x: number; y: number };

export function useViewportDrag(
  offset: Point,
  setOffset: (point: Point) => void,
) {
  const start = useRef<{ pointer: Point; offset: Point } | null>(null);
  const [dragging, setDragging] = useState(false);
  const active = useFeatureActive();
  useEffect(() => {
    if (!active) { start.current = null; setDragging(false); return; }
    const move = (event: MouseEvent) => {
      if (!start.current) return;
      setOffset({
        x: start.current.offset.x + event.clientX - start.current.pointer.x,
        y: start.current.offset.y + event.clientY - start.current.pointer.y,
      });
    };
    const end = () => {
      start.current = null;
      setDragging(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("blur", end);
    };
  }, [setOffset, active]);
  return {
    dragging,
    begin: (event: MouseEvent) => {
      if (event.button !== 0) return;
      start.current = {
        pointer: { x: event.clientX, y: event.clientY },
        offset,
      };
      setDragging(true);
    },
  };
}
