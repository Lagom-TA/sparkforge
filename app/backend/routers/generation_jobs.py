"""Short, resumable generation requests with server-owned state transitions."""
import asyncio
from sqlalchemy.exc import IntegrityError
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StrictBool, ConfigDict, model_validator
from core.database import get_db
from dependencies.auth import get_current_user
from services.generation_jobs import Jobs

router = APIRouter(prefix='/api/v1/generation-jobs', tags=['generation-jobs'])


class Start(BaseModel):
    project_id: int = Field(gt=0)
    kind: Literal['plan', 'build']
    request_text: str = Field(min_length=1, max_length=8000)
    request_key: str = Field(min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    product_spec: dict | None = None
    expected_generation_id: int | None = None
    expected_active_version_id: int | None = None

    @model_validator(mode='after')
    def require_build_context(self):
        if self.kind == 'build' and not {'expected_generation_id', 'expected_active_version_id'} <= self.model_fields_set:
            raise ValueError('构建必须提供批准时的蓝图和活动版本标识。')
        return self


class Control(BaseModel):
    action: Literal['paused', 'stopped', 'resume']


async def service(db=Depends(get_db), user=Depends(get_current_user)):
    return Jobs(db, user.id)


@router.post('', status_code=202)
async def start(body: Start, jobs=Depends(service)):
    try:
        return await jobs.start(**body.model_dump())
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    except IntegrityError:
        await jobs.db.rollback()
        raise HTTPException(409, "请求标识冲突，请查询现有任务。") from None


@router.get('/{generation_id}')
async def get(generation_id: int, jobs=Depends(service)):
    return await jobs.snapshot(await jobs.find(generation_id))


@router.post('/{generation_id}/step')
async def step(generation_id: int, jobs=Depends(service)):
    try:
        async with asyncio.timeout(85):
            return await jobs.step(generation_id)
    except TimeoutError:
        await jobs.db.rollback()
        raise HTTPException(504, '步骤等待已结束，任务已保存，请查询状态后恢复。') from None


@router.post('/{generation_id}/control')
async def control(generation_id: int, body: Control, jobs=Depends(service)):
    return await jobs.control(generation_id, body.action)


class Draft(BaseModel):
    model_config = ConfigDict(extra='forbid')
    project_id: int = Field(gt=0)
    product_spec: dict
    request_key: str = Field(min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    expected_generation_id: int | None
    expected_active_version_id: int | None


@router.post('/draft', status_code=201)
async def draft(body: Draft, jobs=Depends(service)):
    try:
        return await jobs.save_draft(body.project_id, body.product_spec, body.request_key, body.expected_generation_id, body.expected_active_version_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


class StartupCheck(BaseModel):
    model_config = ConfigDict(extra='forbid')
    token: str = Field(min_length=32, max_length=32)
    passed: StrictBool
    message: str = Field(default='', max_length=500)


@router.post('/{generation_id}/validation')
async def validation(generation_id: int, body: StartupCheck, jobs=Depends(service)):
    return await jobs.validate_candidate(generation_id, body.token, body.passed, body.message)
