"use client";

import { AlertCircle, Clock, CheckCircle, DollarSign } from "lucide-react";
import { DashboardSummary } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface SummaryCardsProps {
  summary: DashboardSummary;
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
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
      value: `${summary.count_due_soon} facturas`,
      count: summary.count_due_soon,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
    {
      label: "Total pendiente",
      value: formatCurrency(summary.total_pending),
      count: summary.count_pending + summary.count_due_soon + summary.count_overdue,
      icon: DollarSign,
      color: "text-rohu-primary",
      bg: "bg-rohu-primary/10",
      border: "border-rohu-primary/20",
    },
    {
      label: "Pagado este mes",
      value: formatCurrency(summary.total_paid),
      count: summary.count_paid,
      icon: CheckCircle,
      color: "text-rohu-secondary",
      bg: "bg-rohu-secondary/10",
      border: "border-rohu-secondary/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className={`p-4 rounded-xl border ${card.border} ${card.bg}`}>
          <div className="flex items-center gap-2 mb-2">
            <card.icon className={`w-5 h-5 ${card.color}`} />
            <span className="text-sm font-medium text-gray-600">{card.label}</span>
          </div>
          <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          <p className="text-xs text-gray-500 mt-1">{card.count} facturas</p>
        </div>
      ))}
    </div>
  );
}
