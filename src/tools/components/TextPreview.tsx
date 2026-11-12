import { useEffect, useState } from "react";
import type { Asset, TextLayerData } from "../../shared/types";
import { renderFontText } from "../services/fontText";

export function TextPreview({
  font,
  settings,
}: {
  font: Asset;
  settings: TextLayerData;
}) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      renderFontText(
        font,
        settings.content,
        settings.fontSize,
        settings.color,
        settings,
      )
        .then((image) => {
          if (active) {
            setPreview(image.imagePath);
            setError("");
          }
        })
        .catch((cause) => {
          if (active) {
            setPreview("");
            setError(cause instanceof Error ? cause.message : "预览失败");
          }
        });
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    font,
    settings.content,
    settings.fontSize,
    settings.color,
    settings.stroke,
    settings.gradient,
  ]);
  return (
    <div className="text-preview" aria-label="文字效果预览">
      {error ? (
        <span role="status">{error}</span>
      ) : (
        preview && <img src={preview} alt="文字效果预览" />
      )}
    </div>
  );
}
