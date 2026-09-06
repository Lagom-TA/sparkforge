"""Validate project relationships before entity writes, including batch writes."""
from fastapi import HTTPException
from sqlalchemy import select
from models.projects import Projects
from models.versions import Versions


async def require_project(db, project_id, user_id):
    if not user_id:
        raise HTTPException(status_code=401, detail="请先登录。")
    project = (await db.execute(select(Projects).where(
        Projects.id == project_id, Projects.user_id == user_id,
    ))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在。")
    return project


async def require_version(db, version_id, project_id, user_id):
    version = (await db.execute(select(Versions).where(
        Versions.id == version_id, Versions.project_id == project_id,
        Versions.user_id == user_id,
    ))).scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=400, detail="激活版本不属于当前项目。")
    return version


async def validate_record(db, project, payload, user_id):
    """Enforce the active collection contract on every record write."""
    from datetime import date
    from math import isfinite
    if project.active_version_id is None:
        raise HTTPException(status_code=400, detail="请先生成应用版本。")
    version = await require_version(db, project.active_version_id, project.id, user_id)
    collections = (version.app_spec or {}).get('collections', [])
    collection = next((item for item in collections if item.get('key') == payload.get('collection_key')), None)
    if collection is None:
        raise HTTPException(status_code=400, detail="当前版本中不存在此集合。")
    values = payload.get('data')
    if not isinstance(values, dict):
        raise HTTPException(status_code=400, detail="记录内容必须是对象。")
    fields = collection.get('fields', [])
    allowed = {field['key'] for field in fields}
    if set(values) - allowed:
        raise HTTPException(status_code=400, detail="记录包含当前版本不支持的字段。")
    for field in fields:
        value = values.get(field['key'])
        empty = value is None or isinstance(value, str) and not value.strip()
        if empty:
            if field.get('required'):
                raise HTTPException(status_code=400, detail=f"请填写{field['label']}。")
            continue
        kind = field['type']
        valid = False
        if kind == 'boolean':
            valid = isinstance(value, bool)
        elif kind == 'number':
            valid = type(value) in (int, float) and isfinite(value)
        elif kind in ('text', 'textarea'):
            valid = isinstance(value, str)
        elif kind == 'select':
            valid = isinstance(value, str) and value in field.get('options', [])
        elif kind == 'date' and isinstance(value, str):
            try:
                valid = date.fromisoformat(value).isoformat() == value
            except ValueError:
                pass
        if not valid:
            raise HTTPException(status_code=400, detail=f"{field['label']}的值不符合字段类型。")
