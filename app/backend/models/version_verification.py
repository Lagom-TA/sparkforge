from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime
from core.database import Base


class VersionVerification(Base):
    __tablename__ = 'version_verifications'
    version_id = Column(Integer, primary_key=True)
    user_id = Column(String, nullable=False)
    verified_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
