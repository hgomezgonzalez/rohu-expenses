import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import settings
from app.api.v1.router import api_router
from app.jobs.notification_jobs import check_and_send_reminders
from app.jobs.income_jobs import generate_monthly_income_entries

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: schedule jobs
    scheduler.add_job(
        check_and_send_reminders,
        "cron",
        hour=8,
        minute=0,
        id="daily_reminders",
        replace_existing=True,
    )
    scheduler.add_job(
        generate_monthly_income_entries,
        "cron",
        day=1,
        hour=0,
        minute=30,
        id="monthly_income_generation",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started - daily reminders at 08:00, income generation on 1st at 00:30")
    yield
    # Shutdown
    scheduler.shutdown()


app = FastAPI(
    title="ROHU PayControl API",
    description="API para control de gastos y pagos mensuales. Nunca más se te pasa un pago.",
    version="0.3.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.app_name, "version": "0.3.0"}
