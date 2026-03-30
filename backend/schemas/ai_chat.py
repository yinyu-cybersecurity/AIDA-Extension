"""
AI chat history schemas
"""
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


class AIHistoryMessageResponse(BaseModel):
    id: int
    assessment_id: int
    sequence_number: int
    role: str
    event_type: str
    content: Optional[str] = None
    message_payload: Optional[dict[str, Any]] = None
    tool_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
