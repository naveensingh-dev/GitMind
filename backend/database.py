import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Integer, Text, DateTime, JSON, ForeignKey
from datetime import datetime, timezone

# Default to SQLite for seamless local development. 
# Production (via Docker) will override this with DATABASE_URL environment variable.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./gitmind_prod.db")

engine = create_async_engine(
    DATABASE_URL, 
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    github_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    login: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(100), nullable=True)
    avatar_url: Mapped[str] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

class Analysis(Base):
    __tablename__ = "analysis_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    repo: Mapped[str] = mapped_column(String(255))
    github_url: Mapped[str] = mapped_column(String(500))
    model: Mapped[str] = mapped_column(String(100))
    provider: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), default="completed")
    
    # Review Results
    review_json: Mapped[str] = mapped_column(Text, nullable=True) # Compressed JSON report
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Metrics for fast filtering
    confidence_score: Mapped[int] = mapped_column(Integer, default=0)
    security_count: Mapped[int] = mapped_column(Integer, default=0)
    performance_count: Mapped[int] = mapped_column(Integer, default=0)
    style_count: Mapped[int] = mapped_column(Integer, default=0)
    high_severity_count: Mapped[int] = mapped_column(Integer, default=0)
    
    diff_hash: Mapped[str] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    """Create tables if they don't exist (only for dev/test)"""
    # Use a sync engine locally for table creation to bypass greenlet issues
    if "sqlite" in DATABASE_URL:
        from sqlalchemy import create_engine
        sync_url = DATABASE_URL.replace("sqlite+aiosqlite", "sqlite")
        sync_engine = create_engine(sync_url)
        Base.metadata.create_all(sync_engine)
    else:
        # For Postgres, we still use the async method (usually managed by Alembic anyway)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
