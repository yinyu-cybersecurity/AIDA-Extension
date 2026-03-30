"""
Assessment AI transcript persistence model
"""
from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


class AssessmentAIMessage(Base):
    __tablename__ = "assessment_ai_messages"
    __table_args__ = (
        UniqueConstraint("assessment_id", "sequence_number", name="uq_assessment_ai_messages_sequence"),
    )

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence_number = Column(Integer, nullable=False)
    role = Column(String(20), nullable=False)  # user, assistant, tool
    event_type = Column(String(50), nullable=False)
    content = Column(Text)
    message_payload = Column(JSONB)
    tool_name = Column(String(255))
    created_at = Column(TIMESTAMP, server_default=func.now())

    assessment = relationship("Assessment", back_populates="ai_messages")
