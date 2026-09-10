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
    ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
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
    if project.active_version_id is None:
        raise HTTPException(status_code=400, detail="请先生成应用版本。")
    version = await require_version(db, project.active_version_id, project.id, user_id)
    collections = (version.app_spec or {}).get('collections', [])
    validate_record_data(collections, payload)


def validate_record_data(collections, payload):
    from datetime import date
    from math import isfinite
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


async def validate_existing_records(db, project_id, user_id, spec):
    """Reject a new contract that would make saved records unusable; never transform data."""
    from models.app_records import App_records
    from services.generation_contracts import ContractError
    records = await db.stream_scalars(select(App_records).where(
        App_records.project_id == project_id, App_records.user_id == user_id,
        App_records.is_deleted.is_(False),
    ).order_by(App_records.id.asc()).execution_options(yield_per=500))
    try:
        async for record in records:
            try:
                validate_record_data(spec.get('collections', []), {'collection_key': record.collection_key, 'data': record.data})
            except HTTPException:
                raise ContractError('collections', '新结构会使现有记录无法使用，请保留集合与字段定义，或先处理已有记录。', 'data_conflict') from None
    finally:
        await records.close()
