"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getDashboardFull, getDashboardByCycle, getBudgetVariance, getBudgetVarianceByCycle,
  getPayCycle, PayCycleResponse,
  BudgetVariance, BudgetVarianceItem, CashflowForecast, DashboardSummary, BillInstance,
} from "@/lib/api";
import { getMonthName } from "@/lib/utils";
import {
  computeHealthScore, computePaymentRate, computeRiskAlert, computeSavingsRate,
} from "@/lib/health";

import BudgetChart from "@/components/BudgetChart";
import CashflowCard from "@/components/CashflowCard";
import SpendingDonut from "@/components/SpendingDonut";
import StatusBar from "@/components/StatusBar";
import SavingsGauge from "@/components/SavingsGauge";
import TrendTable from "@/components/TrendTable";

import HealthScoreCard from "@/components/HealthScoreCard";
import RiskBanner from "@/components/RiskBanner";
import SavingsRateCard from "@/components/SavingsRateCard";
import PaymentRateBar from "@/components/PaymentRateBar";
import SparklineHistogram, { SparkPoint } from "@/components/SparklineHistogram";
import CategoryHeatMap, { HeatRow } from "@/components/CategoryHeatMap";
import Last3MonthsComparison, { MonthSummary } from "@/components/Last3MonthsComparison";

interface SixMonthsData {
  variances: { year: number; month: number; variance: BudgetVariance | null }[];
  full: { year: number; month: number; full: { summary: DashboardSummary; cashflow: CashflowForecast; bills: BillInstance[] } | null }[];
}

