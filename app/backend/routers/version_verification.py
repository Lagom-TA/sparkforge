"""Record explicit owner acceptance separately from source generation."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import select
from core.database import get_db
from dependencies.auth import get_current_user
from models.versions import Versions
from models.version_verification import VersionVerification
from services.generation_jobs import Jobs

router = APIRouter(prefix='/api/v1/version-verification', tags=['version-verification'])


class Acceptance(BaseModel):
    model_config = ConfigDict(extra='forbid')
    checks: list[StrictBool] = Field(min_length=3, max_length=30)


async def owned(db, version_id, user_id):
    version = await db.scalar(select(Versions).where(Versions.id == version_id, Versions.user_id == str(user_id)))
    if not version:
        raise HTTPException(404, '版本不存在。')
    return version


@router.get('/{version_id}')
async def get(version_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await owned(db, version_id, user.id)
    row = await db.get(VersionVerification, version_id)
    return {'verified': bool(row), 'method': 'owner' if row else None}


@router.put('/{version_id}')
async def verify(version_id: int, body: Acceptance, db=Depends(get_db), user=Depends(get_current_user)):
    version = await owned(db, version_id, user.id)
    project = await Jobs(db, user.id).lock_project(version.project_id)
    if project.status not in ('awaiting_verification', 'ready'):
        raise HTTPException(409, '项目正在处理其他任务，请完成或停止后再验收。')
    if project.active_version_id != version_id:
        raise HTTPException(409, '只能确认当前活动版本。')
    if len(body.checks) != len(version.product_spec.get('acceptance', [])) or not all(body.checks):
        raise HTTPException(422, '请逐项验证并确认全部验收条件。')
    if not await db.get(VersionVerification, version_id):
        db.add(VersionVerification(version_id=version_id, user_id=str(user.id)))
    project.status = 'ready'
    await db.commit()
    return {'verified': True, 'method': 'owner'}
