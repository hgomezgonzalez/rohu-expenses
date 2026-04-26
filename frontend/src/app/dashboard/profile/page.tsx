"use client";

import { useEffect, useState } from "react";
import { UserCircle, Save, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";
import { getMe, updateProfile, changePassword } from "@/lib/api";

export default function ProfilePage() {
  const [user, setUser] = useState<{ email: string; full_name: string; timezone: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileResult, setProfileResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Password form
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdResult, setPwdResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    getMe().then((u) => {
      setUser(u);
      setFullName(u.full_name);
      setEmail(u.email);
      setTimezone(u.timezone);
    }).finally(() => setLoading(false));
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileResult(null);
    try {
      await updateProfile({ full_name: fullName, email, timezone });
      setProfileResult({ ok: true, msg: "Perfil actualizado" });
    } catch (err: any) {
      setProfileResult({ ok: false, msg: err.message || "Error al guardar" });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setPwdResult({ ok: false, msg: "Las contraseñas no coinciden" });
      return;
    }
    if (newPwd.length < 6) {
      setPwdResult({ ok: false, msg: "Mínimo 6 caracteres" });
      return;
    }
    setPwdSaving(true);
    setPwdResult(null);
    try {
      await changePassword({ current_password: currentPwd, new_password: newPwd });
      setPwdResult({ ok: true, msg: "Contraseña actualizada" });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: any) {
      setPwdResult({ ok: false, msg: err.message || "Error" });
    } finally {
      setPwdSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-rohu-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const inputClass = "w-full px-3 py-2.5 border border-rohu-border rounded-lg focus:ring-2 focus:ring-rohu-accent focus:border-rohu-accent text-sm";

  return (
    <div className="max-w-2xl mx-auto px-3 md:px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <UserCircle className="w-7 h-7 text-rohu-primary" />
        <h1 className="text-2xl font-bold">Mi Perfil</h1>
      </div>

      {/* Edit profile */}
      <div className="bg-white rounded-xl border p-4 md:p-6">
        <h2 className="font-bold text-lg mb-4">Datos personales</h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Nombre completo</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              className={inputClass} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className={inputClass} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Zona horaria</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
              <option value="America/Bogota">America/Bogota (COL)</option>
              <option value="America/Mexico_City">America/Mexico_City (MX)</option>
              <option value="America/Lima">America/Lima (PE)</option>
              <option value="America/Santiago">America/Santiago (CL)</option>
              <option value="America/Buenos_Aires">America/Buenos_Aires (AR)</option>
              <option value="America/New_York">America/New_York (US East)</option>
              <option value="Europe/Madrid">Europe/Madrid (ES)</option>
            </select>
          </div>

          {profileResult && (
            <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${profileResult.ok ? "bg-rohu-secondary/10 text-rohu-secondary-dark" : "bg-red-50 text-red-700"}`}>
              {profileResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {profileResult.msg}
            </div>
          )}

          <button type="submit" disabled={profileSaving}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-rohu-primary text-white text-sm font-medium rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50">
            <Save className="w-4 h-4" />
            {profileSaving ? "Guardando..." : "Guardar perfil"}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-xl border p-4 md:p-6">
        <h2 className="font-bold text-lg mb-4">Cambiar contraseña</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Contraseña actual</label>
            <div className="relative">
              <input type={showCurrent ? "text" : "password"} value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)} className={inputClass + " pr-10"} required />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                {showCurrent ? <EyeOff className="w-4 h-4 text-rohu-muted" /> : <Eye className="w-4 h-4 text-rohu-muted" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Nueva contraseña</label>
            <div className="relative">
              <input type={showNew ? "text" : "password"} value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)} className={inputClass + " pr-10"} required minLength={6} />
              <button type="button" onClick={() => setShowNew(!showNew)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                {showNew ? <EyeOff className="w-4 h-4 text-rohu-muted" /> : <Eye className="w-4 h-4 text-rohu-muted" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Confirmar nueva contraseña</label>
            <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
              className={inputClass} required minLength={6} />
          </div>

          {pwdResult && (
            <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${pwdResult.ok ? "bg-rohu-secondary/10 text-rohu-secondary-dark" : "bg-red-50 text-red-700"}`}>
              {pwdResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {pwdResult.msg}
            </div>
          )}

          <button type="submit" disabled={pwdSaving}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-rohu-accent text-white text-sm font-medium rounded-lg hover:bg-rohu-accent/90 disabled:opacity-50">
            {pwdSaving ? "Cambiando..." : "Cambiar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
