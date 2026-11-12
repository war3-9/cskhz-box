import { useEffect, useRef, useState } from "react";
import useImage from "use-image";
import { prepareLayer } from "./render/prepare";
import type { ImageLayer } from "../../shared/types";

export function StylePreview({
  layer,
  original,
}: {
  layer: ImageLayer;
  original: ImageLayer;
}) {
  const [compare, setCompare] = useState(false);
  const target = compare ? original : layer;
  const [image] = useImage(target.imagePath, 'anonymous');
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!image || !ref.current) return;
    const prepared = prepareLayer(image, target);
    const context = ref.current.getContext("2d")!;
    context.clearRect(0, 0, 240, 240);
    const scale = Math.min(200 / prepared.width, 200 / prepared.height);
    context.globalAlpha = target.opacity;
    context.drawImage(
      prepared.image,
      (240 - prepared.width * scale) / 2,
      (240 - prepared.height * scale) / 2,
      prepared.width * scale,
      prepared.height * scale,
    );
  }, [image, target]);
  return (
    <aside className="style-preview">
      <div className="style-preview-heading">
        <strong>预览</strong>
        <span>
          {Math.round(layer.width)} × {Math.round(layer.height)} px
        </span>
      </div>
      <canvas ref={ref} width={240} height={240} aria-label="图层样式预览" />
      <label className="style-check">
        <input
          type="checkbox"
          checked={compare}
          onChange={(event) => setCompare(event.target.checked)}
        />
        对比原图
      </label>
      <div className="style-preview-name" title={layer.name}>
        {layer.name}
      </div>
    </aside>
  );
}
