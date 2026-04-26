"use client";

import { useEffect, useState } from "react";
import { getBudgetVariance, getCashflow, BudgetVariance, CashflowForecast } from "@/lib/api";
import { formatCurrency, getMonthName } from "@/lib/utils";

interface MonthData {
  year: number;
  month: number;
  budget: number;
  actual: number;
  pctExecution: number;
  balance: number;
}

export default function TrendTable() {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrend();
  }, []);

  async function loadTrend() {
    const now = new Date();
    const months: { y: number; m: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
    }

    try {
      const results = await Promise.all(
        months.map(async ({ y, m }) => {
          const [v, c] = await Promise.all([
            getBudgetVariance(y, m).catch(() => null),
            getCashflow(y, m).catch(() => null),
          ]);
          return {
            year: y,
            month: m,
            budget: v?.total_budget || 0,
            actual: v?.total_actual || 0,
            pctExecution: v && v.total_budget > 0 ? (v.total_actual / v.total_budget) * 100 : 0,
            balance: c?.projected_balance || 0,
          };
        })
      );
      setData(results.filter((r) => r.budget > 0 || r.actual > 0));
    } catch {}
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-bold text-base mb-3">Tendencia mensual</h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-4 text-center">
        <h3 className="font-bold text-base mb-2">Tendencia mensual</h3>
        <p className="text-sm text-rohu-muted">No hay datos históricos aún</p>
      </div>
    );
  }

  const maxBudget = Math.max(...data.map((d) => d.budget), 1);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  return (
    <div className="bg-white rounded-xl border p-4 overflow-x-auto">
      <h3 className="font-bold text-base mb-3">Tendencia últimos meses</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-rohu-muted border-b">
            <th className="text-left py-2 font-medium">Mes</th>
            <th className="text-right py-2 font-medium">Presupuesto</th>
            <th className="text-right py-2 font-medium">Gastado</th>
            <th className="text-right py-2 font-medium">% Ejec.</th>
            <th className="text-right py-2 font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => {
            const isCurrent = d.month === currentMonth && d.year === currentYear;
            const overBudget = d.pctExecution > 100;
            return (
              <tr key={`${d.year}-${d.month}`} className={`border-b last:border-0 ${isCurrent ? "bg-rohu-primary/5" : ""}`}>
                <td className="py-2 font-medium">
                  {getMonthName(d.month).slice(0, 3)} {d.year}
                  {isCurrent && <span className="ml-1 text-[9px] bg-rohu-primary/10 text-rohu-primary px-1 rounded">Actual</span>}
                </td>
                <td className="text-right py-2">
                  <span>{formatCurrency(d.budget)}</span>
                  <div className="h-1 bg-gray-100 rounded mt-0.5">
                    <div className="h-full bg-rohu-primary/30 rounded" style={{ width: `${(d.budget / maxBudget) * 100}%` }} />
                  </div>
                </td>
                <td className="text-right py-2">
                  <span>{formatCurrency(d.actual)}</span>
                  <div className="h-1 bg-gray-100 rounded mt-0.5">
                    <div className={`h-full rounded ${overBudget ? "bg-red-400" : "bg-rohu-secondary"}`}
                      style={{ width: `${(d.actual / maxBudget) * 100}%` }} />
                  </div>
                </td>
                <td className={`text-right py-2 font-bold ${overBudget ? "text-red-600" : "text-rohu-secondary"}`}>
                  {d.pctExecution.toFixed(0)}%
                </td>
                <td className={`text-right py-2 font-medium ${d.balance < 0 ? "text-red-600" : "text-rohu-secondary"}`}>
                  {formatCurrency(d.balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