export default function ReportsPage() {
  const pathname = usePathname();

  // Period state — supports both calendar month and pay cycle modes.
  // `nowRef` is captured once on mount so callbacks that depend on "today"
  // don't recreate every render (which previously caused an infinite refetch
  // loop when used as a useCallback dependency).
  const nowRef = useRef(new Date());
  const now = nowRef.current;
  const todayIso = now.toISOString().slice(0, 10);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [cycle, setCycle] = useState<PayCycleResponse | null>(null);
  const [cycleRef, setCycleRef] = useState<string>(todayIso);
  const isCycleMode = !!cycle?.configured;

  // Current period payload
  const [variance, setVariance] = useState<BudgetVariance | null>(null);
  const [cashflow, setCashflow] = useState<CashflowForecast | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [bills, setBills] = useState<BillInstance[]>([]);

  // Historical (last 6 calendar months)
  const [history, setHistory] = useState<SixMonthsData | null>(null);

  const [loading, setLoading] = useState(true);

  // Derive the calendar year/month used for monthly-only views (donut, budget
  // chart by category) when in cycle mode. We anchor on the cycle's end month
  // so the "this period" donut/budget shows the cycle's representative month.
  const anchor = useMemo(() => {
    if (isCycleMode && cycle?.end_date) {
      const [y, m] = cycle.end_date.split("-");
      return { year: parseInt(y), month: parseInt(m) };
    }
    return { year, month };
  }, [isCycleMode, cycle, year, month]);

  // Load pay cycle once.
  useEffect(() => {
    getPayCycle(todayIso).then(setCycle).catch(() => setCycle({ configured: false } as PayCycleResponse));
  }, [todayIso]);

  const loadCurrent = useCallback(async () => {
    if (cycle === null) return;
    setLoading(true);
    try {
      // Variance and dashboard data must agree on the same window, so when the
      // user is in cycle mode we use the cycle-aware variance endpoint instead
      // of the calendar-month one. Otherwise the BudgetChart shows $0 ejecutado
      // because pagos del ciclo viven en el mes calendario anterior.
      const v = isCycleMode
        ? await getBudgetVarianceByCycle(cycleRef)
        : await getBudgetVariance(anchor.year, anchor.month);
      setVariance(v);
      if (isCycleMode) {
        const data = await getDashboardByCycle(cycleRef);
        setSummary(data.summary);
        setCashflow(data.cashflow);
        setBills(data.bills);
      } else {
        const data = await getDashboardFull(year, month);
        setSummary(data.summary);
        setCashflow(data.cashflow);
        setBills(data.bills);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [cycle, isCycleMode, cycleRef, year, month, anchor.year, anchor.month]);

  // Load last 6 calendar months in parallel for sparkline / heatmap / 3m compare.
  // Empty deps: `nowRef.current` is stable across renders, so this callback only
  // exists once and doesn't loop the useEffect below.
  const loadHistory = useCallback(async () => {
    const base = nowRef.current;
    const sixMonths: { y: number; m: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      sixMonths.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
    }
    const [variances, fulls] = await Promise.all([
      Promise.all(sixMonths.map((p) => getBudgetVariance(p.y, p.m).catch(() => null))),
      Promise.all(sixMonths.map((p) => getDashboardFull(p.y, p.m).catch(() => null))),
    ]);
    setHistory({
      variances: sixMonths.map((p, i) => ({ year: p.y, month: p.m, variance: variances[i] })),
      full: sixMonths.map((p, i) => ({ year: p.y, month: p.m, full: fulls[i] })),
    });
  }, []);

  useEffect(() => { loadCurrent(); }, [loadCurrent]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Refetch on pure in-app navigation back into /dashboard/reports.
  useEffect(() => {
    if (pathname === "/dashboard/reports") {
      loadCurrent();
      loadHistory();
    }
  }, [pathname, loadCurrent, loadHistory]);

  function changePeriod(delta: number) {
    if (isCycleMode) {
      getPayCycle(cycleRef, delta).then((c) => {
        setCycle(c);
        if (c?.start_date) setCycleRef(c.start_date);
      });
    } else {
      let newMonth = month + delta;
      let newYear = year;
      if (newMonth > 12) { newMonth = 1; newYear++; }
      if (newMonth < 1) { newMonth = 12; newYear--; }
      setMonth(newMonth);
      setYear(newYear);
    }
  }

  const periodLabel = isCycleMode && cycle?.label ? cycle.label : `${getMonthName(month)} ${year}`;

  // Derived metrics for the current period
  const health = useMemo(() => {
    if (!summary || !cashflow) return null;
    return computeHealthScore(summary, cashflow, bills);
  }, [summary, cashflow, bills]);

  const riskAlert = useMemo(() => {
    if (!summary || !cashflow) return { active: false, message: "" };
    return computeRiskAlert(summary, cashflow, cycle?.end_date);
  }, [summary, cashflow, cycle]);

  const paymentRate = useMemo(() => computePaymentRate(bills), [bills]);
  const savings = useMemo(() => (cashflow ? computeSavingsRate(cashflow) : null), [cashflow]);

  // Last month savings rate (calendar month-over-month, regardless of cycle mode)
  const previousSavingsPct = useMemo(() => {
    if (!history) return undefined;
    const prev = history.full[history.full.length - 2];
    if (!prev?.full) return undefined;
    return computeSavingsRate(prev.full.cashflow).pct;
  }, [history]);

  // Sparkline points: total spent (total_paid + total_pending) per calendar month.
  const sparkPoints: SparkPoint[] = useMemo(() => {
    if (!history) return [];
    return history.full.map(({ year: y, month: m, full }) => ({
      year: y,
      month: m,
      value: full ? Number(full.summary.total_paid) + Number(full.summary.total_pending) : 0,
    }));
  }, [history]);

  // Heatmap rows: top 8 categories by total spend across the 6-month window.
  const heatmap = useMemo(() => {
    if (!history) return { rows: [] as HeatRow[], months: [] as { year: number; month: number }[] };
    const months = history.variances.map((v) => ({ year: v.year, month: v.month }));
    const slugTotals = new Map<string, { name: string; total: number }>();
    for (const v of history.variances) {
      if (!v.variance) continue;
      for (const item of v.variance.items as BudgetVarianceItem[]) {
        const cur = slugTotals.get(item.category_slug) || { name: item.category_name, total: 0 };
        cur.total += Number(item.actual_paid) || 0;
        slugTotals.set(item.category_slug, cur);
      }
    }
    const topSlugs = [...slugTotals.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([slug]) => slug);

    const rows: HeatRow[] = topSlugs.map((slug) => ({
      category_slug: slug,
      category_name: slugTotals.get(slug)?.name || slug,
      cells: history.variances.map((v) => {
        const item = v.variance?.items.find((i) => i.category_slug === slug);
        if (!item) return { year: v.year, month: v.month, pct: 0 };
        const budget = Number(item.budget_amount) || 0;
        const actual = Number(item.actual_paid) || 0;
        const pct = budget > 0 ? (actual / budget) * 100 : actual > 0 ? 200 : 0;
        return { year: v.year, month: v.month, pct };
      }),
    }));
    return { rows, months };
  }, [history]);

  // Last 3 months comparison.
  const last3: MonthSummary[] = useMemo(() => {
    if (!history) return [];
    const last3Slice = history.full.slice(-3);
    return last3Slice
      .filter((x) => x.full)
      .map(({ year: y, month: m, full }) => {
        const f = full!;
        const spent = Number(f.summary.total_paid);
        const income = Number(f.cashflow.total_income);
        const variance = history.variances.find((v) => v.year === y && v.month === m)?.variance;
        const budgetTotal = variance ? Number(variance.total_budget) : 0;
        const actualTotal = variance ? Number(variance.total_actual) : 0;
        const exec = budgetTotal > 0 ? (actualTotal / budgetTotal) * 100 : 0;
        const rate = computePaymentRate(f.bills);
        return {
          year: y,
          month: m,
          spent,
          income,
          balance: income - spent,
          budget_execution_pct: exec,
          on_time_pct: rate.on_time_pct,
        };
      });
  }, [history]);

  if (loading && !history) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold">Reportes</h1>

      {/* Period selector */}
      <div className="flex items-center justify-between bg-white rounded-xl border px-4 py-3">
        <button onClick={() => changePeriod(-1)} className="p-2 hover:bg-gray-100 rounded-lg min-h-[44px]" aria-label="Periodo anterior">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg md:text-xl font-bold text-center">{periodLabel}</h2>
        <button onClick={() => changePeriod(1)} className="p-2 hover:bg-gray-100 rounded-lg min-h-[44px]" aria-label="Periodo siguiente">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* ZONE 1 — VERDICT */}
      <RiskBanner alert={riskAlert} />
      {health && <HealthScoreCard health={health} periodLabel={periodLabel} />}
      <div className="grid md:grid-cols-2 gap-4">
        {savings && <SavingsRateCard current={savings} previousPct={previousSavingsPct} />}
        <PaymentRateBar rate={paymentRate} />
      </div>

      {/* ZONE 2 — DETAIL */}
      {summary && <StatusBar summary={summary} />}
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
      <div className="grid md:grid-cols-2 gap-4">
        {variance && <SpendingDonut variance={variance} />}
        {cashflow && <SavingsGauge cashflow={cashflow} />}
      </div>
      <SparklineHistogram
        title="Gasto mensual · últimos 6 meses"
        points={sparkPoints}
        currentIndex={sparkPoints.length - 1}
      />

      {/* ZONE 3 — HISTORICAL & PATTERNS */}
      {last3.length >= 2 && <Last3MonthsComparison months={last3} />}
      <CategoryHeatMap rows={heatmap.rows} months={heatmap.months} />
      <TrendTable />
    </div>
  );
}
