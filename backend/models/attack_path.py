"""
Attack Path SQLAlchemy model
用于存储攻击路径关系
"""
from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Float, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


class AttackPath(Base):
    __tablename__ = "attack_paths"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True)

    # 攻击路径的源和目标（可以是recon_data或assessment本身）
    source_type = Column(String(50), nullable=False)  # 'recon_asset', 'assessment', 'finding'
    source_id = Column(String(100), nullable=False)  # 源节点ID（可能是recon_data.id或其他）

    target_type = Column(String(50), nullable=False)  # 'recon_asset', 'assessment', 'finding'
    target_id = Column(String(100), nullable=False)  # 目标节点ID

    # 攻击向量类型
    vector_type = Column(String(100), nullable=False)  # credential_reuse, lateral_movement, privilege_escalation等

    # 置信度和状态
    confidence = Column(Float, default=1.0)  # 0.0-1.0，规则引擎生成的路径可能<1.0
    status = Column(String(50), default='manual')  # manual, suggested, confirmed, rejected

    # 额外信息
    reasoning = Column(Text)  # AI或规则引擎的推理说明
    extra_data = Column(JSONB)  # 额外的元数据（如相关finding_id等）- 避免使用metadata关键字

    # 审计字段
    created_by = Column(String(100))  # 'user', 'rule_engine', 'ai_agent'
    confirmed_by = Column(String(100))  # 确认者
    confirmed_at = Column(TIMESTAMP)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationship
    assessment = relationship("Assessment", back_populates="attack_paths")
