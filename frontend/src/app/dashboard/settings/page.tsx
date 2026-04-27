"use client";

import { useEffect, useState } from "react";
import {
  User, Bell, Send, Mail, CheckCircle, XCircle, Eye, EyeOff,
  Save, Info, ToggleLeft, ToggleRight, Trash2,
} from "lucide-react";
import {
  getMe, getNotificationConfig, updateNotificationConfig, testNotification,
  updateProfile, changePassword, purgeMonth, NotificationConfig,
} from "@/lib/api";
import { getMonthName } from "@/lib/utils";
import VersionBadge from "@/components/VersionBadge";
import ConfirmModal from "@/components/ConfirmModal";

export default function SettingsPage() {
  const [user, setUser] = useState<{ email: string; full_name: string; timezone: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(true);
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // SMTP form
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpTls, setSmtpTls] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Telegram form
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // UI state
  const [saving, setSaving] = useState("");
  const [testing, setTesting] = useState("");
  const [testResult, setTestResult] = useState<{ channel: string; ok: boolean; msg: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ section: string; ok: boolean } | null>(null);

  useEffect(() => {
    Promise.all([getMe(), getNotificationConfig().catch(() => null)])
      .then(([u, c]) => {
        setUser(u);
        if (c) {
          setConfig(c);
          setSmtpHost(c.smtp_host);
          setSmtpPort(String(c.smtp_port));
          setSmtpUser(c.smtp_user);
          setSmtpFromEmail(c.smtp_from_email);
          setSmtpTls(c.smtp_tls);
          setEmailEnabled(c.email_enabled);
          setTelegramChatId(c.telegram_chat_id);
          setTelegramEnabled(c.telegram_enabled);
        }
      })
      .finally(() => setLoading(false));

    // Check admin access
    if (localStorage.getItem("user_role") !== "admin") {
      setIsAdmin(false);
      window.location.href = "/dashboard/profile";
    }
  }, []);

  async function saveSmtp() {
    setSaving("smtp");
    setSaveResult(null);
    try {
      // Auto-enable email if credentials are set
      const shouldEnable = emailEnabled || (!!smtpHost && !!smtpUser && (!!smtpPassword || !!config?.smtp_password_set));
      const data: Record<string, any> = {
        smtp_host: smtpHost,
        smtp_port: parseInt(smtpPort),
        smtp_user: smtpUser,
        smtp_from_email: smtpFromEmail || smtpUser,
        smtp_tls: smtpTls,
        email_enabled: shouldEnable,
      };
      if (smtpPassword) data.smtp_password = smtpPassword;
      const updated = await updateNotificationConfig(data);
      setConfig(updated);
      setEmailEnabled(updated.email_enabled);
      setSmtpPassword("");
      setSaveResult({ section: "smtp", ok: true });
    } catch {
      setSaveResult({ section: "smtp", ok: false });
    } finally {
      setSaving("");
    }
  }

  async function saveTelegram() {
    setSaving("telegram");
    setSaveResult(null);
    try {
      // Auto-enable telegram if credentials are set
      const shouldEnable = telegramEnabled || (!!telegramChatId && (!!telegramToken || !!config?.telegram_bot_token_set));
      const data: Record<string, any> = {
        telegram_chat_id: telegramChatId,
        telegram_enabled: shouldEnable,
      };
      if (telegramToken) data.telegram_bot_token = telegramToken;
      const updated = await updateNotificationConfig(data);
      setConfig(updated);
      setTelegramEnabled(updated.telegram_enabled);
      setTelegramToken("");
      setSaveResult({ section: "telegram", ok: true });
    } catch {
      setSaveResult({ section: "telegram", ok: false });
    } finally {
      setSaving("");
    }
  }

  async function handleTest(channel: string) {
    setTesting(channel);
    setTestResult(null);
    try {
      const res = await testNotification(channel);
      setTestResult({ channel, ok: true, msg: res.message });
    } catch (err: any) {
      setTestResult({ channel, ok: false, msg: err.message || "Error" });
    } finally {
      setTesting("");
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
    <div className="max-w-3xl mx-auto px-3 md:px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Configuración</h1>

      {/* User info */}
      <div className="bg-white rounded-xl border p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-rohu-primary" />
          <h2 className="font-bold text-lg">Mi cuenta</h2>
        </div>
        {user && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b"><span className="text-rohu-muted">Nombre</span><span className="font-medium">{user.full_name}</span></div>
            <div className="flex justify-between py-2 border-b"><span className="text-rohu-muted">Email</span><span className="font-medium">{user.email}</span></div>
            <div className="flex justify-between py-2"><span className="text-rohu-muted">Zona horaria</span><span className="font-medium">{user.timezone}</span></div>
          </div>
        )}
      </div>

      {/* Change password */}
      <ChangePasswordSection />

      {/* ===================== EMAIL SMTP ===================== */}
      <div className="bg-white rounded-xl border p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-rohu-primary" />
            <h2 className="font-bold text-lg">Email (SMTP)</h2>
          </div>
          <button onClick={() => setEmailEnabled(!emailEnabled)} className="min-h-[44px] min-w-[44px] flex items-center justify-center">
            {emailEnabled
              ? <ToggleRight className="w-8 h-8 text-rohu-secondary" />
              : <ToggleLeft className="w-8 h-8 text-rohu-muted" />}
          </button>
        </div>

        {/* Instructions */}
        <div className="p-3 bg-rohu-accent/5 border border-rohu-accent/20 rounded-lg mb-4 text-sm text-rohu-muted">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 text-rohu-accent flex-shrink-0" />
            <div>
              <p className="font-medium text-rohu-text mb-1">¿Cómo configurar?</p>
              <p><strong>Gmail:</strong> Host: <code className="bg-gray-100 px-1 rounded">smtp.gmail.com</code> | Puerto: <code className="bg-gray-100 px-1 rounded">587</code> | TLS: Sí</p>
              <p className="mt-1"><strong>Contraseña:</strong> Usa una <em>App Password</em>, no tu contraseña normal. Ve a <code className="bg-gray-100 px-1 rounded">myaccount.google.com → Seguridad → Contraseñas de aplicaciones</code></p>
              <p className="mt-1"><strong>Outlook:</strong> Host: <code className="bg-gray-100 px-1 rounded">smtp.office365.com</code> | Puerto: <code className="bg-gray-100 px-1 rounded">587</code></p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-rohu-muted mb-1">Servidor SMTP</label>
              <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-rohu-muted mb-1">Puerto</label>
              <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Usuario (email)</label>
            <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="tu@gmail.com" className={inputClass} />
          </div>

          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">
              Contraseña {config?.smtp_password_set && <span className="text-rohu-secondary">(ya configurada, dejar vacío para mantener)</span>}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={config?.smtp_password_set ? "••••••••" : "App Password"}
                className={inputClass + " pr-10"}
              />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                {showPassword ? <EyeOff className="w-4 h-4 text-rohu-muted" /> : <Eye className="w-4 h-4 text-rohu-muted" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Email remitente (opcional, usa el usuario si vacío)</label>
            <input value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="noreply@tudominio.com" className={inputClass} />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={smtpTls} onChange={(e) => setSmtpTls(e.target.checked)} className="rounded" />
            Usar TLS (recomendado)
          </label>

          <div className="flex gap-2 pt-2">
            <button onClick={saveSmtp} disabled={saving === "smtp"} className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-rohu-primary text-white text-sm font-medium rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50">
              <Save className="w-4 h-4" />{saving === "smtp" ? "Guardando..." : "Guardar SMTP"}
            </button>
            <button onClick={() => handleTest("email")} disabled={testing === "email" || !config?.smtp_password_set} className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] border border-rohu-primary text-rohu-primary text-sm font-medium rounded-lg hover:bg-rohu-primary/5 disabled:opacity-50">
              <Send className="w-4 h-4" />{testing === "email" ? "Enviando..." : "Enviar prueba"}
            </button>
          </div>

          {saveResult?.section === "smtp" && (
            <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${saveResult.ok ? "bg-rohu-secondary/10 text-rohu-secondary-dark" : "bg-red-50 text-red-700"}`}>
              {saveResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {saveResult.ok ? "Configuración SMTP guardada" : "Error al guardar"}
            </div>
          )}
        </div>
      </div>

      {/* ===================== TELEGRAM ===================== */}
      <div className="bg-white rounded-xl border p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-rohu-accent" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.75 3.98-1.73 6.64-2.87 7.97-3.43 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .38z"/>
            </svg>
            <h2 className="font-bold text-lg">Telegram</h2>
          </div>
          <button onClick={() => setTelegramEnabled(!telegramEnabled)} className="min-h-[44px] min-w-[44px] flex items-center justify-center">
            {telegramEnabled
              ? <ToggleRight className="w-8 h-8 text-rohu-secondary" />
              : <ToggleLeft className="w-8 h-8 text-rohu-muted" />}
          </button>
        </div>

        {/* Instructions */}
        <div className="p-3 bg-rohu-accent/5 border border-rohu-accent/20 rounded-lg mb-4 text-sm text-rohu-muted">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 text-rohu-accent flex-shrink-0" />
            <div>
              <p className="font-medium text-rohu-text mb-1">¿Cómo configurar? (3 pasos)</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Abre Telegram y busca <strong>@BotFather</strong> → envía <code className="bg-gray-100 px-1 rounded">/newbot</code> → sigue las instrucciones → copia el <strong>token</strong></li>
                <li>Busca <strong>@userinfobot</strong> en Telegram → te responde con tu <strong>Chat ID</strong> (número)</li>
                <li>Envía cualquier mensaje a tu bot nuevo (para activar la conversación)</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">
              Bot Token {config?.telegram_bot_token_set && <span className="text-rohu-secondary">(ya configurado, dejar vacío para mantener)</span>}
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder={config?.telegram_bot_token_set ? "••••••••" : "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"}
                className={inputClass + " pr-10"}
              />
              <button onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                {showToken ? <EyeOff className="w-4 h-4 text-rohu-muted" /> : <Eye className="w-4 h-4 text-rohu-muted" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-rohu-muted mb-1">Chat ID</label>
            <input value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="123456789" className={inputClass} />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={saveTelegram} disabled={saving === "telegram"} className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-rohu-primary text-white text-sm font-medium rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50">
              <Save className="w-4 h-4" />{saving === "telegram" ? "Guardando..." : "Guardar Telegram"}
            </button>
            <button onClick={() => handleTest("telegram")} disabled={testing === "telegram" || !config?.telegram_bot_token_set} className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] border border-rohu-accent text-rohu-accent text-sm font-medium rounded-lg hover:bg-rohu-accent/5 disabled:opacity-50">
              <Send className="w-4 h-4" />{testing === "telegram" ? "Enviando..." : "Enviar prueba"}
            </button>
          </div>

          {saveResult?.section === "telegram" && (
            <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${saveResult.ok ? "bg-rohu-secondary/10 text-rohu-secondary-dark" : "bg-red-50 text-red-700"}`}>
              {saveResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {saveResult.ok ? "Configuración Telegram guardada" : "Error al guardar"}
            </div>
          )}
        </div>
      </div>

      {/* Test result toast */}
      {testResult && (
        <div className={`flex items-center gap-2 p-4 rounded-xl border text-sm ${testResult.ok ? "bg-rohu-secondary/10 border-rohu-secondary/20 text-rohu-secondary-dark" : "bg-red-50 border-red-200 text-red-700"}`}>
          {testResult.ok ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <div>
            <p className="font-medium">{testResult.ok ? "Prueba exitosa" : "Error en prueba"}</p>
            <p className="text-xs mt-0.5">{testResult.msg}</p>
          </div>
        </div>
      )}

      {/* Schedule config */}
      <div className="bg-white rounded-xl border p-4 md:p-6">
        <div className="flex items-center gap-3 mb-3">
          <Bell className="w-5 h-5 text-rohu-accent" />
          <h2 className="font-bold text-lg">Horario de notificaciones</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-rohu-muted">Enviar recordatorios diarios a las</span>
            <select
              value={config?.notification_hour ?? 8}
              onChange={async (e) => {
                const updated = await updateNotificationConfig({ notification_hour: parseInt(e.target.value) });
                setConfig(updated);
              }}
              className="px-2 py-1.5 border rounded-lg text-sm font-medium focus:ring-2 focus:ring-rohu-accent"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-rohu-muted">
            Los días de anticipación y canales se configuran por cada plantilla en{" "}
            <a href="/dashboard/templates" className="text-rohu-accent hover:underline">Plantillas</a>.
          </p>
        </div>
        <div className="text-sm text-rohu-muted space-y-2 mt-4 pt-4 border-t">
          <p className="font-medium text-rohu-text">Frecuencias disponibles por plantilla:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>7 días antes</strong> del vencimiento</li>
            <li><strong>3 días antes</strong> del vencimiento</li>
            <li><strong>1 día antes</strong> del vencimiento</li>
            <li><strong>El día del vencimiento</strong></li>
            <li><strong>Diariamente</strong> si está vencida (hasta que la pagues)</li>
          </ul>
        </div>
      </div>

      {/* Data maintenance - admin only */}
      {typeof window !== "undefined" && localStorage.getItem("user_role") === "admin" && (
        <PurgeSection />
      )}

      {/* Version */}
      <div className="bg-white rounded-xl border p-4 text-center">
        <VersionBadge />
      </div>
    </div>
  );
}

function ChangePasswordSection() {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setResult({ ok: false, msg: "Las contraseñas no coinciden" });
      return;
    }
    if (newPwd.length < 6) {
      setResult({ ok: false, msg: "La nueva contraseña debe tener al menos 6 caracteres" });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      await changePassword({ current_password: currentPwd, new_password: newPwd });
      setResult({ ok: true, msg: "Contraseña actualizada exitosamente" });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: any) {
      setResult({ ok: false, msg: err.message || "Error al cambiar contraseña" });
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full px-3 py-2.5 border border-rohu-border rounded-lg focus:ring-2 focus:ring-rohu-accent focus:border-rohu-accent text-sm";

  return (
    <div className="bg-white rounded-xl border p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <Eye className="w-5 h-5 text-rohu-primary" />
        <h2 className="font-bold text-lg">Cambiar contraseña</h2>
      </div>
      <form onSubmit={handleChange} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-rohu-muted mb-1">Contraseña actual</label>
          <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)}
            className={inputClass} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-rohu-muted mb-1">Nueva contraseña</label>
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
            className={inputClass} required minLength={6} />
        </div>
        <div>
          <label className="block text-xs font-medium text-rohu-muted mb-1">Confirmar nueva contraseña</label>
          <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
            className={inputClass} required minLength={6} />
        </div>
        {result && (
          <p className={`text-sm ${result.ok ? "text-rohu-secondary-dark" : "text-red-600"}`}>{result.msg}</p>
        )}
        <button type="submit" disabled={saving}
          className="px-4 py-2.5 min-h-[44px] bg-rohu-primary text-white text-sm font-medium rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50">
          {saving ? "Cambiando..." : "Cambiar contraseña"}
        </button>
      </form>
    </div>
  );
}

