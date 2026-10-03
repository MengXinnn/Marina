/** − value + control shared by the HUD and the in-scene panels. */
export function Stepper({
  value,
  min,
  max,
  signed,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  signed?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <span className="stepper">
      <button className="btn tiny" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="value">{signed && value > 0 ? `+${value}` : value}</span>
      <button className="btn tiny" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}
