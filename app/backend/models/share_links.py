from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Share_links(Base):
    __tablename__ = "share_links"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    project_id = Column(Integer, index=True, nullable=False)
    token = Column(String(160), nullable=False)
    permission = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)