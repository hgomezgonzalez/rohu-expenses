"use client";

import { formatCurrency, getMonthName } from "@/lib/utils";

export interface SparkPoint {
  year: number;
  month: number;
  value: number; // total spent
}

interface Props {
  title: string;
  points: SparkPoint[];
  /** Index in points considered "current" — gets a distinct color. */
  currentIndex?: number;
}

export default function SparklineHistogram({ title, points, currentIndex }: Props) {
  if (points.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-4 md:p-5 shadow-sm">
        <h3 className="font-semibold text-sm mb-2">{title}</h3>
        <p className="text-xs text-rohu-muted">Sin historial suficiente</p>
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.value), 1);
  const avg = points.reduce((s, p) => s + p.value, 0) / points.length;
  const current = currentIndex !== undefined ? points[currentIndex] : points[points.length - 1];
  const aboveAvg = current && current.value > avg;

  // Layout in viewBox units. Height 100, width auto by points count.
  const W = 320;
  const H = 110;
  const padX = 16;
  const padTop = 14;
  const padBottom = 22;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const barW = (innerW / points.length) * 0.65;
  const step = innerW / points.length;
  const yFor = (v: number) => padTop + innerH - (v / max) * innerH;
  const avgY = yFor(avg);

  return (
    <div className="bg-white rounded-xl border p-4 md:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{title}</h3>
        <span
          className={`text-xs font-medium ${aboveAvg ? "text-red-700" : "text-emerald-700"}`}
        >
          {aboveAvg ? "Sobre promedio" : "Bajo promedio"}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label="Tendencia mensual">
        {/* Average line */}
        <line
          x1={padX} y1={avgY} x2={W - padX} y2={avgY}
          stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 3"
        />
        <text x={W - padX} y={avgY - 4} fill="#6b7280" fontSize="10" textAnchor="end">
          prom {formatShort(avg)}
        </text>

        {/* Bars */}
        {points.map((p, i) => {
          const x = padX + step * i + (step - barW) / 2;
          const y = yFor(p.value);
          const h = padTop + innerH - y;
          const isCurrent = currentIndex !== undefined ? i === currentIndex : i === points.length - 1;
          const aboveAvgBar = p.value > avg;
          let fill = "#cbd5e1"; // slate-300 historical
          if (isCurrent) fill = aboveAvgBar ? "#ef4444" : "#10b981"; // red-500 / emerald-500
          return (
            <g key={`${p.year}-${p.month}`}>
              <rect x={x} y={y} width={barW} height={h} fill={fill} rx="3" />
              <text
                x={x + barW / 2}
                y={H - 6}
                fontSize="10"
                fill="#6b7280"
                textAnchor="middle"
              >
                {getMonthName(p.month).slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>

      {current && (
        <p className="text-xs text-rohu-muted mt-2">
          {getMonthName(current.month)} {current.year}: <span className="font-medium text-rohu-text">{formatCurrency(current.value)}</span>
        </p>
      )}
    </div>
  );
}

function formatShort(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}
