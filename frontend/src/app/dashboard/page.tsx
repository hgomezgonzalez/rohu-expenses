"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw, FileText, Search } from "lucide-react";
import {
  getDashboardFull, generateBillInstances,
  DashboardSummary, CashflowForecast, BillInstance,
} from "@/lib/api";
import { getMonthName } from "@/lib/utils";
import SummaryCards from "@/components/SummaryCards";
import BillCard from "@/components/BillCard";
import CashflowCard from "@/components/CashflowCard";
import PaymentModal from "@/components/PaymentModal";
import UndoToast from "@/components/UndoToast";
import { formatCurrency } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [cashflow, setCashflow] = useState<CashflowForecast | null>(null);
  const [bills, setBills] = useState<BillInstance[]>([]);
  const [undoInfo, setUndoInfo] = useState<{ paymentId: string; billName: string; amount: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingBill, setPayingBill] = useState<BillInstance | null>(null);
  const [billSearch, setBillSearch] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState("all");
  const [syncMsg, setSyncMsg] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setSyncMsg("");
    try {
      // Always generate + sync first (idempotent — won't create duplicates)
      const gen = await generateBillInstances(year, month).catch(() => null);
      if (gen && (gen.created > 0 || gen.synced > 0)) {
        const parts = [];
        if (gen.created > 0) parts.push(`${gen.created} creada${gen.created > 1 ? "s" : ""}`);
        if (gen.synced > 0) parts.push(`${gen.synced} sincronizada${gen.synced > 1 ? "s" : ""}`);
        setSyncMsg(parts.join(", "));
        setTimeout(() => setSyncMsg(""), 4000);
      }
      // Then load full dashboard (includes status update)
      const data = await getDashboardFull(year, month);
      setSummary(data.summary);
      setCashflow(data.cashflow);
      setBills(data.bills);
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("Invalid")) {
        localStorage.removeItem("access_token");
        router.push("/");
      }
    } finally {
      setLoading(false);
    }
  }, [year, month, router]);

  useEffect(() => { loadData(); }, [loadData]);

  function changeMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) { newMonth = 1; newYear++; }
    if (newMonth < 1) { newMonth = 12; newYear--; }
    setMonth(newMonth);
    setYear(newYear);
    setBillSearch("");
    setBillStatusFilter("all");
  }

  const statusOrder = { overdue: 0, due_soon: 1, pending: 2, paid: 3, cancelled: 4 };
  const sortedBills = [...bills]
    .sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9))
    .filter((bill) => {
      const q = billSearch.toLowerCase();
      const matchesSearch = !q || bill.name.toLowerCase().includes(q);
      const matchesStatus = billStatusFilter === "all" || bill.status === billStatusFilter;
      return matchesSearch && matchesStatus;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {syncMsg && (
            <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium animate-pulse">
              {syncMsg}
            </span>
          )}
        </div>
        <button onClick={loadData} className="p-2 hover:bg-gray-200 rounded-lg" title="Sincronizar facturas con plantillas">
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-between bg-white rounded-xl border px-4 py-3">
        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">{getMonthName(month)} {year}</h2>
        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary cards */}
      {summary && <SummaryCards summary={summary} />}

      {/* Cashflow - saldo restante prominente */}
      {cashflow && <CashflowCard cashflow={cashflow} />}

      {/* Bills list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">Facturas del mes</h3>
        </div>

        {/* Search & filter */}
        {bills.length > 0 && (
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar factura..."
                value={billSearch} onChange={(e) => setBillSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-rohu-accent" />
            </div>
            <select value={billStatusFilter} onChange={(e) => setBillStatusFilter(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-rohu-accent">
              <option value="all">Todos</option>
              <option value="overdue">Vencidas</option>
              <option value="due_soon">Proximas</option>
              <option value="pending">Pendientes</option>
              <option value="paid">Pagadas</option>
            </select>
          </div>
        )}

        {bills.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No hay facturas para este mes</p>
            <p className="text-sm text-gray-400">
              Crea plantillas en{" "}
              <Link href="/dashboard/templates" className="text-rohu-primary hover:underline">
                Plantillas
              </Link>{" "}
              y las facturas se generarán automáticamente.
            </p>
          </div>
        ) : sortedBills.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-xl border">
            <p className="text-gray-500">No se encontraron facturas con ese filtro</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedBills.map((bill) => (
              <BillCard key={bill.id} bill={bill} onMarkPaid={setPayingBill} />
            ))}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {payingBill && (
        <PaymentModal
          bill={payingBill}
          onClose={() => setPayingBill(null)}
          onSuccess={(paymentId: string) => {
            const bill = payingBill!;
            setUndoInfo({ paymentId, billName: bill.name, amount: formatCurrency(bill.expected_amount) });
            setPayingBill(null);
            loadData();
          }}
        />
      )}

      {/* Undo toast */}
      {undoInfo && (
        <UndoToast
          paymentId={undoInfo.paymentId}
          billName={undoInfo.billName}
          amount={undoInfo.amount}
          onUndo={() => { setUndoInfo(null); loadData(); }}
          onExpire={() => setUndoInfo(null)}
        />
      )}
    </div>
  );
}
