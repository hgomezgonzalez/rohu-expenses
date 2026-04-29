"use client";

import { AlertCircle, Clock, CheckCircle, Wallet } from "lucide-react";
import { DashboardSummary } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface SummaryCardsProps {
  summary: DashboardSummary;
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  // Total pending = overdue + due_soon + pending. The hero owns this aggregate;
  // the cards below are disjoint sub-buckets so the user never has to wonder
  // why three rows seem to add up to more than the total.
  const totalPendingCount = summary.count_overdue + summary.count_due_soon + summary.count_pending;
  const totalPendingAmount = summary.total_pending; // backend already sums overdue + pending

  const cards = [
    {
      label: "Vencidas",
      value: formatCurrency(summary.total_overdue),
      count: summary.count_overdue,
      icon: AlertCircle,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
    },
    {
      label: "Próximas a vencer",
      value: `${summary.count_due_soon} factura${summary.count_due_soon === 1 ? "" : "s"}`,
      count: summary.count_due_soon,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
    {
      label: "Pagadas",
      value: formatCurrency(summary.total_paid),
      count: summary.count_paid,
      icon: CheckCircle,
      color: "text-rohu-secondary",
      bg: "bg-rohu-secondary/10",
      border: "border-rohu-secondary/20",
    },
  ];

  return (
    <div className="space-y-3">
      {/* Hero: total a pagar este ciclo. Acción inmediata visible al instante. */}
      <div className="bg-gradient-to-br from-rohu-primary to-rohu-primary-dark text-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-5 h-5 text-white/80" />
          <span className="text-sm font-medium text-white/90">Por pagar este ciclo</span>
        </div>
        <p className="text-3xl font-bold tracking-tight">{formatCurrency(totalPendingAmount)}</p>
        <p className="text-xs text-white/80 mt-1">
          {totalPendingCount} factura{totalPendingCount === 1 ? "" : "s"} pendiente{totalPendingCount === 1 ? "" : "s"}
          {summary.count_overdue > 0 && ` · ${summary.count_overdue} vencida${summary.count_overdue === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Sub-buckets (disjoint): Vencidas | Próximas | Pagadas */}
      <div className="grid grid-cols-3 gap-3">
        {cards.map((card) => (
          <div key={card.label} className={`p-4 rounded-xl border ${card.border} ${card.bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-5 h-5 ${card.color}`} />
              <span className="text-sm font-medium text-gray-600">{card.label}</span>
            </div>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">
              {card.count} factura{card.count === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
