"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatCurrency, getMonthName } from "@/lib/utils";

export interface MonthSummary {
  year: number;
  month: number;
  spent: number;
  income: number;
  balance: number;
  budget_execution_pct: number; // actual / budget * 100
  on_time_pct: number; // 0..100, payment compliance
}

interface Props {
  months: MonthSummary[]; // expected length 3 in [oldest, mid, current] order
}

interface MetricRow {
  label: string;
  values: (string | number)[];
  rawValues: number[];
  /** When true, lower is better (e.g. spent). When false, higher is better (e.g. income, balance, on_time). */
  lowerIsBetter: boolean;
  unit?: "money" | "pct";
}

export default function Last3MonthsComparison({ months }: Props) {
  if (months.length < 2) {
    return (
      <div className="bg-white rounded-xl border p-4 md:p-5 shadow-sm">
        <h3 className="font-semibold text-sm mb-2">Comparativo últimos meses</h3>
        <p className="text-xs text-rohu-muted">Necesita al menos 2 meses de historial.</p>
      </div>
    );
  }

  const rows: MetricRow[] = [
    {
      label: "Gasto total",
      values: months.map((m) => formatCurrency(m.spent)),
      rawValues: months.map((m) => m.spent),
      lowerIsBetter: true,
      unit: "money",
    },
    {
      label: "Ingreso real",
      values: months.map((m) => formatCurrency(m.income)),
      rawValues: months.map((m) => m.income),
      lowerIsBetter: false,
      unit: "money",
    },
    {
      label: "Balance",
      values: months.map((m) => formatCurrency(m.balance)),
      rawValues: months.map((m) => m.balance),
      lowerIsBetter: false,
      unit: "money",
    },
    {
      label: "% ejecución",
      values: months.map((m) => `${m.budget_execution_pct.toFixed(0)}%`),
      rawValues: months.map((m) => m.budget_execution_pct),
      lowerIsBetter: true,
      unit: "pct",
    },
    {
      label: "Pagos a tiempo",
      values: months.map((m) => `${m.on_time_pct.toFixed(0)}%`),
      rawValues: months.map((m) => m.on_time_pct),
      lowerIsBetter: false,
      unit: "pct",
    },
  ];

  return (
    <div className="bg-white rounded-xl border p-4 md:p-5 shadow-sm overflow-x-auto">
      <h3 className="font-semibold text-sm mb-3">
        Comparativo últimos {months.length} meses · desviación del mes actual vs promedio anterior
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left font-medium text-rohu-muted pb-2 pr-2"></th>
            {months.map((m, i) => {
              const isCurrent = i === months.length - 1;
              return (
                <th
                  key={`${m.year}-${m.month}`}
                  className={`text-right pb-2 px-2 font-semibold ${isCurrent ? "text-rohu-primary" : "text-rohu-muted"}`}
                >
                  {getMonthName(m.month).slice(0, 3)}
                  {isCurrent && <span className="ml-1 text-[10px] uppercase">actual</span>}
                </th>
              );
            })}
            <th className="text-right pb-2 pl-2 font-medium text-rohu-muted">vs prom</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const currentRaw = row.rawValues[row.rawValues.length - 1];
            const prior = row.rawValues.slice(0, -1);
            const priorAvg = prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : 0;
            const delta = priorAvg !== 0 ? ((currentRaw - priorAvg) / Math.abs(priorAvg)) * 100 : 0;
            const isImprovement = row.lowerIsBetter ? delta < 0 : delta > 0;
            return (
              <tr key={row.label} className="border-t border-gray-100">
                <td className="py-2 pr-2 text-rohu-text font-medium">{row.label}</td>
                {row.values.map((v, i) => {
                  const isCurrent = i === row.values.length - 1;
                  return (
                    <td
                      key={i}
                      className={`py-2 px-2 text-right tabular-nums ${isCurrent ? "font-semibold text-rohu-text" : "text-rohu-muted"}`}
                    >
                      {v}
                    </td>
                  );
                })}
                <td className="py-2 pl-2 text-right">
                  <DeltaPill delta={delta} isImprovement={isImprovement} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeltaPill({ delta, isImprovement }: { delta: number; isImprovement: boolean }) {
  if (Math.abs(delta) < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rohu-muted">
        <Minus className="w-3 h-3" /> 0%
      </span>
    );
  }
  const positive = delta > 0;
  const color = isImprovement ? "text-emerald-700" : "text-red-700";
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {positive ? "+" : ""}
      {delta.toFixed(0)}%
    </span>
  );
}
