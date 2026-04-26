"use client";

import { useEffect, useState } from "react";
import { Plus, X, Edit2, Trash2, ToggleLeft, ToggleRight, Bell, BellOff, ChevronDown, ChevronUp } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import {
  getBillTemplates, createBillTemplate, updateBillTemplate, deleteBillTemplate, getCategories,
  getNotificationRule, updateNotificationRule,
  BillTemplate, BillTemplateCreate, Category, NotifRule,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

const RECURRENCE_LABELS: Record<string, string> = {
  monthly: "Mensual", bimonthly: "Bimestral", quarterly: "Trimestral",
  semiannual: "Semestral", annual: "Anual",
};

const REMINDER_DAYS = [
  { value: 7, label: "7 días antes" },
  { value: 3, label: "3 días antes" },
  { value: 1, label: "1 día antes" },
  { value: 0, label: "El día de" },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<BillTemplate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNotifConfig, setShowNotifConfig] = useState<string | null>(null);
  const [notifRule, setNotifRule] = useState<NotifRule | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [provider, setProvider] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("15");
  const [recurrence, setRecurrence] = useState("monthly");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Notification form state
  const [nfActive, setNfActive] = useState(true);
  const [nfDays, setNfDays] = useState<number[]>([7, 3, 1, 0]);
  const [nfOverdueDaily, setNfOverdueDaily] = useState(true);
  const [nfEmail, setNfEmail] = useState(true);
  const [nfTelegram, setNfTelegram] = useState(true);
  const [nfExtraEmails, setNfExtraEmails] = useState("");
  const [nfSaving, setNfSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    const [t, c] = await Promise.all([getBillTemplates(), getCategories()]);
    setTemplates(t);
    setCategories(c);
    if (c.length > 0 && !categoryId) setCategoryId(c[0].id);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  function resetForm() {
    setName(""); setProvider(""); setAmount(""); setDueDay("15");
    setRecurrence("monthly"); setNotes(""); setEditingId(null); setError("");
    if (categories.length > 0) setCategoryId(categories[0].id);
  }

  function startEdit(t: BillTemplate) {
    setEditingId(t.id); setName(t.name); setCategoryId(t.category.id);
    setProvider(t.provider || ""); setAmount(String(t.estimated_amount));
    setDueDay(String(t.due_day_of_month)); setRecurrence(t.recurrence_type);
    setNotes(t.notes || ""); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const data: BillTemplateCreate = {
      category_id: categoryId, name, provider: provider || undefined,
      estimated_amount: parseFloat(amount), due_day_of_month: parseInt(dueDay),
      recurrence_type: recurrence, notes: notes || undefined,
    };
    try {
      if (editingId) await updateBillTemplate(editingId, data);
      else await createBillTemplate(data);
      setShowForm(false); resetForm(); await loadData();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function toggleActive(t: BillTemplate) {
    await updateBillTemplate(t.id, { is_active: !t.is_active });
    await loadData();
  }

  const [deleteTarget, setDeleteTarget] = useState<BillTemplate | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteBillTemplate(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  }

  async function openNotifConfig(templateId: string) {
    if (showNotifConfig === templateId) { setShowNotifConfig(null); return; }
    setNotifLoading(true); setShowNotifConfig(templateId);
    try {
      const rule = await getNotificationRule(templateId);
      setNotifRule(rule);
      setNfActive(rule.is_active);
      setNfDays(rule.remind_days_before.split(",").map(Number).filter(n => !isNaN(n)));
      setNfOverdueDaily(rule.remind_overdue_daily);
      setNfEmail(rule.channels.includes("email"));
      setNfTelegram(rule.channels.includes("telegram"));
      setNfExtraEmails(rule.extra_emails || "");
    } catch { /* rule will be auto-created */ }
    finally { setNotifLoading(false); }
  }

  async function saveNotifRule(templateId: string) {
    setNfSaving(true);
    const channels = [nfEmail && "email", nfTelegram && "telegram"].filter(Boolean).join(",");
    await updateNotificationRule(templateId, {
      is_active: nfActive,
      remind_days_before: nfDays.sort((a, b) => b - a).join(","),
      remind_overdue_daily: nfOverdueDaily,
      channels: channels || "email",
      extra_emails: nfExtraEmails || undefined,
    });
    setNfSaving(false); setShowNotifConfig(null);
    // Reload to refresh notification status
    await loadData();
  }

  function toggleDay(day: number) {
    setNfDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
    </div>
  );

  const inputClass = "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rohu-accent";

  return (
    <div className="max-w-4xl mx-auto px-3 md:px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Plantillas de facturas</h1>
          <p className="text-sm text-rohu-muted">Facturas recurrentes que se generan cada mes</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1 px-4 py-2.5 min-h-[44px] bg-rohu-primary text-white rounded-lg hover:bg-rohu-primary-dark">
          <Plus className="w-4 h-4" /> Nueva
        </button>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingId ? "Editar plantilla" : "Nueva plantilla"}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-rohu-muted mb-1">Nombre *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Electricidad" className={inputClass} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-rohu-muted mb-1">Categoría *</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-rohu-muted mb-1">Proveedor</label>
                <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)}
                  placeholder="Ej: Enel-Codensa" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-rohu-muted mb-1">Monto estimado *</label>
                  <input type="number" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150000" className={inputClass} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-rohu-muted mb-1">Día vencimiento *</label>
                  <input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} className={inputClass} required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-rohu-muted mb-1">Frecuencia</label>
                <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={inputClass}>
                  {Object.entries(RECURRENCE_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button type="submit" disabled={saving}
                className="w-full py-2.5 bg-rohu-primary text-white font-semibold rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50">
                {saving ? "Guardando..." : editingId ? "Guardar" : "Crear plantilla"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Templates list */}
      {templates.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <p className="text-rohu-muted mb-4">Crea tus servicios recurrentes (luz, agua, gas, internet...)</p>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 bg-rohu-primary text-white rounded-lg hover:bg-rohu-primary-dark">
            Crear primera plantilla
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className={`bg-white rounded-xl border transition-all ${!t.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{t.name}</p>
                    {t.provider && <span className="text-xs text-rohu-muted">({t.provider})</span>}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-rohu-muted mt-0.5">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100" style={{ color: t.category.color || undefined }}>
                      {t.category.name}
                    </span>
                    <span>Día {t.due_day_of_month}</span>
                    <span>{RECURRENCE_LABELS[t.recurrence_type]}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-bold">{formatCurrency(t.estimated_amount)}</span>
                  <button onClick={() => openNotifConfig(t.id)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg"
                    title="Configurar notificaciones">
                    {showNotifConfig === t.id ? <ChevronUp className="w-4 h-4 text-rohu-accent" /> : <Bell className="w-4 h-4 text-rohu-accent" />}
                  </button>
                  <button onClick={() => startEdit(t)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg" title="Editar">
                    <Edit2 className="w-4 h-4 text-rohu-muted" />
                  </button>
                  <button onClick={() => toggleActive(t)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg"
                    title={t.is_active ? "Desactivar" : "Activar"}>
                    {t.is_active ? <ToggleRight className="w-6 h-6 text-rohu-secondary" /> : <ToggleLeft className="w-6 h-6 text-rohu-muted" />}
                  </button>
                  <button onClick={() => setDeleteTarget(t)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-red-50 rounded-lg" title="Eliminar">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>

              {/* Notification config panel */}
              {showNotifConfig === t.id && (
                <div className="border-t p-4 bg-rohu-accent/5">
                  {notifLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin w-5 h-5 border-2 border-rohu-accent border-t-transparent rounded-full" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">Notificaciones activas</span>
                        <button onClick={() => setNfActive(!nfActive)} className="min-h-[44px] min-w-[44px] flex items-center justify-center">
                          {nfActive ? <ToggleRight className="w-7 h-7 text-rohu-secondary" /> : <ToggleLeft className="w-7 h-7 text-rohu-muted" />}
                        </button>
                      </div>

                      {nfActive && (
                        <>
                          {/* Reminder days */}
                          <div>
                            <label className="block text-xs font-medium text-rohu-muted mb-2">Recordar con anticipación</label>
                            <div className="flex flex-wrap gap-2">
                              {REMINDER_DAYS.map((d) => (
                                <button key={d.value} onClick={() => toggleDay(d.value)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium min-h-[36px] transition-colors ${
                                    nfDays.includes(d.value)
                                      ? "bg-rohu-accent text-white"
                                      : "bg-gray-100 text-rohu-muted"
                                  }`}>
                                  {d.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Overdue daily */}
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={nfOverdueDaily} onChange={(e) => setNfOverdueDaily(e.target.checked)} className="rounded" />
                            Notificar diariamente si está vencida
                          </label>

                          {/* Channels */}
                          <div>
                            <label className="block text-xs font-medium text-rohu-muted mb-2">Canales</label>
                            <div className="flex gap-4">
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={nfEmail} onChange={(e) => setNfEmail(e.target.checked)} className="rounded" />
                                Email
                              </label>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={nfTelegram} onChange={(e) => setNfTelegram(e.target.checked)} className="rounded" />
                                Telegram
                              </label>
                            </div>
                          </div>

                          {/* Extra emails */}
                          <div>
                            <label className="block text-xs font-medium text-rohu-muted mb-1">Emails adicionales (familia)</label>
                            <input value={nfExtraEmails} onChange={(e) => setNfExtraEmails(e.target.value)}
                              placeholder="esposa@email.com, hijo@email.com"
                              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-rohu-accent" />
                            <p className="text-xs text-rohu-muted mt-1">Separar con comas. Recibirán las mismas alertas.</p>
                          </div>
                        </>
                      )}

                      <button onClick={() => saveNotifRule(t.id)} disabled={nfSaving}
                        className="w-full py-2 bg-rohu-accent text-white font-medium rounded-lg hover:bg-rohu-accent/90 disabled:opacity-50 text-sm">
                        {nfSaving ? "Guardando..." : "Guardar configuración"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmModal
        open={!!deleteTarget}
        title="Eliminar plantilla"
        message={deleteTarget ? `¿Eliminar "${deleteTarget.name}" definitivamente?\n\nSe borrarán todas las facturas, pagos y evidencias asociadas.` : ""}
        type="danger"
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
