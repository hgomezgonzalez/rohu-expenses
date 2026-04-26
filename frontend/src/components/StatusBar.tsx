"use client";

import { DashboardSummary } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export default function StatusBar({ summary }: { summary: DashboardSummary }) {
  const total = summary.count_overdue + summary.count_due_soon + summary.count_pending + summary.count_paid;
  if (total === 0) return null;

  const pcts = {
    overdue: (summary.count_overdue / total) * 100,
    due_soon: (summary.count_due_soon / total) * 100,
    pending: (summary.count_pending / total) * 100,
    paid: (summary.count_paid / total) * 100,
  };

  const segments = [
    { key: "overdue", label: "Atrasado", count: summary.count_overdue, amount: summary.total_overdue, pct: pcts.overdue, color: "bg-red-500", text: "text-red-600" },
    { key: "due_soon", label: "Vence pronto", count: summary.count_due_soon, amount: 0, pct: pcts.due_soon, color: "bg-amber-400", text: "text-amber-600" },
    { key: "pending", label: "Programado", count: summary.count_pending, amount: 0, pct: pcts.pending, color: "bg-rohu-primary", text: "text-rohu-primary" },
    { key: "paid", label: "Pagado", count: summary.count_paid, amount: summary.total_paid, pct: pcts.paid, color: "bg-rohu-secondary", text: "text-rohu-secondary" },
  ];

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="font-bold text-base mb-3">Estado de pagos del mes</h3>
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {segments.map((s) => (
          <div key={s.key} className="text-center">
            <span className={`text-lg font-bold ${s.text}`}>{s.count}</span>
            <p className="text-[10px] text-rohu-muted leading-tight">{s.label}</p>
          </div>
        ))}
      </div>
      {/* Bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        {segments.map((s) =>
          s.pct > 0 ? (
            <div key={s.key} className={`${s.color} transition-all`} style={{ width: `${s.pct}%` }} />
          ) : null
        )}
      </div>
    </div>
  );
}
