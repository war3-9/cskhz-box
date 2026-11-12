import { useEffect, useState } from "react";
import { FIXED_TIMEOUT, useCanvasInteraction } from "./interactionStore";
import { useEditor } from "../layers/store";

export function InteractionStatus() {
  const fixedId = useCanvasInteraction((s) => s.fixedId);
  const expiresAt = useCanvasInteraction((s) => s.expiresAt);
  const operating = useCanvasInteraction((s) => s.operating);
  const [now, setNow] = useState(Date.now());
  const layer = useEditor((s) =>
    s.document.layers.find((item) => item.id === fixedId),
  );
  useEffect(() => {
    if (!fixedId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [fixedId]);
  if (!fixedId || !layer) return null;
  const seconds = Math.min(
    FIXED_TIMEOUT / 1000,
    Math.max(0, Math.ceil((expiresAt - now) / 1000)),
  );
  return (
    <span className="fixed-layer-status" title={layer.name}>
      固定图层：{layer.name} · {operating ? "正在操作" : `${seconds} 秒后失效`}
    </span>
  );
}
