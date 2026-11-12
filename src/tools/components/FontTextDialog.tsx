import { useEffect, useState } from "react";
import type { Asset, ImageLayer } from "../../shared/types";
import { Modal } from "../../shared/components/Modal";
import { legacyTextSettings, saveTextLayer } from "../services/textLayers";
import { requireCanvas } from "../../canvas/requireCanvas";
import {
  defaultGradient,
  defaultStroke,
  TextEffectControls,
} from "./TextEffectControls";
import { TextPreview } from "./TextPreview";

export function FontTextDialog({
  font,
  close,
  layer,
  embedded = false,
}: {
  font: Asset;
  close: () => void;
  layer?: ImageLayer;
  embedded?: boolean;
}) {
  const [text, setText] = useState(
    layer?.text?.content ??
      (layer ? layer.name.slice(font.name.length + 3) : "文字"),
  );
  const [size, setSize] = useState(layer?.text?.fontSize ?? 64);
  const [color, setColor] = useState(layer?.text?.color ?? "#161b26");
  const [stroke, setStroke] = useState(layer?.text?.stroke ?? defaultStroke);
  const [gradient, setGradient] = useState(
    layer?.text?.gradient ?? defaultGradient,
  );
  const [busy, setBusy] = useState(Boolean(layer && !layer.text));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!layer || layer.text) return;
    let active = true;
    legacyTextSettings(layer, font)
      .then((settings) => {
        if (!active) return;
        setText(settings.content);
        setSize(settings.fontSize);
        setColor(settings.color);
      })
      .catch(() => {
        if (active) setError("旧图层参数读取失败，请设置文字和颜色");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [layer, font]);
  const settings = {
    fontId: font.id,
    content: text,
    fontSize: size,
    color,
    stroke,
    gradient,
  };
  const validEffects =
    Number.isFinite(stroke.width) &&
    stroke.width >= 0 &&
    stroke.width <= 32 &&
    Number.isFinite(gradient.angle) &&
    gradient.angle >= 0 &&
    gradient.angle <= 360;
  return embedded ? (
      <div className="embedded-text-editor">
        <h3>{font.name}</h3>
        <TextPreview font={font} settings={settings} />
        <label>文字内容<textarea autoFocus aria-label="文字内容" value={text} maxLength={1000} rows={4} onChange={(event) => setText(event.target.value)} /></label>
        <label>字号<input aria-label="字号" type="number" min={8} max={256} value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
        <TextEffectControls color={color} setColor={setColor} stroke={stroke} setStroke={setStroke} gradient={gradient} setGradient={setGradient} />
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" onClick={close}>取消</button><button className="primary" disabled={busy || !text.trim() || !Number.isInteger(size) || size < 8 || size > 256 || !validEffects || layer?.locked} onClick={async () => { if (!requireCanvas()) return; setBusy(true); try { await saveTextLayer(font, settings, layer?.id); close(); } catch (cause) { setError(cause instanceof Error ? cause.message : "文字创建失败"); setBusy(false); } }}>{busy ? "处理中" : "保存文字"}</button></div>
      </div>
    ) : <Modal title={font.name} close={close}>
      <form
        className="text-editor"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!requireCanvas()) return;
          setBusy(true);
          try {
            await saveTextLayer(font, settings, layer?.id);
            close();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "文字创建失败");
            setBusy(false);
          }
        }}
      >
        <TextPreview font={font} settings={settings} />
        <label>
          文字内容
          <textarea
            autoFocus
            aria-label="文字内容"
            value={text}
            maxLength={1000}
            rows={4}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label>
          字号
          <input
            aria-label="字号"
            type="number"
            min={8}
            max={256}
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          />
        </label>
        <TextEffectControls
          color={color}
          setColor={setColor}
          stroke={stroke}
          setStroke={setStroke}
          gradient={gradient}
          setGradient={setGradient}
        />
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            取消
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              !text.trim() ||
              !Number.isInteger(size) ||
              size < 8 ||
              size > 256 ||
              !validEffects ||
              layer?.locked
            }
          >
            {busy ? "处理中" : layer ? "保存文字" : "添加文字"}
          </button>
        </div>
      </form>
    </Modal>;
}
