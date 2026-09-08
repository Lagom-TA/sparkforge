"""Durable execution metadata; product entities remain backward readable."""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, JSON, UniqueConstraint, Index
from core.database import Base


class GenerationJob(Base):
    __tablename__ = "generation_jobs"
    __table_args__ = (UniqueConstraint("user_id", "request_key"),)
    id = Column(Integer, primary_key=True)
    generation_id = Column(Integer, nullable=False, unique=True, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    request_key = Column(String(64), nullable=False)
    kind = Column(String(16), nullable=False)
    stage = Column(String(32), nullable=False)
    status = Column(String(24), nullable=False, default="pending")
    payload = Column(JSON, nullable=False, default=dict)
    lease_token = Column(String(64))
    lease_until = Column(DateTime(timezone=True))
    version_id = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# Expose the invariant to Alembic autogeneration without editing generated models.
from models.versions import Versions
Index("uq_versions_project_number", Versions.project_id, Versions.version_number, unique=True)
