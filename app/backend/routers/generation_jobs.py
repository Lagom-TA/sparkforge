"""Short, resumable generation requests with server-owned state transitions."""
import asyncio
from sqlalchemy.exc import IntegrityError
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
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


class Control(BaseModel):
    action: Literal['paused', 'stopped', 'resume']


class Plan(BaseModel):
    product_spec: dict


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


@router.put('/{generation_id}/plan')
async def edit(generation_id: int, body: Plan, jobs=Depends(service)):
    try:
        return await jobs.edit_plan(generation_id, body.product_spec)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
