"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Zap, CheckCircle } from "lucide-react";
import { login, register, getMe } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("access_token")) {
      router.push("/dashboard");
    } else {
      setChecking(false);
    }
  }, [router]);

  if (checking) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (isRegister) {
        const result = await register(email, password, fullName);
        setSuccess(result.message);
        setIsRegister(false);
        setEmail(""); setPassword(""); setFullName("");
      } else {
        const result = await login(email, password);
        localStorage.setItem("access_token", result.access_token);
        localStorage.setItem("refresh_token", result.refresh_token);
        localStorage.setItem("user_role", result.role);
        try {
          const me = await getMe();
          localStorage.setItem("user_name", me.full_name);
        } catch { /* ignore */ }
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-rohu-accent focus:border-rohu-accent";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-rohu-primary/5 to-rohu-accent/10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo-rohu.webp" alt="ROHU PayControl" width={220} height={80} className="mx-auto mb-2" />
          <p className="text-rohu-muted mt-1">Nunca más se te pasa un pago</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex gap-2 mb-6">
            <button onClick={() => { setIsRegister(false); setError(""); setSuccess(""); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${!isRegister ? "bg-rohu-primary text-white" : "bg-gray-100 text-rohu-muted"}`}>
              Iniciar sesión
            </button>
            <button onClick={() => { setIsRegister(true); setError(""); setSuccess(""); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${isRegister ? "bg-rohu-primary text-white" : "bg-gray-100 text-rohu-muted"}`}>
              Registrarme
            </button>
          </div>

          {success && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-rohu-secondary/10 text-rohu-secondary-dark rounded-lg text-sm">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <p>{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-sm font-medium mb-1">Nombre completo</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className={inputClass} placeholder="Tu nombre" required />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className={inputClass} placeholder="tu@email.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputClass} placeholder="••••••••" required minLength={6} />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3 min-h-[48px] bg-rohu-primary text-white font-semibold rounded-lg hover:bg-rohu-primary-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" />
              {loading ? "Cargando..." : isRegister ? "Crear cuenta" : "Entrar"}
            </button>
          </form>

          {isRegister && (
            <p className="text-xs text-center text-rohu-muted mt-4">
              Tu cuenta será activada por el administrador
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
