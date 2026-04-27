"use client";

import { getMonthName } from "@/lib/utils";

export interface HeatCell {
  year: number;
  month: number;
  pct: number; // 0..∞ (% of execution: actual / budget * 100)
}

export interface HeatRow {
  category_name: string;
  category_slug: string;
  cells: HeatCell[]; // one per month, length should match months prop
}

interface Props {
  rows: HeatRow[];
  months: { year: number; month: number }[];
}

function colorFor(pct: number | null): { bg: string; label: string } {
  if (pct === null || isNaN(pct)) return { bg: "bg-gray-100", label: "Sin datos" };
  if (pct === 0) return { bg: "bg-gray-100", label: "Sin gasto" };
  if (pct <= 100) return { bg: "bg-emerald-500", label: "Dentro presupuesto" };
  if (pct <= 120) return { bg: "bg-amber-400", label: "Sobre presupuesto leve" };
  return { bg: "bg-red-500", label: "Muy sobre presupuesto" };
}

export default function CategoryHeatMap({ rows, months }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-4 md:p-5 shadow-sm">
        <h3 className="font-semibold text-sm mb-2">Patrón por categoría</h3>
        <p className="text-xs text-rohu-muted">Sin historial suficiente</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4 md:p-5 shadow-sm overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Patrón por categoría · últimos {months.length} meses</h3>
        <Legend />
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left font-medium text-rohu-muted py-1 pr-2 sticky left-0 bg-white">
              Categoría
            </th>
            {months.map((m) => (
              <th key={`${m.year}-${m.month}`} className="px-1 py-1 font-medium text-rohu-muted">
                {getMonthName(m.month).slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.category_slug} className="border-t border-gray-100">
              <td className="py-1.5 pr-2 truncate max-w-[140px] text-rohu-text sticky left-0 bg-white">
                {row.category_name}
              </td>
              {row.cells.map((c, i) => {
                const meta = colorFor(c.pct);
                return (
                  <td key={i} className="px-1 py-1.5">
                    <div
                      className={`w-7 h-7 md:w-8 md:h-8 rounded ${meta.bg} mx-auto`}
                      title={`${row.category_name} · ${c.pct.toFixed(0)}% — ${meta.label}`}
                      aria-label={`${row.category_name} ${getMonthName(c.month)}: ${c.pct.toFixed(0)}%`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-xs text-rohu-muted">
      <span className="inline-flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-emerald-500" /> ≤100%
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-amber-400" /> 101-120%
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-red-500" /> &gt;120%
      </span>
    </div>
  );
}
