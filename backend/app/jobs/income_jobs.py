"""Scheduled job for generating monthly income entries from templates."""

import logging
from datetime import date

from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.user import User
from app.models.income_source import IncomeSource
from app.services.income_service import generate_income_entries

logger = logging.getLogger(__name__)


async def generate_monthly_income_entries():
    """Generate income entries for all users with active income sources.
    Runs on the 1st of each month. Idempotent."""
    today = date.today()
    year, month = today.year, today.month
    logger.info("Generating income entries for %d-%02d...", year, month)

    async with async_session_factory() as db:
        # Find all users that have active income sources
        result = await db.execute(
            select(User.id).join(IncomeSource).where(
                IncomeSource.is_active == True,
                IncomeSource.income_type == "recurring",
            ).distinct()
        )
        user_ids = [row[0] for row in result.all()]

        total_generated = 0
        total_skipped = 0

        for user_id in user_ids:
            result = await generate_income_entries(db, user_id, year, month)
            total_generated += result["generated"]
            total_skipped += result["skipped"]

        await db.commit()
        logger.info(
            "Income entry generation complete. Generated: %d, Skipped: %d, Users: %d",
            total_generated, total_skipped, len(user_ids),
        )
        return {"generated": total_generated, "skipped": total_skipped, "users": len(user_ids)}
