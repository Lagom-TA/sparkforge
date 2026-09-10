import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.app_records import App_recordsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/app_records", tags=["app_records"])


# ---------- Pydantic Schemas ----------
class App_recordsData(BaseModel):
    """Entity data schema (for create/update)"""
    project_id: int
    collection_key: str
    record_key: str
    data: dict
    is_deleted: bool


class App_recordsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    project_id: Optional[int] = None
    collection_key: Optional[str] = None
    record_key: Optional[str] = None
    data: Optional[dict] = None
    is_deleted: Optional[bool] = None


class App_recordsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    project_id: int
    collection_key: str
    record_key: str
    data: dict
    is_deleted: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class App_recordsListResponse(BaseModel):
    """List response schema"""
    items: List[App_recordsResponse]
    total: int
    skip: int
    limit: int


class App_recordsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[App_recordsData]


class App_recordsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: App_recordsUpdateData


class App_recordsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[App_recordsBatchUpdateItem]


class App_recordsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=App_recordsListResponse)
async def query_app_recordss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query app_recordss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying app_recordss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = App_recordsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            user_id=str(current_user.id),
        )
        logger.debug(f"Found {result['total']} app_recordss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid app_records query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying app_recordss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="服务暂时不可用，请稍后重试。")


@router.get("/{id}", response_model=App_recordsResponse)
async def get_app_records(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single app_records by ID (user can only see their own records)"""
    logger.debug(f"Fetching app_records with id: {id}, fields={fields}")
    
    service = App_recordsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"App_records with id {id} not found")
            raise HTTPException(status_code=404, detail="App_records not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching app_records {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="服务暂时不可用，请稍后重试。")


@router.post("", response_model=App_recordsResponse, status_code=201)
async def create_app_records(
    data: App_recordsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new app_records"""
    logger.debug(f"Creating new app_records with data: {data}")
    
    service = App_recordsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create app_records")
        
        logger.info(f"App_records created successfully with id: {result.id}")
        return result
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as e:
        logger.error(f"Validation error creating app_records: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating app_records: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="服务暂时不可用，请稍后重试。")


@router.post("/batch", response_model=List[App_recordsResponse], status_code=201)
async def create_app_recordss_batch(
    request: App_recordsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple app_recordss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} app_recordss")
    
    service = App_recordsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id), commit=False)
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} app_recordss successfully")
        await db.commit()
        return results
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[App_recordsResponse])
async def update_app_recordss_batch(
    request: App_recordsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple app_recordss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} app_recordss")
    
    service = App_recordsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id), commit=False)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} app_recordss successfully")
        await db.commit()
        return results
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=App_recordsResponse)
async def update_app_records(
    id: int,
    data: App_recordsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing app_records (requires ownership)"""
    logger.debug(f"Updating app_records {id} with data: {data}")

    service = App_recordsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"App_records with id {id} not found for update")
            raise HTTPException(status_code=404, detail="App_records not found")
        
        logger.info(f"App_records {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating app_records {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating app_records {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="服务暂时不可用，请稍后重试。")


@router.delete("/batch")
async def delete_app_recordss_batch(
    request: App_recordsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple app_recordss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} app_recordss")
    
    service = App_recordsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id), commit=False)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} app_recordss successfully")
        await db.commit()
        return {"message": f"Successfully deleted {deleted_count} app_recordss", "deleted_count": deleted_count}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_app_records(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single app_records by ID (requires ownership)"""
    logger.debug(f"Deleting app_records with id: {id}")
    
    service = App_recordsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"App_records with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="App_records not found")
        
        logger.info(f"App_records {id} deleted successfully")
        return {"message": "App_records deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting app_records {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="服务暂时不可用，请稍后重试。")
