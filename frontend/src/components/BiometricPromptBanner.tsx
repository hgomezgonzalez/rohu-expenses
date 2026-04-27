"use client";

import { useEffect, useState } from "react";
import { Fingerprint, X } from "lucide-react";
import {
  enrollPasskey,
  isPasskeySupported,
  listPasskeys,
} from "@/lib/webauthn";

const DISMISS_KEY = "passkey_prompt_dismissed";

function suggestDeviceName(): string {
  if (typeof navigator === "undefined") return "Mi dispositivo";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "Mi dispositivo";
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export default function BiometricPromptBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (typeof window === "undefined") return;
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      if (!isCoarsePointer()) return;
      const supported = await isPasskeySupported();
      if (!supported) return;
      try {
        const existing = await listPasskeys();
        if (cancelled) return;
        if (existing.length === 0) setVisible(true);
      } catch {
        // ignore — if we cannot list (e.g. session lost), don't show banner
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      await enrollPasskey(suggestDeviceName());
      setVisible(false);
    } catch (err: any) {
      setError(err?.message || "No se pudo activar la biometría");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-3 md:mx-4 mt-3 md:mt-4 rounded-xl border border-rohu-accent/30 bg-rohu-accent/5 p-3 md:p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 p-2 bg-rohu-accent/15 rounded-lg">
          <Fingerprint className="w-5 h-5 text-rohu-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-rohu-text">Entra más rápido la próxima vez</p>
          <p className="text-xs text-rohu-muted mt-0.5">
            Activa Face ID, Touch ID o tu huella en este dispositivo y no tendrás que teclear la contraseña.
          </p>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={activate}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] bg-rohu-accent text-white text-sm font-medium rounded-lg hover:bg-rohu-accent/90 disabled:opacity-60"
            >
              <Fingerprint className="w-4 h-4" />
              {busy ? "Activando..." : "Activar ahora"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              className="px-3 py-2 min-h-[40px] text-sm text-rohu-muted rounded-lg hover:bg-gray-100 disabled:opacity-60"
            >
              Después
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="p-1 rounded hover:bg-black/5 text-rohu-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
