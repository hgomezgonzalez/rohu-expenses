"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { BillTemplate } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface Props {
  templates: BillTemplate[];
}

const STORAGE_KEY = "rohu.upcoming_out_of_cycle.expanded";

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
  // Persist expanded state per-browser so the user doesn't have to re-collapse
  // on every dashboard load if they already saw the list.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setExpanded(saved === "1");
  }, []);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  }

  const items = templates
    .filter((t) => t.is_active && !t.next_in_current_cycle && t.next_instance_date)
    .sort((a, b) => (a.next_instance_date ?? "").localeCompare(b.next_instance_date ?? ""));

  if (items.length === 0) return null;

  return (
    <div className="border border-amber-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <span className="text-sm font-semibold text-amber-900 truncate">
            {items.length} plantilla{items.length === 1 ? "" : "s"} próxima{items.length === 1 ? "" : "s"} al ciclo
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-amber-700 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-700 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="bg-white border-t border-amber-200 px-4 py-3">
          <p className="text-xs text-amber-800 mb-3">
            Plantillas activas cuya próxima factura cae <strong>fuera</strong> de este ciclo (anuales, bimestrales, etc). Aparecerán en el dashboard cuando llegue su mes.
          </p>
          <div className="space-y-1.5">
            {items.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 py-1.5 px-2 bg-amber-50/40 rounded-lg text-sm"
              >
                <p className="font-medium truncate flex-1">{t.name}</p>
                <span className="text-xs text-amber-800 flex-shrink-0">
                  {formatShortDate(t.next_instance_date)} · {formatCurrency(t.estimated_amount)}
                </span>
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
      )}
    </div>
  );
}
