"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw, FileText, Search } from "lucide-react";
import {
  getDashboardFull, getDashboardByCycle, generateBillInstances,
  getPayCycle, PayCycleResponse, INCOME_CHANGED_EVENT,
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
  const pathname = usePathname();
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
  const [userName, setUserName] = useState("");

  // Pay cycle state
  const [cycle, setCycle] = useState<PayCycleResponse | null>(null);
  const [cycleRef, setCycleRef] = useState(new Date().toISOString().slice(0, 10));
  const isCycleMode = !!cycle?.configured;

  useEffect(() => {
    setUserName(localStorage.getItem("user_name") || "");
    getPayCycle().then((c) => setCycle(c)).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    // Wait until we know whether the user has a pay cycle configured. Without
    // this guard the first render would fetch in calendar mode (cycle is still
    // null), and a slower response could overwrite the correct cycle-mode bills
    // that the second fetch produces.
    if (cycle === null) return;
    setLoading(true);
    setSyncMsg("");
    try {
      if (isCycleMode) {
        // Cycle mode: load by date range
        const data = await getDashboardByCycle(cycleRef);
        setSummary(data.summary);
        setCashflow(data.cashflow);
        setBills(data.bills);
      } else {
        // Calendar mode: generate + load by month
        const gen = await generateBillInstances(year, month).catch(() => null);
        if (gen && (gen.created > 0 || gen.synced > 0)) {
          const parts = [];
          if (gen.created > 0) parts.push(`${gen.created} creada${gen.created > 1 ? "s" : ""}`);
          if (gen.synced > 0) parts.push(`${gen.synced} sincronizada${gen.synced > 1 ? "s" : ""}`);
          setSyncMsg(parts.join(", "));
          setTimeout(() => setSyncMsg(""), 4000);
        }
        const data = await getDashboardFull(year, month);
        setSummary(data.summary);
        setCashflow(data.cashflow);
        setBills(data.bills);
      }
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("Invalid")) {
        localStorage.removeItem("access_token");
        router.push("/");
      }
    } finally {
      setLoading(false);
    }
  }, [year, month, router, cycle, isCycleMode, cycleRef]);

  useEffect(() => { loadData(); }, [loadData]);

  // Refetch when tab regains focus, another page mutated income entries, or
  // when the user navigates back into /dashboard (Next.js App Router may keep
  // this client component mounted across route changes — the visibility event
  // alone doesn't fire on pure in-app navigation, so we also watch pathname).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") loadData();
    }
    function onIncomeChanged() { loadData(); }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(INCOME_CHANGED_EVENT, onIncomeChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(INCOME_CHANGED_EVENT, onIncomeChanged);
    };
  }, [loadData]);

  useEffect(() => {
    if (pathname === "/dashboard") loadData();
  }, [pathname, loadData]);

  function changeMonth(delta: number) {
    if (isCycleMode) {
      // Navigate cycles
      getPayCycle(cycleRef, delta).then((c) => {
        if (c.start_date) {
          setCycleRef(c.start_date);
          setCycle(c);
        }
      });
      setBillSearch("");
      setBillStatusFilter("all");
      return;
    }
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
          <h1 className="text-2xl font-bold">{userName ? `Hola, ${userName.split(" ")[0]}` : "Dashboard"}</h1>
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

      {/* Period selector */}
      <div className="flex items-center justify-between bg-white rounded-xl border px-4 py-3">
        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">
          {isCycleMode && cycle?.label ? cycle.label : `${getMonthName(month)} ${year}`}
        </h2>
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
          <h3 className="font-bold text-lg">{isCycleMode ? "Facturas del ciclo" : "Facturas del mes"}</h3>
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

        {/* Discrete link to calendar view */}
        {isCycleMode && (
          <div className="text-center pt-4">
            <Link href="/dashboard/payments" className="text-sm text-rohu-muted hover:text-rohu-primary hover:underline">
              Ver facturas por mes calendario →
            </Link>
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
