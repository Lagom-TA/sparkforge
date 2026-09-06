import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.share_links import Share_linksService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/share_links", tags=["share_links"])


# ---------- Pydantic Schemas ----------
class Share_linksData(BaseModel):
    """Entity data schema (for create/update)"""
    project_id: int
    token: str
    permission: str
    is_active: bool
    expires_at: Optional[datetime] = None


class Share_linksUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    project_id: Optional[int] = None
    token: Optional[str] = None
    permission: Optional[str] = None
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None


class Share_linksResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    project_id: int
    token: str
    permission: str
    is_active: bool
    expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Share_linksListResponse(BaseModel):
    """List response schema"""
    items: List[Share_linksResponse]
    total: int
    skip: int
    limit: int


class Share_linksBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Share_linksData]


class Share_linksBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Share_linksUpdateData


class Share_linksBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Share_linksBatchUpdateItem]


class Share_linksBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Share_linksListResponse)
async def query_share_linkss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query share_linkss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying share_linkss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Share_linksService(db)
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
        logger.debug(f"Found {result['total']} share_linkss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid share_links query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying share_linkss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Share_linksResponse)
async def get_share_links(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single share_links by ID (user can only see their own records)"""
    logger.debug(f"Fetching share_links with id: {id}, fields={fields}")
    
    service = Share_linksService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Share_links with id {id} not found")
            raise HTTPException(status_code=404, detail="Share_links not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching share_links {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Share_linksResponse, status_code=201)
async def create_share_links(
    data: Share_linksData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new share_links"""
    logger.debug(f"Creating new share_links with data: {data}")
    
    service = Share_linksService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create share_links")
        
        logger.info(f"Share_links created successfully with id: {result.id}")
        return result
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as e:
        logger.error(f"Validation error creating share_links: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating share_links: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Share_linksResponse], status_code=201)
async def create_share_linkss_batch(
    request: Share_linksBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple share_linkss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} share_linkss")
    
    service = Share_linksService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id), commit=False)
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} share_linkss successfully")
        await db.commit()
        return results
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Share_linksResponse])
async def update_share_linkss_batch(
    request: Share_linksBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple share_linkss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} share_linkss")
    
    service = Share_linksService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id), commit=False)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} share_linkss successfully")
        await db.commit()
        return results
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Share_linksResponse)
async def update_share_links(
    id: int,
    data: Share_linksUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing share_links (requires ownership)"""
    logger.debug(f"Updating share_links {id} with data: {data}")

    service = Share_linksService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Share_links with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Share_links not found")
        
        logger.info(f"Share_links {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating share_links {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating share_links {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_share_linkss_batch(
    request: Share_linksBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple share_linkss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} share_linkss")
    
    service = Share_linksService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id), commit=False)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} share_linkss successfully")
        await db.commit()
        return {"message": f"Successfully deleted {deleted_count} share_linkss", "deleted_count": deleted_count}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_share_links(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single share_links by ID (requires ownership)"""
    logger.debug(f"Deleting share_links with id: {id}")
    
    service = Share_linksService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Share_links with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Share_links not found")
        
        logger.info(f"Share_links {id} deleted successfully")
        return {"message": "Share_links deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting share_links {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
