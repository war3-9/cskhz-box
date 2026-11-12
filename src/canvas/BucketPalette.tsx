import { useBucket } from "./bucketStore";

export function BucketPalette() {
  const { active, color, recent, setColor, clear } = useBucket();
  if (!active) return null;
  return (
    <div
      className="bucket-palette"
      role="dialog"
      aria-label="水桶颜色"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="bucket-palette-heading"><span>水桶颜色</span><button type="button" aria-label="关闭水桶颜色" onClick={clear}>×</button></div>
      <label>
        颜色
        <input
          aria-label="水桶颜色选择"
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </label>
      <div className="bucket-swatches" aria-label="最近颜色">
        {recent.map((item) => (
          <button
            key={item}
            aria-label={`选择颜色 ${item}`}
            title={item}
            style={{ background: item }}
            onClick={() => setColor(item)}
          />
        ))}
      </div>
    </div>
  );
}
