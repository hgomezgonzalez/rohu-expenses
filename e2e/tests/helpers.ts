import { APIRequestContext, expect, Page, request } from "@playwright/test";

// Base must end with `/` so that relative paths preserve the /api/v1 prefix
// when resolved by Playwright's APIRequestContext.
export const API_URL = process.env.E2E_API_URL || "http://localhost:8000/api/v1/";
export const API_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, "");

export interface TestUser {
  email: string;
  password: string;
  fullName: string;
}

// Create a fresh user via the admin bootstrap endpoint or direct DB seed.
// For E2E we expect the backend was started with E2E_AUTO_ACTIVATE=true so
// new registrations are immediately active (see backend/.env.e2e).
export function makeTestUser(prefix = "e2e"): TestUser {
  const stamp = Date.now();
  return {
    email: `${prefix}+${stamp}@example.com`,
    password: "Test1234!",
    fullName: `E2E ${prefix} ${stamp}`,
  };
}

export async function apiContext(): Promise<APIRequestContext> {
  return await request.newContext({ baseURL: API_URL });
}

export async function registerAndLogin(api: APIRequestContext, user: TestUser): Promise<string> {
  const reg = await api.post("auth/register", {
    data: {
      email: user.email,
      password: user.password,
      full_name: user.fullName,
    },
  });
  expect([201, 409]).toContain(reg.status());

  const login = await api.post("auth/login", {
    data: { email: user.email, password: user.password },
  });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.access_token as string;
}

export async function setAuth(page: Page, token: string) {
  await page.addInitScript((t) => {
    localStorage.setItem("access_token", t);
  }, token);
}
