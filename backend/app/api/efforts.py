from __future__ import annotations
from typing import Annotated
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.group import Group
from app.models.effort import ActualEffort
from app.models.plan import WeeklyPlan
from app.schemas.effort import ActualEffortBatchRequest, ActualEffortResponse, ActualEffortCreate
from app.dependencies import get_current_user
from app.utils.alert_engine import trigger_alerts_on_effort_change

router = APIRouter(prefix="/efforts", tags=["efforts"])


def _build_effort_response(effort: ActualEffort, user: User = None, project=None, creator=None) -> dict:
    """Build effort response with joined user/project/group info."""
    if user is None:
        user = effort.user
    if project is None:
        project = effort.project
    if creator is None:
        creator = effort.creator

    group_name = None
    if user and user.group_id:
        group_name = user.group.name if user.group else None
        if group_name:
            room = user.group.room
            group_name = (room + group_name) if room else group_name

    week_label = f"W{effort.week_start_date.isocalendar()[1]}/{effort.week_start_date.month:02d}-{effort.week_start_date.day:02d}"

    return {
        "id": effort.id,
        "user_id": effort.user_id,
        "project_id": effort.project_id,
        "week_start_date": effort.week_start_date,
        "actual_man_days": effort.actual_man_days,
        "team_id": effort.team_id,
        "created_by": effort.created_by,
        "created_at": effort.created_at,
        "updated_at": effort.updated_at,
        "username": user.username if user else None,
        "user_real_name": user.real_name if user else None,
        "role": user.role.value if user and hasattr(user.role, 'value') else str(user.role) if user else None,
        "group_name": group_name,
        "project_name": project.name if project else None,
        "created_by_real_name": creator.real_name if creator else None,
        "week_label": week_label,
    }


@router.get("", response_model=list[ActualEffortResponse])
async def get_efforts(
    week_start_date: Annotated[date | None, Query] = None,
    group_id: Annotated[int | None, Query] = None,
    user_id: Annotated[int | None, Query] = None,
    project_id: Annotated[int | None, Query] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    query = (
        select(ActualEffort)
        .options(
            joinedload(ActualEffort.user).joinedload(User.group),
            joinedload(ActualEffort.project),
            joinedload(ActualEffort.creator),
        )
    )

    if week_start_date:
        query = query.where(ActualEffort.week_start_date == week_start_date)

    if user_id:
        query = query.where(ActualEffort.user_id == user_id)
    elif group_id and current_user.role == UserRole.leader:
        query = query.join(User).where(User.group_id == current_user.group_id)
    elif group_id and current_user.role == UserRole.manager:
        query = query.join(User).where(User.group_id == group_id)

    if project_id:
        query = query.where(ActualEffort.project_id == project_id)

    result = await db.execute(query)
    efforts = result.scalars().unique().all()

    return [_build_effort_response(e) for e in efforts]


@router.put("/{effort_id}", response_model=ActualEffortResponse)
async def update_effort(
    effort_id: int,
    effort_data: ActualEffortCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    if current_user.role == UserRole.employee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权更新投入记录")

    result = await db.execute(select(ActualEffort).where(ActualEffort.id == effort_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="记录不存在")

    if current_user.role == UserRole.leader:
        if record.user_id:
            user_result = await db.execute(select(User).where(User.id == record.user_id))
            target_user = user_result.scalar_one_or_none()
            if not target_user or target_user.group_id != current_user.group_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权更新此记录")

    record.user_id = effort_data.user_id
    record.project_id = effort_data.project_id
    record.week_start_date = effort_data.week_start_date
    record.actual_man_days = effort_data.actual_man_days
    record.team_id = effort_data.team_id
    record.created_by = current_user.id
    await db.commit()
    await db.refresh(record)

    refreshed = await db.execute(
        select(ActualEffort)
        .options(
            joinedload(ActualEffort.user).joinedload(User.group),
            joinedload(ActualEffort.project),
            joinedload(ActualEffort.creator),
        )
        .where(ActualEffort.id == record.id)
    )
    e = refreshed.scalars().unique().one()
    return _build_effort_response(e)


@router.delete("/{effort_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_effort(
    effort_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    if current_user.role == UserRole.employee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除投入记录")

    result = await db.execute(select(ActualEffort).where(ActualEffort.id == effort_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="记录不存在")

    if current_user.role == UserRole.leader:
        if record.user_id:
            user_result = await db.execute(select(User).where(User.id == record.user_id))
            target_user = user_result.scalar_one_or_none()
            if not target_user or target_user.group_id != current_user.group_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除此记录")

    await db.delete(record)
    await db.commit()
    return None


@router.post("/batch", response_model=list[ActualEffortResponse], status_code=status.HTTP_200_OK)
async def batch_update_efforts(
    batch_data: ActualEffortBatchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """批量创建/更新人员投入记录。"""
    if current_user.role == UserRole.employee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权录入投入记录")

    # 限制批量大小
    if len(batch_data.efforts) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="单次批量不能超过100条")

    results = []
    for effort_data in batch_data.efforts:
        if current_user.role == UserRole.leader:
            user_result = await db.execute(select(User).where(User.id == effort_data.user_id))
            target_user = user_result.scalar_one_or_none()
            if not target_user or target_user.group_id != current_user.group_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"无法录入用户 {effort_data.user_id} 的投入 — 不在您的小组内"
                )

        existing = await db.execute(
            select(ActualEffort).where(
                and_(
                    ActualEffort.user_id == effort_data.user_id,
                    ActualEffort.project_id == effort_data.project_id,
                    ActualEffort.week_start_date == effort_data.week_start_date
                )
            )
        )
        record = existing.scalar_one_or_none()
        if record:
            before = {"actual_man_days": record.actual_man_days}
            record.actual_man_days = effort_data.actual_man_days
            record.team_id = effort_data.team_id
            record.created_by = current_user.id
            after = {"actual_man_days": effort_data.actual_man_days}
            action = "effort_update"
        else:
            before = None
            record = ActualEffort(
                user_id=effort_data.user_id,
                project_id=effort_data.project_id,
                week_start_date=effort_data.week_start_date,
                actual_man_days=effort_data.actual_man_days,
                team_id=effort_data.team_id,
                created_by=current_user.id,
            )
            db.add(record)
            after = {"actual_man_days": effort_data.actual_man_days}
            action = "effort_create"
        results.append((record, before, after, action))

    await db.commit()

    # 触发预警检查（W01 + W04）
    for effort_data, (record, before, after, action) in zip(batch_data.efforts, results):
        await trigger_alerts_on_effort_change(
            db, effort_data.user_id, effort_data.project_id, effort_data.week_start_date
        )
    await db.commit()

    effort_ids = [r[0].id for r in results]
    refreshed = await db.execute(
        select(ActualEffort)
        .options(
            joinedload(ActualEffort.user).joinedload(User.group),
            joinedload(ActualEffort.project),
            joinedload(ActualEffort.creator),
        )
        .where(ActualEffort.id.in_(effort_ids))
    )
    refreshed_efforts = refreshed.scalars().unique().all()
    eff_map = {e.id: e for e in refreshed_efforts}

    return [_build_effort_response(eff_map[r[0].id]) for r in results]
