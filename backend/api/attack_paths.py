"""
Attack Path API endpoints
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import AttackPath, Assessment
from schemas.attack_path import AttackPathCreate, AttackPathUpdate, AttackPathResponse
from websocket.manager import manager
from websocket.events import event_attack_path_added, event_attack_path_updated, event_attack_path_deleted
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/assessments/{assessment_id}/attack-paths", tags=["attack-paths"])


@router.get("", response_model=List[AttackPathResponse])
async def list_attack_paths(
    assessment_id: int,
    status_filter: str = None,
    db: Session = Depends(get_db)
):
    """Get all attack paths for an assessment"""
    # Verify assessment exists
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment with id {assessment_id} not found"
        )

    query = db.query(AttackPath).filter(AttackPath.assessment_id == assessment_id)

    # Filter by status if provided
    if status_filter:
        query = query.filter(AttackPath.status == status_filter)

    attack_paths = query.order_by(AttackPath.created_at).all()
    return attack_paths


@router.post("", response_model=AttackPathResponse, status_code=status.HTTP_201_CREATED)
async def create_attack_path(
    assessment_id: int,
    attack_path: AttackPathCreate,
    db: Session = Depends(get_db)
):
    """Create a new attack path"""
    # Verify assessment exists
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment with id {assessment_id} not found"
        )

    # Create attack path
    db_attack_path = AttackPath(
        assessment_id=assessment_id,
        source_type=attack_path.source_type,
        source_id=attack_path.source_id,
        target_type=attack_path.target_type,
        target_id=attack_path.target_id,
        vector_type=attack_path.vector_type,
        confidence=attack_path.confidence,
        status=attack_path.status,
        reasoning=attack_path.reasoning,
        extra_data=attack_path.extra_data,
        created_by=attack_path.created_by or 'user'
    )

    db.add(db_attack_path)
    db.commit()
    db.refresh(db_attack_path)

    # Broadcast WebSocket event
    await manager.broadcast(
        event_attack_path_added(assessment_id, db_attack_path),
        assessment_id=assessment_id
    )
    logger.info("Attack path created", attack_path_id=db_attack_path.id, assessment_id=assessment_id)

    return db_attack_path


@router.patch("/{path_id}", response_model=AttackPathResponse)
async def update_attack_path(
    assessment_id: int,
    path_id: int,
    attack_path_update: AttackPathUpdate,
    db: Session = Depends(get_db)
):
    """Update an attack path"""
    attack_path = db.query(AttackPath).filter(
        AttackPath.id == path_id,
        AttackPath.assessment_id == assessment_id
    ).first()

    if not attack_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attack path with id {path_id} not found"
        )

    # Update fields
    update_data = attack_path_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(attack_path, field, value)

    db.commit()
    db.refresh(attack_path)

    # Broadcast WebSocket event
    await manager.broadcast(
        event_attack_path_updated(assessment_id, attack_path),
        assessment_id=assessment_id
    )
    logger.info("Attack path updated", attack_path_id=path_id, assessment_id=assessment_id)

    return attack_path


@router.delete("/{path_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attack_path(
    assessment_id: int,
    path_id: int,
    db: Session = Depends(get_db)
):
    """Delete an attack path"""
    attack_path = db.query(AttackPath).filter(
        AttackPath.id == path_id,
        AttackPath.assessment_id == assessment_id
    ).first()

    if not attack_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attack path with id {path_id} not found"
        )

    db.delete(attack_path)
    db.commit()

    # Broadcast WebSocket event
    await manager.broadcast(
        event_attack_path_deleted(assessment_id, path_id),
        assessment_id=assessment_id
    )
    logger.info("Attack path deleted", attack_path_id=path_id, assessment_id=assessment_id)

    return None
