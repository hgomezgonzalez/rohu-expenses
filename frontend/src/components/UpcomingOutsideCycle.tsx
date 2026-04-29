"use client";

import Link from "next/link";
import { CalendarClock, ArrowRight } from "lucide-react";
import { BillTemplate } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface Props {
  templates: BillTemplate[];
}

const MONTH_NAMES_ES = [
  "", "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_NAMES_ES[m] ?? m} ${y}`;
}

export default function UpcomingOutsideCycle({ templates }: Props) {
  // Active templates whose next instance falls outside the active cycle.
  // Sorted by next_instance_date ascending so the closest are at the top.
  const items = templates
    .filter((t) => t.is_active && !t.next_in_current_cycle && t.next_instance_date)
    .sort((a, b) => (a.next_instance_date ?? "").localeCompare(b.next_instance_date ?? ""));

  if (items.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-2">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="w-4 h-4 text-amber-700" />
        <h3 className="font-semibold text-sm text-amber-900">
          Próximas plantillas (fuera de este ciclo)
        </h3>
        <span className="text-xs text-amber-700 ml-auto">{items.length}</span>
      </div>
      <p className="text-xs text-amber-800 mb-3">
        Plantillas anuales, semestrales o bimestrales cuya próxima factura cae después del ciclo actual. Aparecerán automáticamente cuando llegue su mes.
      </p>
      <div className="space-y-1.5">
        {items.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 px-2 bg-white/70 rounded-lg text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{t.name}</p>
              <p className="text-xs text-amber-700">
                {formatShortDate(t.next_instance_date)} · {formatCurrency(t.estimated_amount)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <Link
        href="/dashboard/templates"
        className="inline-flex items-center gap-1 text-xs text-amber-800 hover:text-amber-900 hover:underline mt-3"
      >
        Editar plantillas <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
