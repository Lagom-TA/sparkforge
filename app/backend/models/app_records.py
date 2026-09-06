from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB


class App_records(Base):
    __tablename__ = "app_records"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    project_id = Column(Integer, index=True, nullable=False)
    collection_key = Column(String(80), nullable=False)
    record_key = Column(String(120), nullable=False)
    data = Column(JSONB, nullable=False)
    is_deleted = Column(Boolean, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)