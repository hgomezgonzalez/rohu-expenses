"use client";

import { useState } from "react";
import { TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Check, Clock } from "lucide-react";
import { CashflowForecast } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface CashflowCardProps {
  cashflow: CashflowForecast;
}

export default function CashflowCard({ cashflow }: CashflowCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const hasBreakdown = cashflow.income_breakdown && cashflow.income_breakdown.length > 0;

  return (
    <div className={`rounded-xl border p-4 ${cashflow.is_negative ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
      <div className="flex items-center gap-2 mb-4">
        {cashflow.is_negative ? (
          <AlertTriangle className="w-5 h-5 text-red-600" />
        ) : (
          <TrendingUp className="w-5 h-5 text-rohu-secondary" />
        )}
        <h3 className="font-bold text-lg">Flujo de caja</h3>
      </div>

      <div className="space-y-3">
        <div>
          <div
            className={`flex justify-between items-center ${hasBreakdown ? "cursor-pointer" : ""}`}
            onClick={() => hasBreakdown && setShowBreakdown(!showBreakdown)}
          >
            <span className="text-gray-600 flex items-center gap-1">
              Ingresos del mes
              {hasBreakdown && (
                showBreakdown
                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              )}
            </span>
            <div className="text-right">
              <span className="font-semibold text-rohu-secondary">+{formatCurrency(cashflow.total_income)}</span>
              {cashflow.income_confirmed > 0 && cashflow.income_expected > 0 && (
                <div className="flex gap-2 text-xs mt-0.5">
                  <span className="text-green-600 flex items-center gap-0.5">
                    <Check className="w-3 h-3" />{formatCurrency(cashflow.income_confirmed)}
                  </span>
                  <span className="text-blue-500 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />{formatCurrency(cashflow.income_expected)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {showBreakdown && hasBreakdown && (
            <div className="mt-2 ml-2 space-y-1.5 border-l-2 border-gray-200 pl-3">
              {cashflow.income_breakdown.map((b, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    {b.status === "confirmed" ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <Clock className="w-3 h-3 text-blue-400" />
                    )}
                    {b.source_name}
                    {b.is_one_time && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">puntual</span>}
                  </span>
                  <span className={`font-medium ${b.status === "confirmed" ? "text-green-600" : "text-gray-600"}`}>
                    {formatCurrency(b.effective_amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Ya pagado</span>
          <span className="font-semibold text-gray-700">-{formatCurrency(cashflow.total_paid)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Pendiente por pagar</span>
          <span className="font-semibold text-amber-600">-{formatCurrency(cashflow.total_pending)}</span>
        </div>
        <hr />
        <div className="flex justify-between items-center">
          <span className="font-bold text-gray-800">Saldo proyectado</span>
          <span className={`text-xl font-bold ${cashflow.is_negative ? "text-red-600" : "text-rohu-secondary"}`}>
            {formatCurrency(cashflow.projected_balance)}
          </span>
        </div>
      </div>

      {cashflow.is_negative && (
        <div className="mt-4 p-3 bg-red-100 rounded-lg text-red-700 text-sm font-medium">
          Tu saldo proyectado es negativo. Revisa tus gastos pendientes.
        </div>
      )}
    </div>
  );
}
