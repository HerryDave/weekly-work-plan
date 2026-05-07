from typing import Annotated
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.alert import Alert, AlertStatus
from app.models.project import Project, ProjectMember
from app.schemas.alert import AlertResponse, AlertResolveResponse
from app.dependencies import get_current_user

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertResponse])
async def get_alerts(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[str | None, Query] = None,
    alert_level: Annotated[str | None, Query] = None,
):
    """获取预警列表。室经理看全部，组长看本组相关预警。"""
    query = select(Alert)

    if status_filter:
        query = query.where(Alert.status == status_filter)
    else:
        query = query.where(Alert.status == AlertStatus.active)

    if alert_level:
        query = query.where(Alert.alert_level == alert_level)

    if current_user.role == UserRole.manager:
        pass  # 看全部
    elif current_user.role == UserRole.leader:
        # 获取本组成员的 user_ids
        users_result = await db.execute(
            select(User.id).where(User.group_id == current_user.group_id, User.is_active == True)
        )
        group_user_ids = [u for u in users_result.scalars().all()]

        # 获取本组成员参与的项目 ids
        proj_result = await db.execute(
            select(Project.id).join(ProjectMember).where(ProjectMember.user_id.in_(group_user_ids))
        )
        project_ids = list(set([p for p in proj_result.scalars().all()]))

        query = query.where(
            (Alert.related_entity_type == "user") & (Alert.related_entity_id.in_([str(uid) for uid in group_user_ids])) |
            (Alert.related_entity_type == "project") & (Alert.related_entity_id.in_([str(p) for p in project_ids]))
        )
    else:
        query = query.where(Alert.related_entity_id == str(current_user.id))

    query = query.order_by(Alert.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.put("/{alert_id}/resolve", response_model=AlertResolveResponse)
async def resolve_alert(
    alert_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="预警不存在")

    alert.status = AlertStatus.resolved
    alert.resolved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(alert)

    return AlertResolveResponse(status=alert.status, resolved_at=alert.resolved_at)


@router.post("/batch-resolve", status_code=status.HTTP_200_OK)
async def batch_resolve_alerts(
    alert_ids: list[int],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """批量处理预警。"""
    if current_user.role != UserRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有室经理可以批量处理预警")

    for alert_id in alert_ids:
        result = await db.execute(select(Alert).where(Alert.id == alert_id))
        alert = result.scalar_one_or_none()
        if alert:
            alert.status = AlertStatus.resolved
            alert.resolved_at = datetime.utcnow()

    await db.commit()
    return {"resolved": len(alert_ids)}
