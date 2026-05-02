import { expect, test } from "@playwright/test";
import { apiContext, API_ORIGIN } from "./helpers";

// Suite mínima de continuidad: valida que cada módulo responde y carga
// sin errores. Los tests con sesión sólo corren si se proveen
// E2E_USER_EMAIL/E2E_USER_PASSWORD.

test.describe("Continuidad de la plataforma", () => {
  test("API health responde", async ({ request }) => {
    const res = await request.get(`${API_ORIGIN}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("healthy");
  });

  test("Login page carga", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(page.getByPlaceholder("tu@email.com")).toBeVisible();
  });

  test("Dashboard sin sesión redirige a login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/$|\?session=expired/);
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("Endpoint /auth/refresh existe (rechaza body vacío)", async () => {
    const api = await apiContext();
    const res = await api.post("auth/refresh", { data: {} });
    expect([401, 422]).toContain(res.status());
  });
});

test.describe("Módulos (smoke con sesión)", () => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  test.skip(!email || !password, "Set E2E_USER_EMAIL/E2E_USER_PASSWORD para correr smoke con sesión");

  let token = "";

  test.beforeAll(async () => {
    const api = await apiContext();
    const res = await api.post("auth/login", { data: { email, password } });
    if (!res.ok()) throw new Error(`Login E2E falló: ${res.status()}`);
    token = (await res.json()).access_token;
  });

  for (const module of [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Plantillas", path: "/dashboard/templates" },
    { name: "Pagos", path: "/dashboard/payments" },
    { name: "Ingresos", path: "/dashboard/income" },
    { name: "Reportes", path: "/dashboard/reports" },
    { name: "Ajustes", path: "/dashboard/settings" },
    { name: "Perfil", path: "/dashboard/profile" },
  ]) {
    test(`${module.name} carga sin errores`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem("access_token", t);
      }, token);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(module.path);
      await page.waitForLoadState("networkidle");
      expect(errors, `Errores JS en ${module.name}: ${errors.join(", ")}`).toHaveLength(0);
    });
  }
});
