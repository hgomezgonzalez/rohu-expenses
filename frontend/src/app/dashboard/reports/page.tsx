"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getDashboardFull, getBudgetVariance, getCashflow,
  BudgetVariance, CashflowForecast, DashboardSummary,
} from "@/lib/api";
import { getMonthName } from "@/lib/utils";
import BudgetChart from "@/components/BudgetChart";
import CashflowCard from "@/components/CashflowCard";
import SpendingDonut from "@/components/SpendingDonut";
import StatusBar from "@/components/StatusBar";
import SavingsGauge from "@/components/SavingsGauge";
import TrendTable from "@/components/TrendTable";

export default function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [variance, setVariance] = useState<BudgetVariance | null>(null);
  const [cashflow, setCashflow] = useState<CashflowForecast | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [full, v] = await Promise.all([
      getDashboardFull(year, month),
      getBudgetVariance(year, month),
    ]);
    setSummary(full.summary);
    setCashflow(full.cashflow);
    setVariance(v);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  function changeMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) { newMonth = 1; newYear++; }
    if (newMonth < 1) { newMonth = 12; newYear--; }
    setMonth(newMonth);
    setYear(newYear);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold">Reportes</h1>

      {/* Month selector */}
      <div className="flex items-center justify-between bg-white rounded-xl border px-4 py-3">
        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg min-h-[44px]">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">{getMonthName(month)} {year}</h2>
        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg min-h-[44px]">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Status bar */}
      {summary && <StatusBar summary={summary} />}

      {/* Donut + Savings gauge */}
      <div className="grid md:grid-cols-2 gap-4">
        {variance && <SpendingDonut variance={variance} />}
        {cashflow && <SavingsGauge cashflow={cashflow} />}
      </div>

      {/* Budget chart + Cashflow */}
      <div className="grid md:grid-cols-2 gap-4">
        {variance && variance.items.length > 0 ? (
          <BudgetChart variance={variance} />
        ) : (
          <div className="bg-white rounded-xl border p-6 text-center text-rohu-muted">
            <p>No hay datos de presupuesto</p>
            <p className="text-sm mt-1">Genera las facturas del mes primero</p>
          </div>
        )}
        {cashflow && <CashflowCard cashflow={cashflow} />}
      </div>

      {/* Trend table */}
      <TrendTable />
    </div>
  );
}
