// Pure helpers that compute "how was this month/cycle" metrics from data we
// already fetch (DashboardSummary, CashflowForecast, BillInstance[]). All
// numbers stay client-side — no new endpoints needed.

import type { BillInstance, CashflowForecast, DashboardSummary } from "./api";

export interface PaymentRate {
  on_time: number;
  late: number;
  unpaid: number;
  total: number;
  on_time_pct: number; // 0..100
}

export function computePaymentRate(bills: BillInstance[]): PaymentRate {
  let on_time = 0;
  let late = 0;
  let unpaid = 0;
  for (const b of bills) {
    if (b.status === "cancelled") continue;
    if (b.status === "paid") {
      // Paid on or before due_date → on time, else late.
      if (b.paid_at && b.due_date && new Date(b.paid_at) <= new Date(b.due_date + "T23:59:59")) {
        on_time++;
      } else {
        late++;
      }
    } else {
      unpaid++;
    }
  }
  const total = on_time + late + unpaid;
  const on_time_pct = total > 0 ? (on_time / total) * 100 : 0;
  return { on_time, late, unpaid, total, on_time_pct };
}

export interface SavingsRate {
  income: number;
  spent: number;
  saved: number;
  pct: number; // 0..100 (negative possible)
}

export function computeSavingsRate(cashflow: CashflowForecast): SavingsRate {
  const income = Number(cashflow.total_income) || 0;
  const spent = Number(cashflow.total_paid) || 0;
  const saved = income - spent;
  const pct = income > 0 ? (saved / income) * 100 : 0;
  return { income, spent, saved, pct };
}

export interface CommitmentRate {
  committed: number;
  income: number;
  pct: number; // 0..100
}

export function computeCommitmentRate(summary: DashboardSummary, cashflow: CashflowForecast): CommitmentRate {
  // total_pending already sums (pending + due_soon + overdue) per dashboard_service.
  const committed = Number(summary.total_pending) || 0;
  const income = Number(cashflow.total_income) || 0;
  const pct = income > 0 ? (committed / income) * 100 : 0;
  return { committed, income, pct };
}

export interface FreeCashMargin {
  amount: number;
  pct_of_income: number; // 0..100
}

export function computeFreeCashMargin(cashflow: CashflowForecast): FreeCashMargin {
  // projected_balance = total_income - total_paid - total_pending
  const amount = Number(cashflow.projected_balance) || 0;
  const income = Number(cashflow.total_income) || 0;
  const pct_of_income = income > 0 ? (amount / income) * 100 : 0;
  return { amount, pct_of_income };
}

export type HealthLabel = "great" | "okay" | "tight";

export interface HealthScore {
  score: number; // 0..100
  label: HealthLabel;
  emoji: string;
  title: string; // "Buen mes" / "Mes regular" / "Mes difícil"
  factors: {
    budget_execution: { value: number; weight: number; ok: boolean };
    free_margin: { value: number; weight: number; ok: boolean };
    payment_compliance: { value: number; weight: number; ok: boolean };
  };
  highlights: string[]; // 2-3 bullets ready to render
}

export function computeHealthScore(
  summary: DashboardSummary,
  cashflow: CashflowForecast,
  bills: BillInstance[]
): HealthScore {
  // Factor 1 (40%): budget execution health. We approximate with commitment rate
  // (lower commitment → better). 0% commit → 40 points. 100% commit → 0 points.
  const commit = computeCommitmentRate(summary, cashflow);
  const budgetPoints = Math.max(0, 40 * (1 - commit.pct / 100));

  // Factor 2 (40%): projected free margin. Positive → full 40. Negative → 0.
  const margin = computeFreeCashMargin(cashflow);
  const marginPoints = margin.amount >= 0
    ? Math.min(40, 40 * Math.max(0, margin.pct_of_income) / 15) // 15% of income → full
    : 0;

  // Factor 3 (20%): payment compliance.
  const pay = computePaymentRate(bills);
  const compliancePoints = (pay.on_time_pct / 100) * 20;

  const raw = budgetPoints + marginPoints + compliancePoints;
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  let label: HealthLabel;
  let emoji: string;
  let title: string;
  if (score >= 80) { label = "great"; emoji = "😊"; title = "Buen mes"; }
  else if (score >= 60) { label = "okay"; emoji = "😐"; title = "Mes regular"; }
  else { label = "tight"; emoji = "😟"; title = "Mes difícil"; }

  const highlights: string[] = [];
  if (commit.pct < 70) highlights.push(`Solo ${commit.pct.toFixed(0)}% de tus ingresos comprometidos`);
  else if (commit.pct > 85) highlights.push(`${commit.pct.toFixed(0)}% de tus ingresos comprometidos en pagos`);

  if (margin.amount > 0) highlights.push(`Margen libre proyectado: ${formatShort(margin.amount)}`);
  else highlights.push(`Saldo proyectado negativo: ${formatShort(margin.amount)}`);

  if (pay.total > 0) {
    if (pay.on_time_pct >= 90) highlights.push(`${pay.on_time_pct.toFixed(0)}% de facturas pagadas a tiempo`);
    else if (pay.unpaid > 0) highlights.push(`${pay.unpaid} factura${pay.unpaid > 1 ? "s" : ""} pendiente${pay.unpaid > 1 ? "s" : ""}`);
    else if (pay.late > 0) highlights.push(`${pay.late} factura${pay.late > 1 ? "s" : ""} pagada${pay.late > 1 ? "s" : ""} tarde`);
  }

  return {
    score,
    label,
    emoji,
    title,
    factors: {
      budget_execution: { value: commit.pct, weight: 40, ok: commit.pct < 85 },
      free_margin: { value: margin.amount, weight: 40, ok: margin.amount >= 0 },
      payment_compliance: { value: pay.on_time_pct, weight: 20, ok: pay.on_time_pct >= 80 },
    },
    highlights: highlights.slice(0, 3),
  };
}

export interface RiskAlert {
  active: boolean;
  message: string;
}

export function computeRiskAlert(
  summary: DashboardSummary,
  cashflow: CashflowForecast,
  cycleEndIso?: string | null
): RiskAlert {
  const commit = computeCommitmentRate(summary, cashflow);
  const margin = computeFreeCashMargin(cashflow);
  const active = commit.pct > 85 && margin.amount < 200000;

  if (!active) return { active: false, message: "" };

  const parts = [
    `${commit.pct.toFixed(0)}% de tus ingresos ya están comprometidos`,
    `margen libre: ${formatShort(margin.amount)}`,
  ];
  let suffix = "";
  if (cycleEndIso) {
    const d = new Date(cycleEndIso + "T00:00:00");
    suffix = ` antes del ${d.getDate()} de ${d.toLocaleDateString("es-CO", { month: "short" })}`;
  }
  return {
    active: true,
    message: `Este ciclo está apretado: ${parts.join(", ")}. Considera recortar gastos discrecionales${suffix}.`,
  };
}

function formatShort(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}
