"use client";

import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { CashflowForecast } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface CashflowCardProps {
  cashflow: CashflowForecast;
}

export default function CashflowCard({ cashflow }: CashflowCardProps) {
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
        <div className="flex justify-between">
          <span className="text-gray-600">Ingresos esperados</span>
          <span className="font-semibold text-rohu-secondary">+{formatCurrency(cashflow.total_income)}</span>
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
          ⚠️ Tu saldo proyectado es negativo. Revisa tus gastos pendientes.
        </div>
      )}
    </div>
  );
}
