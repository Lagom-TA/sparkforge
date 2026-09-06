import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.generations import GenerationsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/generations", tags=["generations"])


# ---------- Pydantic Schemas ----------
class GenerationsData(BaseModel):
    """Entity data schema (for create/update)"""
    project_id: int
    request_text: str
    status: str
    current_stage: str
    product_spec: Optional[dict] = None
    public_log: List[dict]
    error_message: str = None


class GenerationsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    project_id: Optional[int] = None
    request_text: Optional[str] = None
    status: Optional[str] = None
    current_stage: Optional[str] = None
    product_spec: Optional[dict] = None
    public_log: Optional[List[dict]] = None
    error_message: Optional[str] = None


class GenerationsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    project_id: int
    request_text: str
    status: str
    current_stage: str
    product_spec: Optional[dict] = None
    public_log: List[dict]
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GenerationsListResponse(BaseModel):
    """List response schema"""
    items: List[GenerationsResponse]
    total: int
    skip: int
    limit: int


class GenerationsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[GenerationsData]


class GenerationsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: GenerationsUpdateData


class GenerationsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[GenerationsBatchUpdateItem]


class GenerationsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=GenerationsListResponse)
async def query_generationss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query generationss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying generationss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = GenerationsService(db)
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
        logger.debug(f"Found {result['total']} generationss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid generations query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying generationss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=GenerationsResponse)
async def get_generations(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single generations by ID (user can only see their own records)"""
    logger.debug(f"Fetching generations with id: {id}, fields={fields}")
    
    service = GenerationsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Generations with id {id} not found")
            raise HTTPException(status_code=404, detail="Generations not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching generations {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=GenerationsResponse, status_code=201)
async def create_generations(
    data: GenerationsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new generations"""
    logger.debug(f"Creating new generations with data: {data}")
    
    service = GenerationsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create generations")
        
        logger.info(f"Generations created successfully with id: {result.id}")
        return result
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as e:
        logger.error(f"Validation error creating generations: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating generations: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[GenerationsResponse], status_code=201)
async def create_generationss_batch(
    request: GenerationsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple generationss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} generationss")
    
    service = GenerationsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id), commit=False)
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} generationss successfully")
        await db.commit()
        return results
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[GenerationsResponse])
async def update_generationss_batch(
    request: GenerationsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple generationss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} generationss")
    
    service = GenerationsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id), commit=False)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} generationss successfully")
        await db.commit()
        return results
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=GenerationsResponse)
async def update_generations(
    id: int,
    data: GenerationsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing generations (requires ownership)"""
    logger.debug(f"Updating generations {id} with data: {data}")

    service = GenerationsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Generations with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Generations not found")
        
        logger.info(f"Generations {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating generations {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating generations {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_generationss_batch(
    request: GenerationsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple generationss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} generationss")
    
    service = GenerationsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id), commit=False)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} generationss successfully")
        await db.commit()
        return {"message": f"Successfully deleted {deleted_count} generationss", "deleted_count": deleted_count}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_generations(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single generations by ID (requires ownership)"""
    logger.debug(f"Deleting generations with id: {id}")
    
    service = GenerationsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Generations with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Generations not found")
        
        logger.info(f"Generations {id} deleted successfully")
        return {"message": "Generations deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting generations {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
