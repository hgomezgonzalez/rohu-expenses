"use client";

import { CashflowForecast } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export default function SavingsGauge({ cashflow }: { cashflow: CashflowForecast }) {
  if (cashflow.total_income <= 0) {
    return (
      <div className="bg-white rounded-xl border p-4 text-center">
        <h3 className="font-bold text-base mb-2">Tasa de ahorro</h3>
        <p className="text-sm text-rohu-muted">Configura tus ingresos para ver tu tasa de ahorro</p>
      </div>
    );
  }

  const saved = cashflow.total_income - cashflow.total_paid - cashflow.total_pending;
  const rate = Math.max(0, Math.min(100, (saved / cashflow.total_income) * 100));
  const isNegative = saved < 0;

  // Color zones
  let color = "#EF4444"; // red
  let zone = "low";
  if (rate >= 20) { color = "#10B981"; zone = "high"; }
  else if (rate >= 10) { color = "#F59E0B"; zone = "mid"; }

  const fillDeg = Math.min(180, (rate / 100) * 180);

  const insights: Record<string, string> = {
    low: "Tu tasa de ahorro es baja. Intenta reducir gastos variables.",
    mid: "Buen inicio. La meta recomendada es el 20%.",
    high: "Excelente. Estás ahorrando más del 20% de tus ingresos.",
  };

  return (
    <div className="bg-white rounded-xl border p-4 text-center">
      <h3 className="font-bold text-base mb-4">Tasa de ahorro</h3>

      {/* Gauge */}
      <div className="relative w-36 h-[72px] mx-auto mb-3 overflow-hidden">
        <div
          className="w-36 h-36 rounded-full"
          style={{
            background: `conic-gradient(from 180deg, ${color} 0deg ${fillDeg}deg, #e5e7eb ${fillDeg}deg 180deg)`,
          }}
        />
        {/* Inner white circle */}
        <div className="absolute top-3 left-3 w-[120px] h-[120px] rounded-full bg-white" />
        {/* Value */}
        <div className="absolute bottom-0 left-0 right-0 text-center">
          <span className="text-2xl font-bold" style={{ color }}>
            {isNegative ? "0" : rate.toFixed(0)}%
          </span>
        </div>
      </div>

      <p className="text-sm font-medium" style={{ color }}>
        {isNegative ? "Gastas más de lo que ingresa" : `Ahorrado: ${formatCurrency(saved)}`}
      </p>
      <p className="text-xs text-rohu-muted mt-1">
        {isNegative ? "Revisa tus gastos urgentemente" : insights[zone]}
      </p>
    </div>
  );
}
