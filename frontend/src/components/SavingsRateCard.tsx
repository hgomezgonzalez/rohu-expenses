"use client";

import { TrendingDown, TrendingUp, Minus, PiggyBank } from "lucide-react";
import type { SavingsRate } from "@/lib/health";
import { formatCurrency } from "@/lib/utils";

interface Props {
  current: SavingsRate;
  previousPct?: number; // last month's savings % for delta
}

export default function SavingsRateCard({ current, previousPct }: Props) {
  const delta = previousPct !== undefined ? current.pct - previousPct : null;
  const positive = current.saved >= 0;
  const ringColor = positive ? "text-emerald-700" : "text-red-700";
  const barColor = positive ? "bg-emerald-500" : "bg-red-500";

  // For visual scale we cap the bar at 0..50% so the bar is meaningful in
  // typical personal finance ranges; values above 50% just clamp visually.
  const visualPct = Math.max(0, Math.min(50, current.pct));
  const barPct = (visualPct / 50) * 100;

  return (
    <div className="bg-white rounded-xl border p-4 md:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PiggyBank className="w-4 h-4 text-rohu-accent" />
          <h3 className="font-semibold text-sm">Tasa de ahorro real</h3>
        </div>
        {delta !== null && (
          <DeltaBadge value={delta} suffix="pp" />
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-3xl font-bold ${ringColor}`}>
          {current.pct.toFixed(1)}%
        </span>
        <span className="text-sm text-rohu-muted">{formatCurrency(current.saved)}</span>
      </div>

      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${barPct}%` }} />
      </div>

      <div className="flex justify-between text-xs text-rohu-muted">
        <span>Ingresos {formatCurrency(current.income)}</span>
        <span>Gasto real {formatCurrency(current.spent)}</span>
      </div>
    </div>
  );
}

function DeltaBadge({ value, suffix }: { value: number; suffix: string }) {
  if (Math.abs(value) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rohu-muted">
        <Minus className="w-3 h-3" /> sin cambio
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-700" : "text-red-700"}`}
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? "+" : ""}
      {value.toFixed(1)} {suffix}
    </span>
  );
}