function PurgeSection() {
  const now = new Date();
  const [pYear, setPYear] = useState(now.getFullYear());
  const [pMonth, setPMonth] = useState(now.getMonth());
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);

  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  async function executePurge() {
    setPurging(true);
    setPurgeResult(null);
    try {
      const result = await purgeMonth(pYear, pMonth);
      setPurgeResult(`Eliminados: ${result.deleted_instances} facturas, ${result.deleted_payments} pagos, ${result.deleted_files} archivos`);
    } catch (err: any) {
      setPurgeResult(`Error: ${err.message}`);
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-red-200 p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <Trash2 className="w-5 h-5 text-red-500" />
        <h2 className="font-bold text-lg">Mantenimiento de datos</h2>
        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">Solo admin</span>
      </div>
      <p className="text-sm text-rohu-muted mb-4">
        Elimina datos de meses anteriores para mantener la base de datos liviana.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <select value={pYear} onChange={(e) => setPYear(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm">
          {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={pMonth} onChange={(e) => setPMonth(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm">
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>)}
        </select>
        <button onClick={() => setShowPurgeConfirm(true)} disabled={purging}
          className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
          <Trash2 className="w-4 h-4" />{purging ? "Eliminando..." : "Purgar mes"}
        </button>
      </div>
      {purgeResult && <p className={`mt-3 text-sm ${purgeResult.startsWith("Error") ? "text-red-600" : "text-rohu-secondary-dark"}`}>{purgeResult}</p>}

      <ConfirmModal
        open={showPurgeConfirm}
        title="Purgar datos del mes"
        message={`¿Eliminar TODOS los datos de ${getMonthName(pMonth)} ${pYear}?\n\nSe borrarán facturas, pagos, evidencias y logs.\nEsta acción NO se puede deshacer.`}
        type="danger"
        confirmLabel="Purgar"
        onConfirm={() => { setShowPurgeConfirm(false); executePurge(); }}
        onClose={() => setShowPurgeConfirm(false)}
      />
    </div>
  );
}
