"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, Search, ToggleLeft, ToggleRight, Shield, UserIcon, Trash2, Database, MessageCircle,
} from "lucide-react";
import { listUsers, adminCreateUser, adminUpdateUser, deleteUser, buildWhatsAppLink, UserFull } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Create user form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("user_role") !== "admin") {
      router.push("/dashboard");
      return;
    }
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await listUsers(search || undefined);
      setUsers(data);
    } catch (err: any) {
      if (err.message?.includes("403")) router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadData(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await adminCreateUser({
        email: newEmail, password: newPassword, full_name: newName,
        whatsapp: newWhatsapp.trim() || undefined,
      });
      setSuccess(`Usuario ${newEmail} creado exitosamente`);
      setShowForm(false);
      setNewEmail(""); setNewPassword(""); setNewName(""); setNewWhatsapp("");
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: UserFull) {
    await adminUpdateUser(user.id, { is_active: !user.is_active });
    await loadData();
  }

  async function toggleRole(user: UserFull) {
    const newRole = user.role === "admin" ? "user" : "admin";
    await adminUpdateUser(user.id, { role: newRole });
    await loadData();
  }

  const [deleteTarget, setDeleteTarget] = useState<UserFull | null>(null);
  const [modal, setModal] = useState<{ title: string; message: string; type: "danger" | "success" | "info" } | null>(null);

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
      setModal({ title: "Usuario eliminado", message: `${deleteTarget.full_name} ha sido eliminado.`, type: "success" });
    } catch (err: any) {
      setDeleteTarget(null);
      setModal({ title: "Error", message: err.message, type: "danger" });
    }
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestión de usuarios</h1>
          <p className="text-sm text-rohu-muted">{users.length} usuarios registrados</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(""); setSuccess(""); }}
          className="flex items-center gap-1 px-4 py-2.5 min-h-[44px] bg-rohu-primary text-white rounded-lg hover:bg-rohu-primary-dark"
        >
          <Plus className="w-4 h-4" /> Nuevo usuario
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-rohu-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o email..."
          className="w-full pl-10 pr-4 py-2.5 border border-rohu-border rounded-xl focus:ring-2 focus:ring-rohu-accent focus:border-rohu-accent bg-white"
        />
      </div>

      {success && (
        <div className="p-3 bg-rohu-secondary/10 text-rohu-secondary-dark rounded-lg text-sm font-medium">
          {success}
        </div>
      )}

      {/* Create user modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Crear usuario</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre completo *</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre del usuario" className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="usuario@email.com" className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contraseña *</label>
                <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres" className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-rohu-accent" required minLength={6} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  WhatsApp <span className="text-rohu-muted text-xs font-normal">(opcional)</span>
                </label>
                <input type="tel" value={newWhatsapp} onChange={(e) => setNewWhatsapp(e.target.value)}
                  placeholder="+57 300 123 4567" inputMode="tel"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-rohu-accent" />
              </div>

              <div className="p-3 bg-rohu-accent/5 rounded-lg text-sm text-rohu-muted">
                El usuario recibirá estas credenciales para acceder. Puedes desactivarlo en cualquier momento.
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <button type="submit" disabled={saving}
                className="w-full py-2.5 bg-rohu-primary text-white font-semibold rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50">
                {saving ? "Creando..." : "Crear usuario"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-all ${!u.is_active ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{u.full_name}</p>
                  {u.role === "admin" && (
                    <span className="px-2 py-0.5 bg-rohu-primary/10 text-rohu-primary text-xs font-medium rounded-full flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  )}
                  {!u.is_active && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">Inactivo</span>
                  )}
                </div>
                <p className="text-sm text-rohu-muted truncate">{u.email}</p>
                {u.whatsapp && (() => {
                  const link = buildWhatsAppLink(u.whatsapp);
                  return link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-800 hover:underline mt-0.5">
                      <MessageCircle className="w-3 h-3" /> {u.whatsapp}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-rohu-muted mt-0.5">
                      <MessageCircle className="w-3 h-3" /> {u.whatsapp}
                    </span>
                  );
                })()}
                <div className="flex items-center gap-3 text-xs text-rohu-muted mt-1">
                  <span>{u.bill_count} plantillas</span>
                  <span>Creado: {new Date(u.created_at).toLocaleDateString("es-CO")}</span>
                  {u.last_login && <span>Último acceso: {new Date(u.last_login).toLocaleDateString("es-CO")}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Toggle role */}
                <button
                  onClick={() => toggleRole(u)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg"
                  title={u.role === "admin" ? "Quitar admin" : "Hacer admin"}
                >
                  {u.role === "admin"
                    ? <Shield className="w-5 h-5 text-rohu-primary" />
                    : <UserIcon className="w-5 h-5 text-rohu-muted" />}
                </button>
                {/* Toggle active */}
                <button
                  onClick={() => toggleActive(u)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg"
                  title={u.is_active ? "Desactivar" : "Activar"}
                >
                  {u.is_active
                    ? <ToggleRight className="w-7 h-7 text-rohu-secondary" />
                    : <ToggleLeft className="w-7 h-7 text-rohu-muted" />}
                </button>
                {/* Delete user */}
                <button
                  onClick={() => setDeleteTarget(u)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-red-50 rounded-lg"
                  title="Eliminar usuario"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Eliminar usuario"
        message={deleteTarget ? `¿Eliminar definitivamente a "${deleteTarget.full_name}" (${deleteTarget.email})?\n\nSe borrarán todas sus plantillas, facturas, pagos y evidencias.\nEsta acción NO se puede deshacer.` : ""}
        type="danger"
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteUser}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Result modal */}
      <ConfirmModal
        open={!!modal}
        title={modal?.title || ""}
        message={modal?.message || ""}
        type={modal?.type || "info"}
        confirmLabel="Aceptar"
        onClose={() => setModal(null)}
      />
    </div>
  );
}
