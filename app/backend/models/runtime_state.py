"""Version-scoped application state; never shared through public previews."""
from sqlalchemy import Column, Integer, String, JSON
from core.database import Base


class RuntimeState(Base):
    __tablename__ = 'runtime_states'
    version_id = Column(Integer, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    revision = Column(Integer, nullable=False)
    state = Column(JSON, nullable=True)
