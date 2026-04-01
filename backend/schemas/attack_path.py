"""
Attack Path Pydantic schemas
"""
from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class AttackPathBase(BaseModel):
    source_type: str = Field(..., description="Source node type: recon_asset, assessment, finding")
    source_id: str = Field(..., description="Source node ID")
    target_type: str = Field(..., description="Target node type: recon_asset, assessment, finding")
    target_id: str = Field(..., description="Target node ID")
    vector_type: str = Field(..., description="Attack vector: credential_reuse, lateral_movement, privilege_escalation, etc.")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence score 0.0-1.0")
    status: str = Field(default="manual", description="Status: manual, suggested, confirmed, rejected")
    reasoning: Optional[str] = Field(None, description="Reasoning or explanation for this path")
    extra_data: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    created_by: Optional[str] = Field(None, description="Creator: user, rule_engine, ai_agent")


class AttackPathCreate(AttackPathBase):
    pass


class AttackPathUpdate(BaseModel):
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    vector_type: Optional[str] = None
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    status: Optional[str] = None
    reasoning: Optional[str] = None
    extra_data: Optional[Dict[str, Any]] = None
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None


class AttackPathResponse(AttackPathBase):
    id: int
    assessment_id: int
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
