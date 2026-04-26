# ROHU PayControl

Aplicación personal de control de gastos y pagos mensuales. Nunca más se pasa un pago.

## Stack
- **Backend**: FastAPI (Python) + SQLAlchemy async + PostgreSQL + Redis
- **Frontend**: Next.js PWA (pendiente)
- **Scheduler**: APScheduler para jobs recurrentes
- **Email**: SMTP (envío) + MailHog (dev)
- **Infrastructure**: Docker Compose (postgres, redis, mailhog)

## Convenciones
- Respuestas en español, código/variables/tablas en inglés
- Plan obligatorio antes de codificar
- Commits: Conventional Commits (feat:, fix:, chore:, ci:)

## Comandos de desarrollo
```bash
# Levantar infraestructura
docker compose up -d

# Instalar dependencias
cd backend && pip install -r requirements.txt

# Crear .env
cp backend/.env.example backend/.env

# Seed de categorías
cd backend && python3 -m seeds.seed_db

# Correr API
cd backend && python3 -m uvicorn app.main:app --reload --port 8000

# Docs API
http://localhost:8000/docs
```

## Estructura del proyecto
```
backend/
  app/
    api/v1/endpoints/  - Endpoints REST
    core/              - Config, DB, security
    models/            - SQLAlchemy models
    schemas/           - Pydantic schemas
    services/          - Business logic
    jobs/              - Scheduled jobs
  migrations/          - Alembic migrations
  seeds/               - Seed data
  tests/               - Tests
```
