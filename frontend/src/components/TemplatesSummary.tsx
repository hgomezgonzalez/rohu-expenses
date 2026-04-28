"use client";

import { FileText, ToggleRight, ToggleLeft, DollarSign } from "lucide-react";
import { BillTemplate, Category } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface Props {
  templates: BillTemplate[];
  categories: Category[];
  filterCategory: string;
  onFilterCategory: (id: string) => void;
}

// Recurrence multiplier to estimate monthly equivalent.
// monthly = 1, bimonthly = 1/2, quarterly = 1/3, semiannual = 1/6, annual = 1/12.
const MONTHLY_FACTOR: Record<string, number> = {
  monthly: 1,
  bimonthly: 1 / 2,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
};

export default function TemplatesSummary({ templates, categories, filterCategory, onFilterCategory }: Props) {
  const total = templates.length;
  const active = templates.filter((t) => t.is_active).length;
  const inactive = total - active;

  // Estimated monthly cost: sum of (amount * monthly_factor) only for active templates.
  const monthlyEstimate = templates.reduce((sum, t) => {
    if (!t.is_active) return sum;
    const factor = MONTHLY_FACTOR[t.recurrence_type] ?? 1;
    return sum + Number(t.estimated_amount) * factor;
  }, 0);

  // Counts per category — active templates only.
  const countByCategory = new Map<string, number>();
  for (const t of templates) {
    if (!t.is_active) continue;
    countByCategory.set(t.category.id, (countByCategory.get(t.category.id) ?? 0) + 1);
  }

  const cards = [
    {
      label: "Total",
      value: String(total),
      icon: FileText,
      color: "text-rohu-primary",
      bg: "bg-rohu-primary/10",
      border: "border-rohu-primary/20",
    },
    {
      label: "Activas",
      value: String(active),
      icon: ToggleRight,
      color: "text-rohu-secondary",
      bg: "bg-rohu-secondary/10",
      border: "border-rohu-secondary/20",
    },
    {
      label: "Inactivas",
      value: String(inactive),
      icon: ToggleLeft,
      color: "text-gray-600",
      bg: "bg-gray-50",
      border: "border-gray-200",
    },
    {
      label: "Estimado mensual",
      value: formatCurrency(monthlyEstimate),
      icon: DollarSign,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className={`p-4 rounded-xl border ${card.border} ${card.bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-5 h-5 ${card.color}`} />
              <span className="text-sm font-medium text-gray-600">{card.label}</span>
            </div>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Category pills (only categories with at least 1 active template) */}
      {countByCategory.size > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onFilterCategory("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filterCategory === "all"
                ? "bg-rohu-primary text-white border-rohu-primary"
                : "bg-white text-rohu-muted border-gray-200 hover:bg-gray-50"
            }`}
          >
            Todas ({active})
          </button>
          {categories
            .filter((c) => countByCategory.has(c.id))
            .map((c) => {
              const isSelected = filterCategory === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onFilterCategory(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    isSelected
                      ? "bg-rohu-accent text-white border-rohu-accent"
                      : "bg-white text-rohu-muted border-gray-200 hover:bg-gray-50"
                  }`}
                  style={isSelected ? undefined : { color: c.color || undefined }}
                >
                  {c.name} ({countByCategory.get(c.id)})
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
