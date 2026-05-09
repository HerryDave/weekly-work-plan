from __future__ import annotations
from typing import Annotated
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.operation_log import OperationLog
from app.dependencies import get_current_user

router = APIRouter(prefix="/operations", tags=["operations"])


class OperationLogResponse:
    def __init__(self, log: OperationLog, operator_name: str = None):
        self.id = log.id
        self.operator_id = log.operator_id
        self.operator_name = operator_name
        self.action = log.action
        self.entity_type = log.entity_type
        self.entity_id = log.entity_id
        self.detail = log.detail
        self.created_at = log.created_at


@router.get("/logs")
async def get_operation_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query] = 50,
    offset: Annotated[int, Query] = 0,
    action: Annotated[str | None, Query] = None,
    entity_type: Annotated[str | None, Query] = None,
):
    """查询操作日志（仅室经理可查）。"""
    if current_user.role != UserRole.manager:
        return []

    query = select(OperationLog).order_by(desc(OperationLog.created_at))

    if action:
        query = query.where(OperationLog.action == action)
    if entity_type:
        query = query.where(OperationLog.entity_type == entity_type)

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    logs = result.scalars().all()

    # Fetch operator names
    user_ids = list(set(log.operator_id for log in logs))
    users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {u.id: u for u in users_result.scalars().all()}

    return [
        {
            "id": log.id,
            "operator_id": log.operator_id,
            "operator_name": users.get(log.operator_id, None).__dict__.get("real_name", None) if users.get(log.operator_id) else None,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "detail": log.detail,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
