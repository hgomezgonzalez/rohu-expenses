"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Plus, X, Edit2, Trash2, Check, Clock, ChevronLeft, ChevronRight, Ban, RefreshCw } from "lucide-react";
import {
  getIncomeSources, createIncomeSource, updateIncomeSource, deleteIncomeSource,
  getIncomeEntries, generateIncomeEntries, confirmIncomeEntry, createIncomeEntry,
  deleteIncomeEntry, updateIncomeEntry, getPayCycle, INCOME_CHANGED_EVENT,
  IncomeSource, IncomeSourceCreate, IncomeEntry, IncomeEntryConfirm, PayCycleResponse,
} from "@/lib/api";
import { formatCurrency, getMonthName } from "@/lib/utils";
import ConfirmModal from "@/components/ConfirmModal";

type Tab = "sources" | "entries";

export default function IncomePage() {
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>("entries");

  // Sources state
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [srcName, setSrcName] = useState("");
  const [srcAmount, setSrcAmount] = useState("");
  const [srcDay, setSrcDay] = useState("1");
  const [srcNotes, setSrcNotes] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [deleteSourceId, setDeleteSourceId] = useState<string | null>(null);

  // Entries state — month mode (when no cycle is configured) and cycle mode
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [cycle, setCycle] = useState<PayCycleResponse | null>(null);
  const [cycleRef, setCycleRef] = useState<string>(todayIso);
  const isCycleMode = !!cycle?.configured;
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Confirm modal state
  const [confirmingEntry, setConfirmingEntry] = useState<IncomeEntry | null>(null);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmDate, setConfirmDate] = useState("");
  const [confirmNotes, setConfirmNotes] = useState("");
  const [confirmingSaving, setConfirmingSaving] = useState(false);

  // One-time entry form
  const [showOneTimeForm, setShowOneTimeForm] = useState(false);
  const [otName, setOtName] = useState("");
  const [otAmount, setOtAmount] = useState("");
  const [otNotes, setOtNotes] = useState("");
  const [savingOneTime, setSavingOneTime] = useState(false);

  // Delete entry
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);

  // Load sources
  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const data = await getIncomeSources();
      setSources(data);
    } catch { /* ignore */ }
    setLoadingSources(false);
  }, []);

  // Load entries (cycle mode if pay cycle is configured, calendar month otherwise).
  // Wait until the cycle metadata has loaded so we don't race two fetches with
  // different modes — the slower response could overwrite the correct one.
  const loadEntries = useCallback(async () => {
    if (cycle === null) return;
    setLoadingEntries(true);
    try {
      const data = isCycleMode
        ? await getIncomeEntries(undefined, undefined, { mode: "cycle", refDate: cycleRef })
        : await getIncomeEntries(year, month);
      setEntries(data);
    } catch { /* ignore */ }
    setLoadingEntries(false);
  }, [year, month, cycle, isCycleMode, cycleRef]);

  useEffect(() => { loadSources(); }, [loadSources]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Load pay cycle config once on mount; updates trigger isCycleMode + reload
  useEffect(() => {
    getPayCycle(todayIso).then(setCycle).catch(() => {});
  }, [todayIso]);

  // Refetch when tab regains focus or another page mutated income entries.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        loadEntries();
      }
    }
    function onIncomeChanged() { loadEntries(); }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(INCOME_CHANGED_EVENT, onIncomeChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(INCOME_CHANGED_EVENT, onIncomeChanged);
    };
  }, [loadEntries]);

  // Also refetch on pure in-app navigation back to /dashboard/income.
  useEffect(() => {
    if (pathname === "/dashboard/income") loadEntries();
  }, [pathname, loadEntries]);

  // Month / cycle navigation
  function prevPeriod() {
    if (isCycleMode) {
      getPayCycle(cycleRef, -1).then((c) => {
        setCycle(c);
        if (c?.start_date) setCycleRef(c.start_date);
      });
    } else {
      if (month === 1) { setYear(year - 1); setMonth(12); }
      else setMonth(month - 1);
    }
  }
  function nextPeriod() {
    if (isCycleMode) {
      getPayCycle(cycleRef, 1).then((c) => {
        setCycle(c);
        if (c?.start_date) setCycleRef(c.start_date);
      });
    } else {
      if (month === 12) { setYear(year + 1); setMonth(1); }
      else setMonth(month + 1);
    }
  }

  // Generate entries
  async function handleGenerate() {
    setGenerating(true);
    try {
      if (isCycleMode) {
        await generateIncomeEntries(undefined, undefined, { mode: "cycle", refDate: cycleRef });
      } else {
        await generateIncomeEntries(year, month);
      }
      await loadEntries();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  // Source CRUD
  function resetSourceForm() {
    setSrcName(""); setSrcAmount(""); setSrcDay("1"); setSrcNotes("");
    setEditingSourceId(null); setSourceError("");
  }

  function startEditSource(s: IncomeSource) {
    setEditingSourceId(s.id);
    setSrcName(s.name);
    setSrcAmount(String(s.amount));
    setSrcDay(String(s.day_of_month));
    setSrcNotes(s.notes || "");
    setShowSourceForm(true);
  }

  async function handleSourceSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingSource(true);
    setSourceError("");
    const data: IncomeSourceCreate = {
      name: srcName,
      amount: parseFloat(srcAmount),
      day_of_month: parseInt(srcDay),
      notes: srcNotes || undefined,
    };
    try {
      if (editingSourceId) {
        await updateIncomeSource(editingSourceId, data);
      } else {
        await createIncomeSource(data);
      }
      setShowSourceForm(false);
      resetSourceForm();
      await loadSources();
    } catch (err: any) {
      setSourceError(err.message);
    } finally {
      setSavingSource(false);
    }
  }

  async function confirmDeleteSource() {
    if (!deleteSourceId) return;
    await deleteIncomeSource(deleteSourceId);
    setDeleteSourceId(null);
    await loadSources();
  }

  // Confirm income entry
  function startConfirm(entry: IncomeEntry) {
    setConfirmingEntry(entry);
    setConfirmAmount(String(entry.expected_amount));
    setConfirmDate(new Date().toISOString().slice(0, 10));
    setConfirmNotes(entry.notes || "");
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmingEntry) return;
    setConfirmingSaving(true);
    try {
      const data: IncomeEntryConfirm = {
        actual_amount: parseFloat(confirmAmount),
        received_at: confirmDate || undefined,
        notes: confirmNotes || undefined,
      };
      await confirmIncomeEntry(confirmingEntry.id, data);
      setConfirmingEntry(null);
      await loadEntries();
    } catch { /* ignore */ }
    setConfirmingSaving(false);
  }

  // One-time entry
  async function handleOneTimeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingOneTime(true);
    try {
      // In cycle mode, anchor the one-time entry to the cycle's end month so
      // its computed entry_date (day=1 of that month) falls inside the cycle.
      let targetYear = year;
      let targetMonth = month;
      if (isCycleMode && cycle?.end_date) {
        const [y, m] = cycle.end_date.split("-");
        targetYear = parseInt(y);
        targetMonth = parseInt(m);
      }
      await createIncomeEntry({
        name: otName,
        expected_amount: parseFloat(otAmount),
        year: targetYear,
        month: targetMonth,
        notes: otNotes || undefined,
      });
      setShowOneTimeForm(false);
      setOtName(""); setOtAmount(""); setOtNotes("");
      await loadEntries();
    } catch { /* ignore */ }
    setSavingOneTime(false);
  }

  // Cancel entry
  async function handleCancelEntry(id: string) {
    await updateIncomeEntry(id, { status: "cancelled" });
    await loadEntries();
  }

  // Delete entry
  async function confirmDeleteEntry() {
    if (!deleteEntryId) return;
    await deleteIncomeEntry(deleteEntryId);
    setDeleteEntryId(null);
    await loadEntries();
  }

  const totalSourceIncome = sources.filter((s) => s.is_active).reduce((sum, s) => sum + s.amount, 0);
  const totalEntryIncome = entries
    .filter((e) => e.status !== "cancelled")
    .reduce((sum, e) => sum + e.effective_amount, 0);
  const confirmedCount = entries.filter((e) => e.status === "confirmed").length;
  const expectedCount = entries.filter((e) => e.status === "expected").length;

  const loading = tab === "sources" ? loadingSources : loadingEntries;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setTab("entries")}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
            tab === "entries" ? "bg-white text-rohu-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Este mes
        </button>
        <button
          onClick={() => setTab("sources")}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
            tab === "sources" ? "bg-white text-rohu-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Fuentes (plantillas)
        </button>
      </div>

      {/* ==================== ENTRIES TAB ==================== */}
      {tab === "entries" && (
        <>
          {/* Period selector + actions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button onClick={prevPeriod} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Periodo anterior">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-center">
                {isCycleMode && cycle?.label ? cycle.label : `${getMonthName(month)} ${year}`}
              </h2>
              <button onClick={nextPeriod} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Periodo siguiente">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={handleGenerate} disabled={generating}
                className="flex items-center gap-1 px-3 py-2 text-sm border border-rohu-primary text-rohu-primary rounded-lg hover:bg-rohu-primary/5 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Generar</span>
              </button>
              <button onClick={() => { setOtName(""); setOtAmount(""); setOtNotes(""); setShowOneTimeForm(true); }}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-rohu-secondary text-white rounded-lg hover:bg-rohu-secondary-dark">
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Puntual</span>
              </button>
            </div>
          </div>

          {/* Summary badges */}
          {entries.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-lg text-sm">
                <span className="text-gray-500">Total:</span>
                <span className="font-bold text-rohu-secondary">{formatCurrency(totalEntryIncome)}</span>
              </div>
              {confirmedCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-green-700 font-medium">{confirmedCount} confirmado{confirmedCount > 1 ? "s" : ""}</span>
                </div>
              )}
              {expectedCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-blue-700 font-medium">{expectedCount} esperado{expectedCount > 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          )}

          {/* Entries list */}
          {entries.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border">
              <p className="text-gray-500 mb-2">No hay ingresos registrados para {getMonthName(month)}</p>
              <p className="text-sm text-gray-400 mb-4">Genera desde tus fuentes o agrega un ingreso puntual</p>
              <button onClick={handleGenerate} disabled={generating}
                className="px-4 py-2 bg-rohu-primary text-white rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50">
                {generating ? "Generando..." : "Generar desde fuentes"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div key={entry.id}
                  className={`p-4 rounded-xl border transition-all ${
                    entry.status === "confirmed"
                      ? "bg-green-50 border-green-200"
                      : entry.status === "cancelled"
                        ? "bg-gray-50 border-gray-200 opacity-60"
                        : "bg-white border-gray-200 hover:shadow-sm"
                  }`}
                >
                  {/* Row 1: icon + name + badge */}
                  <div className="flex items-start gap-3">
                    {entry.status === "confirmed" ? (
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                    ) : entry.status === "cancelled" ? (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <Ban className="w-4 h-4 text-gray-400" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-4 h-4 text-blue-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold flex items-center gap-2 flex-wrap">
                        {entry.name}
                        {entry.is_one_time && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">PUNTUAL</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {entry.status === "confirmed"
                          ? `Confirmado${entry.received_at ? ` el ${entry.received_at}` : ""}`
                          : entry.status === "cancelled"
                            ? "Cancelado"
                            : `Esperado: ${formatCurrency(entry.expected_amount)}`
                        }
                      </p>
                    </div>
                  </div>

                  {/* Row 2: amount + actions */}
                  <div className="flex items-center justify-between mt-2 pl-11">
                    <span className={`font-bold text-lg ${
                      entry.status === "confirmed" ? "text-green-600" : entry.status === "cancelled" ? "text-gray-400 line-through" : "text-rohu-secondary"
                    }`}>
                      {formatCurrency(entry.effective_amount)}
                    </span>

                    <div className="flex items-center gap-1">
                      {entry.status === "expected" && (
                        <>
                          <button onClick={() => startConfirm(entry)}
                            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium min-h-[36px]">
                            Confirmar
                          </button>
                          <button onClick={() => handleCancelEntry(entry.id)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center" title="Cancelar">
                            <Ban className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                        </>
                      )}
                      <button onClick={() => setDeleteEntryId(entry.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center" title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Confirm modal */}
          {confirmingEntry && (
            <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
              <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-md w-full p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Confirmar ingreso</h2>
                  <button onClick={() => setConfirmingEntry(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">{confirmingEntry.name}</p>
                <form onSubmit={handleConfirm} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Monto recibido *</label>
                    <input type="number" step="100" value={confirmAmount} onChange={(e) => setConfirmAmount(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Fecha de recibo</label>
                    <input type="date" value={confirmDate} onChange={(e) => setConfirmDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Notas</label>
                    <input type="text" value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)}
                      placeholder="Opcional" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" />
                  </div>
                  <button type="submit" disabled={confirmingSaving}
                    className="w-full py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                    {confirmingSaving ? "Confirmando..." : "Confirmar ingreso"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* One-time entry modal */}
          {showOneTimeForm && (
            <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
              <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-md w-full p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Ingreso puntual</h2>
                  <button onClick={() => setShowOneTimeForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">{getMonthName(month)} {year}</p>
                <form onSubmit={handleOneTimeSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Descripcion *</label>
                    <input type="text" value={otName} onChange={(e) => setOtName(e.target.value)}
                      placeholder="Ej: Bono, Devolucion DIAN" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Monto *</label>
                    <input type="number" step="100" value={otAmount} onChange={(e) => setOtAmount(e.target.value)}
                      placeholder="500000" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Notas</label>
                    <input type="text" value={otNotes} onChange={(e) => setOtNotes(e.target.value)}
                      placeholder="Opcional" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" />
                  </div>
                  <button type="submit" disabled={savingOneTime}
                    className="w-full py-2.5 bg-rohu-secondary text-white font-semibold rounded-lg hover:bg-rohu-secondary-dark disabled:opacity-50">
                    {savingOneTime ? "Guardando..." : "Agregar ingreso puntual"}
                  </button>
                </form>
              </div>
            </div>
          )}

          <ConfirmModal
            open={!!deleteEntryId}
            title="Eliminar ingreso"
            message="¿Eliminar este registro de ingreso del mes?"
            type="danger"
            confirmLabel="Eliminar"
            onConfirm={confirmDeleteEntry}
            onClose={() => setDeleteEntryId(null)}
          />
        </>
      )}

      {/* ==================== SOURCES TAB ==================== */}
      {tab === "sources" && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Fuentes de ingreso</h1>
              <p className="text-sm text-gray-500">
                Plantillas que generan ingresos cada mes. Total: <span className="font-semibold text-rohu-secondary">{formatCurrency(totalSourceIncome)}</span>
              </p>
            </div>
            <button onClick={() => { resetSourceForm(); setShowSourceForm(true); }}
              className="flex items-center gap-1 px-4 py-2 bg-rohu-secondary text-white rounded-lg hover:bg-rohu-secondary-dark">
              <Plus className="w-4 h-4" /> Agregar fuente
            </button>
          </div>

          {/* Source form modal */}
          {showSourceForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">{editingSourceId ? "Editar fuente" : "Agregar fuente"}</h2>
                  <button onClick={() => { setShowSourceForm(false); resetSourceForm(); }} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSourceSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nombre *</label>
                    <input type="text" value={srcName} onChange={(e) => setSrcName(e.target.value)}
                      placeholder="Ej: Salario, Freelance" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Monto base *</label>
                      <input type="number" step="100" value={srcAmount} onChange={(e) => setSrcAmount(e.target.value)}
                        placeholder="5000000" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Dia de ingreso *</label>
                      <input type="number" min="1" max="31" value={srcDay} onChange={(e) => setSrcDay(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Notas</label>
                    <input type="text" value={srcNotes} onChange={(e) => setSrcNotes(e.target.value)}
                      placeholder="Opcional" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" />
                  </div>
                  {sourceError && <p className="text-red-600 text-sm">{sourceError}</p>}
                  <button type="submit" disabled={savingSource}
                    className="w-full py-2.5 bg-rohu-secondary text-white font-semibold rounded-lg hover:bg-rohu-secondary-dark disabled:opacity-50">
                    {savingSource ? "Guardando..." : editingSourceId ? "Guardar cambios" : "Agregar"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Sources list */}
          {sources.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border">
              <p className="text-gray-500 mb-2">No tienes fuentes de ingreso</p>
              <p className="text-sm text-gray-400 mb-4">Agrega tus fuentes recurrentes (salario, arriendo, etc.)</p>
              <button onClick={() => { resetSourceForm(); setShowSourceForm(true); }}
                className="px-4 py-2 bg-rohu-secondary text-white rounded-lg hover:bg-rohu-secondary-dark">
                Agregar primera fuente
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4 bg-white rounded-xl border hover:shadow-sm">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-sm text-gray-500">Dia {s.day_of_month} de cada mes</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-rohu-secondary">{formatCurrency(s.amount)}</span>
                    <button onClick={() => startEditSource(s)} className="p-2 hover:bg-gray-100 rounded-lg">
                      <Edit2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => setDeleteSourceId(s.id)} className="p-2 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ConfirmModal
            open={!!deleteSourceId}
            title="Eliminar fuente"
            message="¿Eliminar esta fuente de ingreso? Los registros mensuales existentes se conservan."
            type="danger"
            confirmLabel="Eliminar"
            onConfirm={confirmDeleteSource}
            onClose={() => setDeleteSourceId(null)}
          />
        </>
      )}
    </div>
  );
}
