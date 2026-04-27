"use client";

import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import type { PaymentRate } from "@/lib/health";

const TARGET_ON_TIME_PCT = 90;

export default function PaymentRateBar({ rate }: { rate: PaymentRate }) {
  const total = rate.total;
  if (total === 0) {
    return (
      <div className="bg-white rounded-xl border p-4 md:p-5 shadow-sm">
        <h3 className="font-semibold text-sm mb-2">Cumplimiento de pago</h3>
        <p className="text-xs text-rohu-muted">Sin facturas en este periodo</p>
      </div>
    );
  }

  const onTimePct = (rate.on_time / total) * 100;
  const latePct = (rate.late / total) * 100;
  const unpaidPct = (rate.unpaid / total) * 100;
  const meetingTarget = onTimePct >= TARGET_ON_TIME_PCT;

  return (
    <div className="bg-white rounded-xl border p-4 md:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Cumplimiento de pago</h3>
        <span
          className={`text-xs font-semibold ${meetingTarget ? "text-emerald-700" : "text-amber-700"}`}
        >
          {onTimePct.toFixed(0)}% a tiempo
        </span>
      </div>

      <div
        className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100"
        role="img"
        aria-label={`A tiempo ${rate.on_time}, tarde ${rate.late}, sin pagar ${rate.unpaid}`}
      >
        <div className="h-full bg-emerald-500" style={{ width: `${onTimePct}%` }} />
        <div className="h-full bg-amber-400" style={{ width: `${latePct}%` }} />
        <div className="h-full bg-red-400" style={{ width: `${unpaidPct}%` }} />
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-xs">
        <Legend
          icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
          label="A tiempo"
          count={rate.on_time}
          total={total}
        />
        <Legend
          icon={<Clock className="w-3.5 h-3.5 text-amber-600" />}
          label="Tarde"
          count={rate.late}
          total={total}
        />
        <Legend
          icon={<AlertCircle className="w-3.5 h-3.5 text-red-500" />}
          label="Sin pagar"
          count={rate.unpaid}
          total={total}
        />
      </div>

      <p
        className={`text-xs mt-3 ${meetingTarget ? "text-emerald-700" : "text-amber-700"}`}
      >
        Meta: {TARGET_ON_TIME_PCT}% — {meetingTarget ? "objetivo cumplido" : "por debajo del objetivo"}
      </p>
    </div>
  );
}

function Legend({
  icon, label, count, total,
}: { icon: React.ReactNode; label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-rohu-muted">
      {icon}
      <span className="font-medium text-rohu-text">{count}</span>
      {label} ({pct.toFixed(0)}%)
    </span>
  );
}
