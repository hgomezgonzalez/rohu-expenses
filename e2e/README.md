# ROHU PayControl — E2E (Playwright)

Suite de pruebas de continuidad. Diseñada para ejecutarse antes de cada
despliegue contra un stack local o efímero, **nunca contra producción**.

## Setup

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
```

## Correr

Solo necesita que el frontend (`localhost:3000`) y la API (`localhost:8000`)
estén corriendo. Para correr la suite completa con sesión, exporta las
credenciales de un usuario de prueba (NO usar credenciales reales):

```bash
# Smoke sin sesión (cualquier entorno no-prod)
npm test

# Smoke con sesión
E2E_USER_EMAIL=test@example.com E2E_USER_PASSWORD=Test1234! npm test
```

Reporte HTML:

```bash
npm run report
```

## Gate pre-despliegue

Desde la raíz del proyecto:

```bash
./scripts/pre_deploy_check.sh
```

Si falla, no se debe desplegar. El reporte queda en `e2e/playwright-report/`.

## Stack efímero (opcional)

Para correr la suite contra una BD totalmente vacía:

```bash
docker compose -f docker-compose.e2e.yml up -d
# Configura el backend con DATABASE_URL apuntando a localhost:55432
# Levanta backend y frontend apuntando a este stack
# Corre los tests
```
