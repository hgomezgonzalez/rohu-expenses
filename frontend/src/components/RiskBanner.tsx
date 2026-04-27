"use client";

import { AlertTriangle } from "lucide-react";
import type { RiskAlert } from "@/lib/health";

export default function RiskBanner({ alert }: { alert: RiskAlert }) {
  if (!alert.active) return null;
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-3 md:p-4 flex items-start gap-3 shadow-sm">
      <div className="flex-shrink-0 mt-0.5 p-2 bg-red-100 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-red-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-800">Atención: ciclo apretado</p>
        <p className="text-xs text-red-700 mt-0.5">{alert.message}</p>
      </div>
    </div>
  );
}
