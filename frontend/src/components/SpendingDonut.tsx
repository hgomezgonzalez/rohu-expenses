"use client";

import { BudgetVariance } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

const COLORS = ["#1E3A8A", "#10B981", "#06B6D4", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6B7280"];

export default function SpendingDonut({ variance }: { variance: BudgetVariance }) {
  const items = variance.items.filter((i) => i.actual_paid > 0);
  const total = items.reduce((s, i) => s + i.actual_paid, 0);
  if (total === 0) return null;

  // Build conic-gradient segments
  let cumulative = 0;
  const segments = items.map((item, idx) => {
    const pct = (item.actual_paid / total) * 100;
    const start = cumulative;
    cumulative += pct;
    return { ...item, pct, start, end: cumulative, color: COLORS[idx % COLORS.length] };
  });

  const gradient = segments
    .map((s) => `${s.color} ${s.start}% ${s.end}%`)
    .join(", ");

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="font-bold text-base mb-4">¿En qué gasté mi dinero?</h3>
      <div className="flex items-center gap-6">
        {/* Donut */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <div
            className="w-full h-full rounded-full"
            style={{ background: `conic-gradient(${gradient})` }}
          />
          <div className="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center">
            <span className="text-xs text-rohu-muted">Total</span>
            <span className="text-sm font-bold text-rohu-text">{formatCurrency(total)}</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex-1 space-y-1.5 min-w-0">
          {segments.map((s) => (
            <div key={s.category_slug} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="truncate flex-1">{s.category_name}</span>
              <span className="font-medium text-rohu-muted">{s.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
