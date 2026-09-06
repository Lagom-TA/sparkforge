from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB


class Generations(Base):
    __tablename__ = "generations"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    project_id = Column(Integer, index=True, nullable=False)
    request_text = Column(String(8000), nullable=False)
    status = Column(String, nullable=False)
    current_stage = Column(String, nullable=False)
    product_spec = Column(JSONB, nullable=True)
    public_log = Column(ARRAY(JSONB), nullable=False)
    error_message = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)