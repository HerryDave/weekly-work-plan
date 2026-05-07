from __future__ import annotations
from typing import Annotated
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.plan import WeeklyPlan
from app.models.project import Project, ProjectMember
from app.schemas.plan import WeeklyPlanBatchRequest, WeeklyPlanResponse
from app.dependencies import get_current_user
from app.utils.alert_engine import trigger_alerts_on_plan_change
from app.models.operation_log import OperationLog
import json

router = APIRouter(prefix="/plans", tags=["plans"])


def _build_plan_response(plan: WeeklyPlan, user: User = None, project=None) -> dict:
    if user is None:
        user = plan.user
    if project is None:
        project = plan.project

    group_name = None
    if user and user.group_id:
        g = user.group
        group_name = f"{g.room}{g.name}" if g and g.room else (g.name if g else None)

    return {
        "id": plan.id,
        "user_id": plan.user_id,
        "project_id": plan.project_id,
        "week_start_date": plan.week_start_date,
        "planned_man_days": plan.planned_man_days,
        "team_id": plan.team_id,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "username": user.username if user else None,
        "user_real_name": user.real_name if user else None,
        "group_name": group_name,
        "project_name": project.name if project else None,
    }


@router.get("", response_model=list[WeeklyPlanResponse])
async def get_plans(
    week_start_date: Annotated[date | None, Query] = None,
    user_id: Annotated[int | None, Query] = None,
    project_id: Annotated[int | None, Query] = None,
    group_id: Annotated[int | None, Query] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    query = (
        select(WeeklyPlan)
        .options(
            joinedload(WeeklyPlan.user).joinedload(User.group),
            joinedload(WeeklyPlan.project),
        )
    )

    if week_start_date:
        query = query.where(WeeklyPlan.week_start_date == week_start_date)
    if user_id:
        query = query.where(WeeklyPlan.user_id == user_id)
    if project_id:
        query = query.where(WeeklyPlan.project_id == project_id)
    if group_id:
        if current_user.role == UserRole.manager:
            query = query.join(User).where(User.group_id == group_id)
        elif current_user.role == UserRole.leader:
            if current_user.group_id != group_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看此组")
            query = query.join(User).where(User.group_id == group_id)
        else:
            query = query.where(WeeklyPlan.user_id == current_user.id)
    elif current_user.role == UserRole.leader:
        query = query.join(User).where(User.group_id == current_user.group_id)
    elif current_user.role == UserRole.employee:
        query = query.where(WeeklyPlan.user_id == current_user.id)

    query = query.order_by(WeeklyPlan.week_start_date.desc(), WeeklyPlan.id.desc())
    result = await db.execute(query)
    plans = result.scalars().unique().all()

    return [_build_plan_response(p) for p in plans]


@router.post("/batch", response_model=list[WeeklyPlanResponse], status_code=status.HTTP_200_OK)
async def batch_update_plans(
    batch_data: WeeklyPlanBatchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """批量创建/更新周计划。"""
    if current_user.role == UserRole.employee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权填写周计划")

    if len(batch_data.plans) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="单次批量不能超过100条")

    results = []
    for plan_data in batch_data.plans:
        if current_user.role == UserRole.leader:
            user_result = await db.execute(select(User).where(User.id == plan_data.user_id))
            target_user = user_result.scalar_one_or_none()
            if not target_user or target_user.group_id != current_user.group_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"无法填写用户 {plan_data.user_id} 的周计划 — 不在您的小组内"
                )

        # 确定 team_id（从用户所在组继承）
        if plan_data.user_id:
            user_result = await db.execute(select(User).where(User.id == plan_data.user_id))
            target_user = user_result.scalar_one_or_none()
            team_id = target_user.group_id if target_user else None
        else:
            team_id = None

        if plan_data.id is not None:
            # 按 id 精确更新
            result = await db.execute(select(WeeklyPlan).where(WeeklyPlan.id == plan_data.id))
            plan = result.scalar_one_or_none()
            if not plan:
                raise HTTPException(status_code=404, detail=f"计划 {plan_data.id} 不存在")
            before = {"planned_man_days": plan.planned_man_days}
            plan.planned_man_days = plan_data.planned_man_days
            # team_id 保持不变
            after = {"planned_man_days": plan_data.planned_man_days}
            action = "plan_update"
        else:
            existing = await db.execute(
                select(WeeklyPlan).where(
                    and_(
                        WeeklyPlan.user_id == plan_data.user_id,
                        WeeklyPlan.project_id == plan_data.project_id,
                        WeeklyPlan.week_start_date == plan_data.week_start_date
                    )
                )
            )
            plan = existing.scalar_one_or_none()

            if plan:
                before = {"planned_man_days": plan.planned_man_days}
                plan.planned_man_days = plan_data.planned_man_days
                plan.team_id = team_id
                after = {"planned_man_days": plan_data.planned_man_days}
                action = "plan_update"
            else:
                before = None
                plan = WeeklyPlan(
                    user_id=plan_data.user_id,
                    project_id=plan_data.project_id,
                    week_start_date=plan_data.week_start_date,
                    planned_man_days=plan_data.planned_man_days,
                    team_id=team_id,
                )
                db.add(plan)
                after = {"planned_man_days": plan_data.planned_man_days}
                action = "plan_create"

        results.append((plan, before, after, action))

    await db.flush()  # 先flush，plan.id已写入但不expire对象

    # 触发预警检查（W01 + W02）并记录操作日志
    for plan_data, (plan, before, after, action) in zip(batch_data.plans, results):
        await trigger_alerts_on_plan_change(db, plan_data.user_id, plan_data.project_id, plan_data.week_start_date)
        db.add(OperationLog(
            operator_id=current_user.id,
            action=action,
            entity_type="weekly_plan",
            entity_id=plan.id,
            detail=json.dumps({"before": before, "after": after}, ensure_ascii=False),
        ))
    await db.commit()

    plan_ids = [p[0].id for p in results]
    refreshed = await db.execute(
        select(WeeklyPlan)
        .options(
            joinedload(WeeklyPlan.user).joinedload(User.group),
            joinedload(WeeklyPlan.project),
        )
        .where(WeeklyPlan.id.in_(plan_ids))
    )
    refreshed_plans = refreshed.scalars().unique().all()
    plan_map = {p.id: p for p in refreshed_plans}

    return [_build_plan_response(plan_map[p[0].id]) for p in results]
