import { useEffect, useState } from "react";
import type { Asset, ImageLayer, TextLayerData } from "../../shared/types";
import { renderFontText } from "../../tools/services/fontText";
import { loadImage } from "../../shared/image";

export function useTextDraft(layer: ImageLayer, font?: Asset) {
  const [text, setText] = useState(layer.text);
  const [patch, setPatch] = useState<Partial<ImageLayer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!text || !font || text === layer.text) {
      setPatch({});
      return;
    }
    let active = true;
    setBusy(true);
    setError("");
    const timer = setTimeout(() => {
      Promise.all([
        renderFontText(font, text.content, text.fontSize, text.color, text),
        loadImage(layer.imagePath),
      ])
        .then(([image, original]) => {
          if (active)
            setPatch({
              text,
              imagePath: image.imagePath,
              width: (image.width * layer.width) / original.width,
              height: (image.height * layer.height) / original.height,
            });
        })
        .catch((cause: unknown) => {
          if (active)
            setError(cause instanceof Error ? cause.message : "文字渲染失败");
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [text, font, layer]);
  return {
    text,
    setText: (settings: TextLayerData) => setText(settings),
    patch,
    busy,
    error,
  };
}
