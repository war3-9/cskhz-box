import { useLayoutEffect, useRef, type ReactNode } from "react";

export function LayerContextMenu({
  x,
  y,
  close,
  children,
}: {
  x: number;
  y: number;
  close: () => void;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current!;
    const position = () => {
      const { width, height } = element.getBoundingClientRect();
      element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [x, y]);
  return (
    <div className="layer-context-backdrop" onPointerDown={close}>
      <div
        ref={menu}
        className="layer-context-menu"
        aria-label="图层操作"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
