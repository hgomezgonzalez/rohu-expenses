"use client";

import { useEffect, useState } from "react";
import { UserCircle, Save, Eye, EyeOff, CheckCircle, XCircle, Send, Info, ToggleLeft, ToggleRight } from "lucide-react";
import { getMe, updateProfile, changePassword, getNotificationConfig, updateNotificationConfig, testNotification, NotificationConfig } from "@/lib/api";

export default function ProfilePage() {
  const [user, setUser] = useState<{ email: string; full_name: string; timezone: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileResult, setProfileResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Pay cycle
  const [payCycleDay, setPayCycleDay] = useState<string>("");
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleResult, setCycleResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Telegram form
  const [notifConfig, setNotifConfig] = useState<NotificationConfig | null>(null);
  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [tgEnabled, setTgEnabled] = useState(false);
  const [showTgToken, setShowTgToken] = useState(false);
  const [tgSaving, setTgSaving] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgResult, setTgResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Password form
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdResult, setPwdResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    Promise.all([getMe(), getNotificationConfig().catch(() => null)])
      .then(([u, c]) => {
        setUser(u);
        setFullName(u.full_name);
        setEmail(u.email);
        setTimezone(u.timezone);
        if (c) {
          setNotifConfig(c);
          setTgChatId(c.telegram_chat_id);
          setTgEnabled(c.telegram_enabled);
          setPayCycleDay(c.pay_cycle_start_day ? String(c.pay_cycle_start_day) : "");
        }
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

      {/* Pay cycle config */}
      <div className="bg-white rounded-xl border p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <svg className="w-5 h-5 text-rohu-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <h2 className="font-bold text-lg">Ciclo de pago</h2>
        </div>

        <p className="text-sm text-rohu-muted mb-4">
          Configura el dia en que recibes tu ingreso principal. El dashboard mostrara tus facturas agrupadas por ciclo de pago en vez de mes calendario.
        </p>

        <div className="flex items-center gap-3">
          <select value={payCycleDay} onChange={(e) => setPayCycleDay(e.target.value)} className={inputClass + " max-w-[200px]"}>
            <option value="">No configurar (mes)</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>Dia {i + 1}</option>
            ))}
          </select>
          <button onClick={async () => {
            setCycleSaving(true); setCycleResult(null);
            try {
              const val = payCycleDay ? parseInt(payCycleDay) : null;
              await updateNotificationConfig({ pay_cycle_start_day: val } as any);
              setCycleResult({ ok: true, msg: val ? `Ciclo configurado: dia ${val}` : "Ciclo desactivado" });
            } catch (err: any) { setCycleResult({ ok: false, msg: err.message }); }
            setCycleSaving(false);
          }} disabled={cycleSaving}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-rohu-primary text-white text-sm font-medium rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50">
            <Save className="w-4 h-4" />{cycleSaving ? "Guardando..." : "Guardar"}
          </button>
        </div>

        {cycleResult && (
          <div className={`flex items-center gap-2 p-2 rounded-lg text-sm mt-3 ${cycleResult.ok ? "bg-rohu-secondary/10 text-rohu-secondary-dark" : "bg-red-50 text-red-700"}`}>
            {cycleResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {cycleResult.msg}
          </div>
        )}
      </div>

      {/* Telegram notifications */}
      <div className="bg-white rounded-xl border p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-rohu-accent" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.75 3.98-1.73 6.64-2.87 7.97-3.43 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .38z"/>
            </svg>
            <h2 className="font-bold text-lg">Mis notificaciones — Telegram</h2>
          </div>
          <button onClick={() => setTgEnabled(!tgEnabled)} className="min-h-[44px] min-w-[44px] flex items-center justify-center">
            {tgEnabled ? <ToggleRight className="w-8 h-8 text-rohu-secondary" /> : <ToggleLeft className="w-8 h-8 text-rohu-muted" />}
          </button>
        </div>

        <div className="p-3 bg-rohu-accent/5 border border-rohu-accent/20 rounded-lg mb-4 text-sm text-rohu-muted">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 text-rohu-accent flex-shrink-0" />
            <div>
              <p className="font-medium text-rohu-text mb-1">Configura en 3 pasos:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Abre Telegram → busca <strong>@BotFather</strong> → envia <code className="bg-gray-100 px-1 rounded">/newbot</code> → copia el <strong>token</strong></li>
                <li>Busca <strong>@userinfobot</strong> → te responde con tu <strong>Chat ID</strong></li>
                <li>Envia cualquier mensaje a tu bot (para activar la conversacion)</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">
              Bot Token {notifConfig?.telegram_bot_token_set && <span className="text-rohu-secondary">(ya configurado)</span>}
            </label>
            <div className="relative">
              <input type={showTgToken ? "text" : "password"} value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder={notifConfig?.telegram_bot_token_set ? "Dejar vacio para mantener" : "123456:ABCdef..."}
                className={inputClass + " pr-10"} />
              <button type="button" onClick={() => setShowTgToken(!showTgToken)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                {showTgToken ? <EyeOff className="w-4 h-4 text-rohu-muted" /> : <Eye className="w-4 h-4 text-rohu-muted" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Chat ID</label>
            <input type="text" value={tgChatId} onChange={(e) => setTgChatId(e.target.value)}
              placeholder="123456789" className={inputClass} />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={async () => {
              setTgSaving(true); setTgResult(null);
              try {
                const shouldEnable = tgEnabled || (!!tgChatId && (!!tgToken || !!notifConfig?.telegram_bot_token_set));
                const data: Record<string, any> = { telegram_chat_id: tgChatId, telegram_enabled: shouldEnable };
                if (tgToken) data.telegram_bot_token = tgToken;
                const updated = await updateNotificationConfig(data);
                setNotifConfig(updated); setTgEnabled(updated.telegram_enabled); setTgToken("");
                setTgResult({ ok: true, msg: "Telegram guardado" });
              } catch (err: any) { setTgResult({ ok: false, msg: err.message }); }
              setTgSaving(false);
            }} disabled={tgSaving}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-rohu-primary text-white text-sm font-medium rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50">
              <Save className="w-4 h-4" />{tgSaving ? "Guardando..." : "Guardar"}
            </button>
            <button onClick={async () => {
              setTgTesting(true); setTgResult(null);
              try {
                const res = await testNotification("telegram");
                setTgResult({ ok: true, msg: res.message });
              } catch (err: any) { setTgResult({ ok: false, msg: err.message }); }
              setTgTesting(false);
            }} disabled={tgTesting || !notifConfig?.telegram_bot_token_set}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] border border-rohu-accent text-rohu-accent text-sm font-medium rounded-lg hover:bg-rohu-accent/5 disabled:opacity-50">
              <Send className="w-4 h-4" />{tgTesting ? "Enviando..." : "Probar"}
            </button>
          </div>

          {tgResult && (
            <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${tgResult.ok ? "bg-rohu-secondary/10 text-rohu-secondary-dark" : "bg-red-50 text-red-700"}`}>
              {tgResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {tgResult.msg}
            </div>
          )}
        </div>
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
