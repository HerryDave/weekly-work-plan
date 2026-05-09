"""
差异对比 API：项目维度的计划工时 vs 实际投入对比（按 ISO 周聚合）。
"""
from __future__ import annotations
from typing import Annotated
from datetime import date
from collections import defaultdict
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


def get_iso_year_week(d: date):
    """返回 (iso_year, iso_week) 元组，用于正确排序"""
    iso = d.isocalendar()
    return (iso[0], iso[1])


@router.get("/{project_id}/variance")
async def get_project_variance(
    project_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    获取项目的计划工时 vs 实际投入对比。

    返回：
    - weekly: 按 ISO 周对比的计划/实际/偏差（同一 ISO 周内的所有记录聚合）
    - summary: 汇总数据
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

    # 获取该项目所有实际投入（按周汇总）
    weekly_actuals = await db.execute(
        select(
            ActualEffort.week_start_date,
            func.sum(ActualEffort.actual_man_days).label("actual")
        )
        .where(ActualEffort.project_id == project_id)
        .group_by(ActualEffort.week_start_date)
        .order_by(ActualEffort.week_start_date)
    )

    # 按 ISO 周聚合
    plan_by_iso = defaultdict(float)
    actual_by_iso = defaultdict(float)

    for row in weekly_plans.fetchall():
        d = row.week_start_date
        iso = d.isocalendar()
        key = (iso[0], iso[1])  # (year, week_number)
        plan_by_iso[key] += row.planned

    for row in weekly_actuals.fetchall():
        d = row.week_start_date
        iso = d.isocalendar()
        key = (iso[0], iso[1])
        actual_by_iso[key] += row.actual

    # 合并所有 ISO 周
    all_keys = sorted(set(list(plan_by_iso.keys()) + list(actual_by_iso.keys())))

    weekly_data = []
    total_planned = 0.0
    total_actual = 0.0

    for key in all_keys:
        iso_year, iso_week = key
        planned = plan_by_iso.get(key, 0.0)
        actual = actual_by_iso.get(key, 0.0)
        variance = round(actual - planned, 1)
        variance_pct = round((variance / planned * 100), 1) if planned > 0 else None

        weekly_data.append({
            "week_start": f"{iso_year}-W{iso_week:02d}",
            "week_label": f"W{iso_week}",
            "planned": planned,
            "actual": actual,
            "variance": variance,
            "variance_pct": variance_pct,
            "status": "over" if variance > 0 else ("under" if variance < 0 else "on_track"),
        })
        total_planned += planned
        total_actual += actual

    total_variance = round(total_actual - total_planned, 1)
    total_variance_pct = round((total_variance / total_planned * 100), 1) if total_planned > 0 else None

    return {
        "project_id": project_id,
        "project_name": project.name,
        "weekly": weekly_data,
        "summary": {
            "total_planned": round(total_planned, 1),
            "total_actual": round(total_actual, 1),
            "total_variance": total_variance,
            "total_variance_pct": total_variance_pct,
        }
    }
