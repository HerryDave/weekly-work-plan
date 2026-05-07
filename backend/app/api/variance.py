"""
差异对比 API：项目维度的计划工时 vs 实际投入对比。
"""
from __future__ import annotations
from typing import Annotated
from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.plan import WeeklyPlan
from app.models.effort import ActualEffort
from app.dependencies import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/{project_id}/variance")
async def get_project_variance(
    project_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    获取项目的计划工时 vs 实际投入对比。

    返回：
    - weekly: 按周对比的计划/实际/偏差
    - summary: 汇总数据
    - by_user: 按人员分别的投入明细
    """
    # 检查项目是否存在
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        return {"error": "项目不存在"}

    # 获取该项目所有计划工时（按周汇总）
    weekly_plans = await db.execute(
        select(
            WeeklyPlan.week_start_date,
            func.sum(WeeklyPlan.planned_man_days).label("planned")
        )
        .where(WeeklyPlan.project_id == project_id)
        .group_by(WeeklyPlan.week_start_date)
        .order_by(WeeklyPlan.week_start_date)
    )
    plan_by_week = {row.week_start_date: row.planned for row in weekly_plans.fetchall()}

    # 获取该项目所有实际投入（直接按 week_start_date 汇总）
    weekly_actuals = await db.execute(
        select(
            ActualEffort.week_start_date,
            func.sum(ActualEffort.actual_man_days).label("actual")
        )
        .where(ActualEffort.project_id == project_id)
        .group_by(ActualEffort.week_start_date)
        .order_by(ActualEffort.week_start_date)
    )

    # 按周汇总实际投入
    actual_by_week = {}
    for row in weekly_actuals.fetchall():
        actual_by_week[row.week_start_date] = row.actual

    # 合并所有周
    all_weeks = sorted(set(list(plan_by_week.keys()) + list(actual_by_week.keys())))

    weekly_data = []
    total_planned = 0.0
    total_actual = 0.0

    for week in all_weeks:
        planned = plan_by_week.get(week, 0.0)
        actual = actual_by_week.get(week, 0.0)
        variance = actual - planned
        variance_pct = round((variance / planned * 100), 1) if planned > 0 else None

        weekly_data.append({
            "week_start": week.isoformat(),
            "week_label": f"W{week.isocalendar()[1]}",
            "planned": planned,
            "actual": actual,
            "variance": round(variance, 1),
            "variance_pct": variance_pct,
            "status": "over" if variance > 0 else ("under" if variance < 0 else "on_track"),
        })
        total_planned += planned
        total_actual += actual

    total_variance = total_actual - total_planned
    total_variance_pct = round((total_variance / total_planned * 100), 1) if total_planned > 0 else None

    return {
        "project_id": project_id,
        "project_name": project.name,
        "weekly": weekly_data,
        "summary": {
            "total_planned": round(total_planned, 1),
            "total_actual": round(total_actual, 1),
            "total_variance": round(total_variance, 1),
            "total_variance_pct": total_variance_pct,
        }
    }
