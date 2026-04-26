"""Seed script to populate the database with default categories and personal data."""

import asyncio
import sys
import os
from datetime import date
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.core.database import async_session_factory, engine, Base
from app.core.security import hash_password
from app.models.category import Category
from app.models.user import User
from app.models.bill_template import BillTemplate, RecurrenceType
from app.models.bill_instance import BillInstance, BillStatus
from app.models.income_source import IncomeSource
from app.models import *  # noqa: F401, F403 - ensure all models are imported
from seeds.categories import CATEGORIES, PERSONAL_BILL_TEMPLATES, PERSONAL_INCOME_SOURCES


async def seed_categories():
    async with async_session_factory() as session:
        for cat_data in CATEGORIES:
            existing = await session.execute(
                select(Category).where(Category.slug == cat_data["slug"])
            )
            if not existing.scalars().first():
                category = Category(
                    name=cat_data["name"],
                    slug=cat_data["slug"],
                    icon=cat_data["icon"],
                    color=cat_data["color"],
                    sort_order=cat_data["sort_order"],
                    is_default=True,
                )
                session.add(category)
                print(f"  Created category: {cat_data['name']}")
            else:
                print(f"  Category already exists: {cat_data['name']}")
        await session.commit()


async def seed_personal_data():
    """Seed personal bill templates and income sources for the main user."""
    async with async_session_factory() as session:
        # Find or create admin user
        result = await session.execute(select(User).where(User.email == "hgomezgonzalez@gmail.com"))
        user = result.scalars().first()
        if not user:
            user = User(
                email="hgomezgonzalez@gmail.com",
                hashed_password=hash_password("paycontrol2026"),
                full_name="Hugo Gomez",
                timezone="America/Bogota",
                role="admin",
            )
            session.add(user)
            await session.flush()
            print(f"  Created admin user: {user.email}")
        else:
            # Ensure admin role
            if user.role != "admin":
                user.role = "admin"
                await session.flush()
            print(f"  Admin user exists: {user.email}")

        # Load categories map
        cats_result = await session.execute(select(Category))
        cats = {c.slug: c.id for c in cats_result.scalars().all()}

        # Create bill templates
        created_templates = 0
        for tmpl in PERSONAL_BILL_TEMPLATES:
            existing = await session.execute(
                select(BillTemplate).where(
                    BillTemplate.user_id == user.id,
                    BillTemplate.name == tmpl["name"],
                )
            )
            if existing.scalars().first():
                continue

            category_id = cats.get(tmpl["category_slug"])
            if not category_id:
                print(f"  WARNING: category '{tmpl['category_slug']}' not found, skipping {tmpl['name']}")
                continue

            template = BillTemplate(
                user_id=user.id,
                category_id=category_id,
                name=tmpl["name"],
                provider=tmpl.get("provider"),
                estimated_amount=Decimal(str(tmpl["estimated_amount"])),
                due_day_of_month=tmpl["due_day"],
                recurrence_type=RecurrenceType.MONTHLY,
                notes=tmpl.get("notes"),
            )
            session.add(template)
            created_templates += 1

        print(f"  Created {created_templates} bill templates")

        # Create income sources
        created_income = 0
        for inc in PERSONAL_INCOME_SOURCES:
            existing = await session.execute(
                select(IncomeSource).where(
                    IncomeSource.user_id == user.id,
                    IncomeSource.name == inc["name"],
                )
            )
            if existing.scalars().first():
                continue

            source = IncomeSource(
                user_id=user.id,
                name=inc["name"],
                amount=Decimal(str(inc["amount"])),
                day_of_month=inc["day_of_month"],
            )
            session.add(source)
            created_income += 1

        print(f"  Created {created_income} income sources")
        await session.commit()

        # Generate bill instances for current month
        from app.services.bill_service import generate_monthly_bills
        today = date.today()
        async with async_session_factory() as session2:
            generated = await generate_monthly_bills(session2, user.id, today.year, today.month)
            await session2.commit()
            print(f"  Generated {len(generated)} bill instances for {today.year}-{today.month:02d}")


async def main():
    from app.core.config import settings
    from sqlalchemy import text

    # Create schema if needed (for shared DB like Heroku)
    if settings.db_schema and settings.db_schema != "public":
        async with engine.begin() as conn:
            await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {settings.db_schema}"))
        print(f"Schema '{settings.db_schema}' ensured.")

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created.")

    print("\nSeeding categories...")
    await seed_categories()

    print("\nSeeding personal data...")
    await seed_personal_data()

    print("\nSeed complete!")
    print("Login: hgomezgonzalez@gmail.com / paycontrol2026")


if __name__ == "__main__":
    asyncio.run(main())
