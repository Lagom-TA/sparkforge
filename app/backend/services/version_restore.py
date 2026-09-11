"""Activate an immutable version without replacing saved application data."""
from fastapi import HTTPException
from sqlalchemy import select
from models.generation_jobs import GenerationJob
from models.generations import Generations
from models.version_verification import VersionVerification
from services import generation_contracts as contracts
from services.generation_jobs import Jobs, log
from services.project_integrity import require_version, validate_existing_records


async def restore_version(db, user_id, project_id, version_id, expected_active_version_id):
    user_id = str(user_id)
    project = await Jobs(db, user_id).lock_project(project_id)
    version = await require_version(db, version_id, project_id, user_id)
    if project.active_version_id != expected_active_version_id:
        raise HTTPException(409, '活动版本已变化，请刷新后再恢复。')
    jobs = (await db.scalars(select(GenerationJob).where(
        GenerationJob.project_id == project_id, GenerationJob.user_id == user_id,
        GenerationJob.status.in_(['pending', 'running', 'paused', 'failed', 'awaiting_approval']),
    ))).all()
    if any(job.status in ('pending', 'running') for job in jobs):
        raise HTTPException(409, '请先停止当前生成任务，再恢复历史版本。')
    try:
        contracts.plan(version.product_spec)
        spec = contracts.app_spec(version.app_spec)
        bundle = contracts.source(version.source_bundle)
        if (spec['runtime'] == 'html') != ('index.html' in bundle['files']):
            raise contracts.ContractError('files', '源码与运行类型不匹配')
        await validate_existing_records(db, project_id, user_id, spec)
    except contracts.ContractError as error:
        raise HTTPException(409, f'无法恢复此版本：{error}') from None
    for job in jobs:
        job.status, job.lease_token, job.lease_until = 'stopped', None, None
        generation = await db.get(Generations, job.generation_id)
        generation.status = 'stopped'
        log(generation, '已恢复历史版本，此任务已停止。')
    project.active_version_id = version.id
    project.status = 'ready' if await db.get(VersionVerification, version.id) else 'awaiting_verification'
    await db.commit()
    return {'active_version_id': version.id, 'status': project.status}
