from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB


class Versions(Base):
    __tablename__ = "versions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    project_id = Column(Integer, index=True, nullable=False)
    version_number = Column(Integer, nullable=False)
    product_spec = Column(JSONB, nullable=False)
    app_spec = Column(JSONB, nullable=False)
    source_bundle = Column(JSONB, nullable=False)
    change_summary = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)