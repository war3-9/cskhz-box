import type { TextLayerData } from "../../shared/types";
import {
  defaultGradient,
  defaultStroke,
  TextEffectControls,
} from "../../tools/components/TextEffectControls";

export function TextFields({
  text,
  change,
}: {
  text: TextLayerData;
  change: (text: TextLayerData) => void;
}) {
  return (
    <div className="style-text-fields">
      <label>
        文字内容
        <textarea
          aria-label="文字内容"
          rows={3}
          maxLength={1000}
          value={text.content}
          onChange={(event) => change({ ...text, content: event.target.value })}
        />
      </label>
      <label>
        字号
        <input
          aria-label="字号"
          type="number"
          min={8}
          max={256}
          value={text.fontSize}
          onChange={(event) =>
            change({ ...text, fontSize: Number(event.target.value) })
          }
        />
      </label>
      <TextEffectControls
        color={text.color}
        setColor={(color) => change({ ...text, color })}
        stroke={text.stroke ?? defaultStroke}
        setStroke={(stroke) => change({ ...text, stroke })}
        gradient={text.gradient ?? defaultGradient}
        setGradient={(gradient) => change({ ...text, gradient })}
      />
    </div>
  );
}
