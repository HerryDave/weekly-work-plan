"""
操作日志 — 记录关键操作，实现数据可追溯性。

按需求规格，以下操作需要记录：
- 周计划修改
- 实际投入录入
- 成员变动（已在 notifications 中处理，此处记录结构化日志）
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # 操作人
    operator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    # 操作类型
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # plan_create / plan_update / effort_create / effort_update / member_add / member_remove

    # 操作对象
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # weekly_plan / actual_effort / project_member
    entity_id: Mapped[int] = mapped_column(nullable=False)

    # 变更摘要（JSON字符串，方便查询）
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)  # {"before": {...}, "after": {...}}

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    operator = relationship("User", backref="operation_logs")


# ============ 便捷辅助函数 ============
import json


def log_detail(
    action: str,
    entity_type: str,
    entity_id: int,
    operator_id: int,
    before: dict | None = None,
    after: dict | None = None,
) -> OperationLog:
    """快速构造 OperationLog，detail 为 JSON 字符串。"""
    detail = None
    if before is not None or after is not None:
        detail = json.dumps({"before": before, "after": after}, ensure_ascii=False)
    return OperationLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        operator_id=operator_id,
        detail=detail,
    )
