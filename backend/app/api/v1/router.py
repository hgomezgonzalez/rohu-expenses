from fastapi import APIRouter

from app.api.v1.endpoints import auth, bills, payments, dashboard, categories, income_sources, notifications, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(bills.router)
api_router.include_router(payments.router)
api_router.include_router(dashboard.router)
api_router.include_router(categories.router)
api_router.include_router(income_sources.router)
api_router.include_router(notifications.router)
api_router.include_router(users.router)
