"use client";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  size = 132,
  thickness = 16,
}: {
  segments: DonutSegment[];
  centerValue: string | number;
  centerLabel: string;
  size?: number;
  thickness?: number;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const gap = 3;

  const { arcs } = segments.filter((s) => s.value > 0).reduce(
    (acc, seg) => {
      const fraction = seg.value / total;
      const dashLength = Math.max(fraction * circumference - gap, 0);
      const dashOffset = -acc.cumulative * circumference;
      return {
        cumulative: acc.cumulative + fraction,
        arcs: [...acc.arcs, { seg, dashLength, dashOffset }],
      };
    },
    { cumulative: 0, arcs: [] as { seg: DonutSegment; dashLength: number; dashOffset: number }[] }
  );

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
      {total === 0 ? (
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-neutral-200)" strokeWidth={thickness} />
      ) : (
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {arcs.map(({ seg, dashLength, dashOffset }) => (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={dashOffset}
            >
              <title>{`${seg.label}: ${seg.value.toLocaleString()}`}</title>
            </circle>
          ))}
        </g>
      )}
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.2} className="fill-neutral-900 font-serif">
        {centerValue}
      </text>
      <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.075} className="fill-neutral-400">
        {centerLabel}
      </text>
    </svg>
  );
}

export function DonutLegend({ segments, total }: { segments: DonutSegment[]; total: number }) {
  return (
    <ul className="space-y-2 text-xs">
      {segments.map((seg) => (
        <li key={seg.label} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seg.color }} />
          <span className="min-w-0 flex-1 truncate text-neutral-600">{seg.label}</span>
          <span className="shrink-0 font-numeric font-semibold text-neutral-900">{seg.value.toLocaleString()}</span>
          {total > 0 && (
            <span className="w-11 shrink-0 text-right text-[10px] text-neutral-400">
              {((seg.value / total) * 100).toFixed(1)}%
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function HorizontalBarChart({
  data,
  color = "var(--color-brand-500)",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-xs" title={`${d.label}: ${d.value.toLocaleString()}`}>
          <span className="w-16 shrink-0 truncate text-neutral-600">{d.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-numeric font-semibold text-neutral-800">
            {d.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({
  values,
  width = 96,
  height = 32,
  color = "var(--color-brand-500)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => `${i * stepX},${height - ((v - min) / range) * (height - 4) - 2}`);
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="presentation">
      <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
