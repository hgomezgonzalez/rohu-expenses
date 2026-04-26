from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.schema import MetaData

from app.core.config import settings

# Use schema for table creation and queries
metadata = MetaData(schema=settings.db_schema if settings.db_schema != "public" else None)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# Set search_path on every new connection so queries use the correct schema
@event.listens_for(engine.sync_engine, "connect")
def set_search_path(dbapi_conn, connection_record):
    if settings.db_schema and settings.db_schema != "public":
        cursor = dbapi_conn.cursor()
        cursor.execute(f"SET search_path TO {settings.db_schema}, public")
        cursor.close()
        dbapi_conn.commit()


async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    metadata = metadata


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
