"use client";

import { useState } from "react";
import { X, Upload, Camera } from "lucide-react";
import { BillInstance, recordPayment } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface PaymentModalProps {
  bill: BillInstance;
  onClose: () => void;
  onSuccess: (paymentId: string) => void;
}

export default function PaymentModal({ bill, onClose, onSuccess }: PaymentModalProps) {
  const today = new Date().toISOString().split("T")[0];
  const [amount, setAmount] = useState(String(bill.expected_amount));
  const [paymentDate, setPaymentDate] = useState(today);
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("amount", amount);
    formData.append("payment_date", paymentDate);
    formData.append("payment_method", method);
    if (reference) formData.append("reference", reference);
    files.forEach((f) => formData.append("files", f));

    try {
      const result = await recordPayment(bill.id, formData);
      onSuccess(result.id);
    } catch (err: any) {
      setError(err.message || "Error al registrar pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">Registrar pago</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="p-3 bg-rohu-primary/10 rounded-lg">
            <p className="font-semibold">{bill.name}</p>
            <p className="text-sm text-gray-600">
              Monto esperado: {formatCurrency(bill.expected_amount)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Monto pagado</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent focus:border-rohu-accent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Fecha de pago</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Método de pago</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent"
            >
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="cash">Efectivo</option>
              <option value="auto_debit">Débito automático</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Referencia (opcional)</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nro. de transacción"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Evidencia (opcional)</label>
            <div className="flex gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-500">Subir archivo</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </label>
              <label className="flex items-center justify-center px-3 py-3 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors md:hidden">
                <Camera className="w-5 h-5 text-gray-400" />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setFiles((prev) => [...prev, f]);
                  }}
                />
              </label>
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-gray-50 px-2 py-1 rounded">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-red-500 ml-2">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-rohu-secondary text-white font-semibold rounded-lg hover:bg-rohu-secondary-dark disabled:opacity-50 transition-colors"
          >
            {loading ? "Registrando..." : "Confirmar pago"}
          </button>
        </form>
      </div>
    </div>
  );
}
