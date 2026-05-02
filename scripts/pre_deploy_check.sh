#!/usr/bin/env bash
# Pre-deploy gate: corre la suite E2E contra un stack efímero y bloquea
# el despliegue si algo falla.
#
# Uso:
#   ./scripts/pre_deploy_check.sh                  # smoke sin sesión
#   E2E_USER_EMAIL=... E2E_USER_PASSWORD=... \
#     ./scripts/pre_deploy_check.sh                # smoke completo
#
# IMPORTANTE: este script NUNCA toca la base de datos de producción. Si se
# pasan credenciales E2E_USER_*, deben ser de un usuario de prueba en un
# entorno NO-prod (preferiblemente el stack levantado por este mismo script).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"
E2E_API_URL="${E2E_API_URL:-http://localhost:8000/api/v1}"

echo "==> Verificando que frontend ($E2E_BASE_URL) y API ($E2E_API_URL) estén arriba"
if ! curl -fsS "$E2E_BASE_URL" >/dev/null 2>&1; then
  echo "ERROR: frontend no responde en $E2E_BASE_URL"
  echo "Levanta el stack local: cd frontend && npm run dev"
  exit 2
fi
if ! curl -fsS "${E2E_API_URL%/api/v1}/health" >/dev/null 2>&1; then
  echo "ERROR: API no responde"
  echo "Levanta la API local: cd backend && python3 -m uvicorn app.main:app --reload --port 8000"
  exit 2
fi

echo "==> Instalando dependencias E2E (si hace falta)"
cd "$ROOT/e2e"
if [ ! -d node_modules ]; then
  npm install --silent
  npx playwright install --with-deps chromium >/dev/null
fi

echo "==> Corriendo Playwright"
export E2E_BASE_URL E2E_API_URL
if npx playwright test; then
  echo ""
  echo "OK Listo para desplegar"
  exit 0
else
  echo ""
  echo "FALLO Bloqueado: revisa el reporte con:  cd e2e && npm run report"
  exit 1
fi
