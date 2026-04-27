"use client";

import type { HealthScore } from "@/lib/health";

interface Props {
  health: HealthScore;
  periodLabel: string;
}

const THEMES: Record<HealthScore["label"], { bg: string; border: string; bar: string; ring: string }> = {
  great: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
    ring: "text-emerald-700",
  },
  okay: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    bar: "bg-amber-500",
    ring: "text-amber-700",
  },
  tight: {
    bg: "bg-red-50",
    border: "border-red-200",
    bar: "bg-red-500",
    ring: "text-red-700",
  },
};

export default function HealthScoreCard({ health, periodLabel }: Props) {
  const theme = THEMES[health.label];
  const pct = Math.max(0, Math.min(100, health.score));

  return (
    <div className={`rounded-2xl border ${theme.border} ${theme.bg} p-5 md:p-6 shadow-sm`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-rohu-muted">
          Salud financiera · {periodLabel}
        </p>
        <span className={`text-xs font-semibold ${theme.ring}`}>{pct} / 100</span>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="text-4xl md:text-5xl" aria-hidden>
          {health.emoji}
        </div>
        <div>
          <div className={`text-xl md:text-2xl font-bold ${theme.ring}`}>{health.title}</div>
          <div className="text-xs text-rohu-muted">
            Combina ejecución de presupuesto, margen libre y pagos a tiempo
          </div>
        </div>
      </div>

      <div className="w-full h-3 bg-white/60 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full ${theme.bar} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
          aria-label={`Score ${pct} de 100`}
        />
      </div>

      {health.highlights.length > 0 && (
        <ul className="space-y-1 text-sm">
          {health.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-rohu-text">
              <span className={theme.ring}>•</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
