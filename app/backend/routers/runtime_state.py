"""An authenticated, bounded storage bridge for isolated application frames."""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, JsonValue
from sqlalchemy import select
from core.database import get_db
from dependencies.auth import get_current_user
from models.versions import Versions
from models.runtime_state import RuntimeState
from services.generation_jobs import Jobs

router = APIRouter(prefix='/api/v1/runtime-state', tags=['runtime-state'])


class SaveState(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=0, strict=True)
    state: JsonValue


async def owned_version(db, version_id, user_id):
    version = await db.scalar(select(Versions).where(Versions.id == version_id, Versions.user_id == str(user_id)))
    if not version or version.app_spec.get('runtime') != 'html':
        raise HTTPException(404, '交互应用版本不存在。')
    return version


@router.get('/{version_id}')
async def load(version_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await owned_version(db, version_id, user.id)
    row = await db.get(RuntimeState, version_id)
    return {'state': row.state if row else None, 'revision': row.revision if row else 0}


@router.put('/{version_id}')
async def save(version_id: int, body: SaveState, db=Depends(get_db), user=Depends(get_current_user)):
    try:
        encoded = json.dumps(body.state, ensure_ascii=False, allow_nan=False)
    except (ValueError, RecursionError):
        raise HTTPException(422, '状态必须是有限深度的合法 JSON。') from None
    if len(encoded.encode()) > 100000:
        raise HTTPException(413, '应用状态超过 100KB，请减少保存的数据。')
    version = await owned_version(db, version_id, user.id)
    project = await Jobs(db, user.id).lock_project(version.project_id)
    if project.active_version_id != version_id:
        raise HTTPException(409, '历史版本不能覆盖当前应用状态。')
    row = await db.get(RuntimeState, version_id, populate_existing=True)
    if body.revision != (row.revision if row else 0):
        raise HTTPException(409, '另一页面已修改数据，请重新加载后再保存。')
    if row:
        row.state, row.revision = body.state, row.revision + 1
    else:
        row = RuntimeState(version_id=version_id, user_id=str(user.id), state=body.state, revision=1)
        db.add(row)
    result = {'revision': row.revision}
    await db.commit()
    return result
