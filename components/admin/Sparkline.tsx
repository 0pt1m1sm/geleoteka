/**
 * Спарклайн на чистом SVG — без графических библиотек: одна линия +
 * заливка, размеры по вьюпорту контейнера. Достаточно для «динамика вверх
 * или вниз», не претендует на полноценный график.
 */

export function sparklinePath(
  values: number[],
  width: number,
  height: number,
  pad = 2,
): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + innerH - ((v - min) / span) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function Sparkline({
  values,
  width = 280,
  height = 48,
  ariaLabel,
}: {
  values: number[];
  width?: number;
  height?: number;
  ariaLabel?: string;
}): React.ReactElement | null {
  if (values.length < 2) return null;
  const line = sparklinePath(values, width, height);
  const area = `${line} L${width - 2},${height} L2,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-12"
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <path d={area} fill="var(--color-accent)" opacity={0.15} />
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
    </svg>
  );
}
