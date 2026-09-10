from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.projects import Projects
from models.share_links import Share_links
from models.versions import Versions

router = APIRouter(prefix="/api/v1/public-share", tags=["public-share"])


@router.get("/{project_id}/{token}")
async def get_public_share(
    project_id: int,
    token: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """返回有效分享令牌对应的只读项目快照，无需登录。"""
    share_result = await db.execute(
        select(Share_links).where(
            Share_links.project_id == project_id,
            Share_links.token == token,
            Share_links.is_active.is_(True),
        )
    )
    share = share_result.scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="分享链接无效或已被撤销。")

    if share.expires_at is not None:
        expires_at = share.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="分享链接已过期。")

    project_result = await db.execute(
        select(Projects).where(
            Projects.id == project_id,
            Projects.user_id == share.user_id,
        )
    )
    project = project_result.scalar_one_or_none()
    if project is None or project.active_version_id is None:
        raise HTTPException(status_code=404, detail="分享的项目尚无可用版本。")

    version_result = await db.execute(
        select(Versions).where(
            Versions.id == project.active_version_id,
            Versions.project_id == project_id,
            Versions.user_id == share.user_id,
        )
    )
    version = version_result.scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=404, detail="分享的项目版本不存在。")

    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "status": project.status,
        },
        "version": {
            "id": version.id,
            "version_number": version.version_number,
            "app_spec": version.app_spec,
            "source_bundle": version.source_bundle if version.app_spec.get("runtime") == "html" else {"files": {}},
            "change_summary": version.change_summary,
            "created_at": version.created_at,
        },
    }