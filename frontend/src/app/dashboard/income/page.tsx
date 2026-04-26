"use client";

import { useEffect, useState } from "react";
import { Plus, X, Edit2, Trash2 } from "lucide-react";
import {
  getIncomeSources, createIncomeSource, updateIncomeSource, deleteIncomeSource,
  IncomeSource, IncomeSourceCreate,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import ConfirmModal from "@/components/ConfirmModal";

export default function IncomePage() {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    const data = await getIncomeSources();
    setSources(data);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  function resetForm() {
    setName(""); setAmount(""); setDayOfMonth("1"); setNotes("");
    setEditingId(null); setError("");
  }

  function startEdit(s: IncomeSource) {
    setEditingId(s.id);
    setName(s.name);
    setAmount(String(s.amount));
    setDayOfMonth(String(s.day_of_month));
    setNotes(s.notes || "");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const data: IncomeSourceCreate = {
      name,
      amount: parseFloat(amount),
      day_of_month: parseInt(dayOfMonth),
      notes: notes || undefined,
    };

    try {
      if (editingId) {
        await updateIncomeSource(editingId, data);
      } else {
        await createIncomeSource(data);
      }
      setShowForm(false);
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleteId) return;
    await deleteIncomeSource(deleteId);
    setDeleteId(null);
    await loadData();
  }

  const totalIncome = sources.filter((s) => s.is_active).reduce((sum, s) => sum + s.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fuentes de ingreso</h1>
          <p className="text-sm text-gray-500">
            Ingreso mensual total: <span className="font-semibold text-rohu-secondary">{formatCurrency(totalIncome)}</span>
          </p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1 px-4 py-2 bg-rohu-secondary text-white rounded-lg hover:bg-rohu-secondary-dark">
          <Plus className="w-4 h-4" /> Agregar ingreso
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingId ? "Editar ingreso" : "Agregar ingreso"}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Salario, Freelance" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Monto mensual *</label>
                  <input type="number" step="100" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="5000000" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Día de ingreso *</label>
                  <input type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notas</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opcional" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent" />
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <button type="submit" disabled={saving}
                className="w-full py-2.5 bg-rohu-secondary text-white font-semibold rounded-lg hover:bg-rohu-secondary-dark disabled:opacity-50">
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Agregar"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      {sources.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <p className="text-gray-500 mb-2">No tienes fuentes de ingreso registradas</p>
          <p className="text-sm text-gray-400 mb-4">Agrega tus ingresos para calcular el flujo de caja</p>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 bg-rohu-secondary text-white rounded-lg hover:bg-rohu-secondary-dark">
            Agregar primer ingreso
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-4 bg-white rounded-xl border hover:shadow-sm">
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-gray-500">Día {s.day_of_month} de cada mes</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-rohu-secondary">{formatCurrency(s.amount)}</span>
                <button onClick={() => startEdit(s)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <Edit2 className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => setDeleteId(s.id)} className="p-2 hover:bg-red-50 rounded-lg">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmModal
        open={!!deleteId}
        title="Eliminar ingreso"
        message="¿Eliminar esta fuente de ingreso?"
        type="danger"
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}
