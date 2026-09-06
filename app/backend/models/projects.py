from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Projects(Base):
    __tablename__ = "projects"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    name = Column(String(120), nullable=False)
    initial_prompt = Column(String(8000), nullable=False)
    status = Column(String, nullable=False)
    active_version_id = Column(Integer, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)