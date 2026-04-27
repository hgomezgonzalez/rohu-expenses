// Passkey / WebAuthn client helpers — biometric login on mobile (Face ID / Touch ID / Android huella).
// Only invoked from the login screen and the security section of profile,
// so it adds zero overhead to the rest of the app.

import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const PASSKEY_FLAG = "passkey_enrolled";

interface OptionsResponse {
  options: any;
  state_token: string;
}

async function api<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers: HeadersInit = { "Content-Type": "application/json", ...(init?.headers || {}) };
  if (init?.auth) {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) (headers as any).Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export function hasPasskeyEnrolledLocally(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(PASSKEY_FLAG) === "1";
}

export function markPasskeyEnrolledLocally(value: boolean) {
  if (typeof window === "undefined") return;
  if (value) localStorage.setItem(PASSKEY_FLAG, "1");
  else localStorage.removeItem(PASSKEY_FLAG);
}

export interface PasskeyCredential {
  id: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function enrollPasskey(deviceName: string): Promise<PasskeyCredential> {
  const init = await api<OptionsResponse>("/auth/passkey/register/options", {
    method: "POST",
    body: JSON.stringify({ device_name: deviceName }),
    auth: true,
  });

  const attestation = await startRegistration({ optionsJSON: init.options });

  const credential = await api<PasskeyCredential>("/auth/passkey/register/verify", {
    method: "POST",
    body: JSON.stringify({
      response: attestation,
      state_token: init.state_token,
      device_name: deviceName,
    }),
    auth: true,
  });

  markPasskeyEnrolledLocally(true);
  return credential;
}

export interface PasskeyLoginResult {
  access_token: string;
  refresh_token: string;
  role: string;
}

export async function loginWithPasskey(): Promise<PasskeyLoginResult> {
  const init = await api<OptionsResponse>("/auth/passkey/login/options", { method: "POST" });
  const assertion = await startAuthentication({ optionsJSON: init.options });
  return api<PasskeyLoginResult>("/auth/passkey/login/verify", {
    method: "POST",
    body: JSON.stringify({ response: assertion, state_token: init.state_token }),
  });
}

export async function listPasskeys(): Promise<PasskeyCredential[]> {
  return api<PasskeyCredential[]>("/auth/passkey", { auth: true });
}

export async function deletePasskey(id: string): Promise<void> {
  await api<void>(`/auth/passkey/${id}`, { method: "DELETE", auth: true });
}
