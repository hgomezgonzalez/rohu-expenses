"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, Paperclip, Eye, X, Download, RotateCcw } from "lucide-react";
import { listPayments, reversePayment, getAttachmentUrl, PaymentWithBill, PaymentAttachment } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";
import { formatCurrency, formatDate, getMonthName } from "@/lib/utils";

const METHOD_LABELS: Record<string, string> = {
  transfer: "Transferencia",
  card: "Tarjeta",
  cash: "Efectivo",
  auto_debit: "Débito auto.",
};

export default function PaymentsHistoryPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [search, setSearch] = useState("");
  const [payments, setPayments] = useState<PaymentWithBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingAttachment, setViewingAttachment] = useState<{ paymentId: string; att: PaymentAttachment } | null>(null);
  const [reverseTarget, setReverseTarget] = useState<PaymentWithBill | null>(null);
  const [reverseResult, setReverseResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function confirmReverse() {
    if (!reverseTarget) return;
    try {
      await reversePayment(reverseTarget.id);
      setReverseTarget(null);
      setReverseResult({ ok: true, msg: `Pago de ${reverseTarget.bill_name} reversado. La factura vuelve a estar pendiente.` });
      await loadData();
    } catch (err: any) {
      setReverseTarget(null);
      setReverseResult({ ok: false, msg: err.message });
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await listPayments(year, month, search || undefined);
    setPayments(data);
    setLoading(false);
  }, [year, month, search]);

  useEffect(() => { loadData(); }, [loadData]);

  function changeMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) { newMonth = 1; newYear++; }
    if (newMonth < 1) { newMonth = 12; newYear--; }
    setMonth(newMonth);
    setYear(newYear);
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historial de pagos</h1>
        <p className="text-sm text-gray-500">Busca y consulta tus pagos con evidencia</p>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-between bg-white rounded-xl border px-4 py-3">
        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold">{getMonthName(month)} {year}</h2>
        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre de servicio..."
          className="w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-rohu-accent focus:border-rohu-accent bg-white"
        />
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">{payments.length} pagos encontrados</span>
        <span className="font-semibold">Total: {formatCurrency(totalPaid)}</span>
      </div>

      {/* Payments list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <p className="text-gray-500">No hay pagos registrados para este período</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border p-4 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.bill_name}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{p.bill_category}</span>
                    <span>{formatDate(p.payment_date)}</span>
                    <span>{METHOD_LABELS[p.payment_method] || p.payment_method}</span>
                    {p.reference && <span className="text-xs text-gray-400">Ref: {p.reference}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-bold text-rohu-secondary">{formatCurrency(p.amount)}</span>

                  {p.attachments.length > 0 && (
                    <button
                      onClick={() => setViewingAttachment({ paymentId: p.id, att: p.attachments[0] })}
                      className="flex items-center gap-1 px-2 py-1 bg-rohu-primary/10 text-rohu-primary text-xs rounded-lg hover:bg-rohu-primary/15"
                      title="Ver evidencia"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>{p.attachments.length}</span>
                    </button>
                  )}
                  <button
                    onClick={() => setReverseTarget(p)}
                    className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-red-50 rounded-lg"
                    title="Reversar pago"
                  >
                    <RotateCcw className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attachment viewer modal */}
      {viewingAttachment && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold">Evidencia de pago</h2>
              <div className="flex items-center gap-2">
                <a
                  href={getAttachmentUrl(viewingAttachment.paymentId, viewingAttachment.att.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  title="Descargar"
                >
                  <Download className="w-5 h-5 text-gray-500" />
                </a>
                <button onClick={() => setViewingAttachment(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              {viewingAttachment.att.file_type.startsWith("image/") ? (
                <img
                  src={getAttachmentUrl(viewingAttachment.paymentId, viewingAttachment.att.id)}
                  alt={viewingAttachment.att.file_name}
                  className="w-full rounded-lg"
                />
              ) : viewingAttachment.att.file_type === "application/pdf" ? (
                <iframe
                  src={getAttachmentUrl(viewingAttachment.paymentId, viewingAttachment.att.id)}
                  className="w-full h-[60vh] rounded-lg"
                  title={viewingAttachment.att.file_name}
                />
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">{viewingAttachment.att.file_name}</p>
                  <a
                    href={getAttachmentUrl(viewingAttachment.paymentId, viewingAttachment.att.id)}
                    className="text-rohu-primary hover:underline"
                    download
                  >
                    Descargar archivo
                  </a>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">{viewingAttachment.att.file_name}</p>
            </div>
          </div>
        </div>
      )}

      {/* Reverse confirmation */}
      <ConfirmModal
        open={!!reverseTarget}
        title="Reversar pago"
        message={reverseTarget ? `¿Reversar el pago de "${reverseTarget.bill_name}" por ${formatCurrency(reverseTarget.amount)}?\n\nLa factura volverá a estado pendiente.` : ""}
        type="warning"
        confirmLabel="Reversar"
        onConfirm={confirmReverse}
        onClose={() => setReverseTarget(null)}
      />

      {/* Result modal */}
      <ConfirmModal
        open={!!reverseResult}
        title={reverseResult?.ok ? "Pago reversado" : "Error"}
        message={reverseResult?.msg || ""}
        type={reverseResult?.ok ? "success" : "danger"}
        onClose={() => setReverseResult(null)}
      />
    </div>
  );
}
