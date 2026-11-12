export function StyleNumber({
  label,
  value,
  min = 0,
  max,
  step = 1,
  change,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  change: (value: number) => void;
}) {
  return (
    <label className="style-number">
      <span>{label}</span>
      <div>
        <input
          type="range"
          aria-label={`${label}滑块`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => change(Number(event.target.value))}
        />
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next))
              change(Math.max(min, Math.min(max, next)));
          }}
        />
      </div>
    </label>
  );
}
export function StyleColor({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
}) {
  return (
    <label className="style-color">
      <span>{label}</span>
      <div>
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => change(event.target.value)}
        />
        <span>{value.toUpperCase()}</span>
      </div>
    </label>
  );
}
