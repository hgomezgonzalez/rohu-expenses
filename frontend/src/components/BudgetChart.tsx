"use client";

import { BudgetVariance } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface BudgetChartProps {
  variance: BudgetVariance;
}

export default function BudgetChart({ variance }: BudgetChartProps) {
  const maxAmount = Math.max(
    ...variance.items.map((i) => Math.max(i.budget_amount, i.actual_paid)),
    1
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg">Presupuesto vs Ejecutado</h3>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-rohu-primary inline-block" /> Presupuestado
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-rohu-secondary inline-block" /> Ejecutado
          </span>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3 mb-6 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div>
          <p className="text-xs text-gray-500">Presupuesto</p>
          <p className="font-bold text-rohu-primary">{formatCurrency(variance.total_budget)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Ejecutado</p>
          <p className="font-bold text-rohu-secondary">{formatCurrency(variance.total_actual)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Desviación</p>
          <p className={`font-bold ${variance.total_variance >= 0 ? "text-rohu-secondary" : "text-red-600"}`}>
            {variance.total_variance >= 0 ? "+" : ""}{formatCurrency(variance.total_variance)}
          </p>
        </div>
      </div>

      {/* Bars per category */}
      <div className="space-y-3">
        {variance.items.map((item) => {
          const budgetWidth = (item.budget_amount / maxAmount) * 100;
          const actualWidth = (item.actual_paid / maxAmount) * 100;
          const isOverBudget = item.actual_paid > item.budget_amount;

          return (
            <div key={item.category_slug}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{item.category_name}</span>
                <span className={`text-xs font-medium ${isOverBudget ? "text-red-600" : "text-rohu-secondary"}`}>
                  {item.variance_percentage > 0 ? "+" : ""}{Number(item.variance_percentage).toFixed(0)}%
                </span>
              </div>
              <div className="space-y-1">
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rohu-primary rounded-full transition-all"
                    style={{ width: `${budgetWidth}%` }}
                  />
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isOverBudget ? "bg-red-400" : "bg-rohu-secondary"}`}
                    style={{ width: `${actualWidth}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>{formatCurrency(item.budget_amount)}</span>
                <span>{formatCurrency(item.actual_paid)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
