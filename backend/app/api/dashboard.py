"""
仪表盘 API：整合项目健康度、预警、偏差数据的综合视图。
"""
from __future__ import annotations
from typing import Annotated
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.project import Project, ProjectMember
from app.models.manpower import ManpowerRegistration
from app.models.plan import WeeklyPlan
from app.models.effort import ActualEffort
from app.models.alert import Alert, AlertStatus
from app.dependencies import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_dashboard_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    仪表盘汇总数据：
    1. 项目总览：重点项目 / 流量项目 / 进行中 / 已完成
    2. 预警统计：按级别分组
    3. 本周计划 vs 实际：总览
    4. 进行中项目列表（带进度%）
    """
    # === 项目统计 ===
    total_result = await db.execute(select(func.count(Project.id)))
    total_projects = total_result.scalar() or 0

    internal_result = await db.execute(
        select(func.count(Project.id)).where(Project.type == "internal")
    )
    internal_count = internal_result.scalar() or 0

    cross_result = await db.execute(
        select(func.count(Project.id)).where(Project.type == "cross")
    )
    cross_count = cross_result.scalar() or 0

    # === 预警统计 ===
    active_alerts_result = await db.execute(
        select(
            Alert.alert_level,
            func.count(Alert.id).label("count")
        )
        .where(Alert.status == AlertStatus.active)
        .group_by(Alert.alert_level)
    )
    alert_stats = {}
    for row in active_alerts_result.fetchall():
        alert_stats[row.alert_level] = row.count

    total_alerts = sum(alert_stats.values())

    # === 本周数据 ===
    today = datetime.now().date()
    week_start = today - timedelta(days=today.weekday())

    # 本周计划工时
    weekly_plan_result = await db.execute(
        select(func.coalesce(func.sum(WeeklyPlan.planned_man_days), 0.0))
        .where(WeeklyPlan.week_start_date == week_start)
    )
    weekly_planned = weekly_plan_result.scalar() or 0.0

    # 本周实际投入
    weekly_actual_result = await db.execute(
        select(func.coalesce(func.sum(ActualEffort.actual_man_days), 0.0))
        .where(ActualEffort.week_start_date == week_start)
    )
    weekly_actual = weekly_actual_result.scalar() or 0.0

    return {
        "projects": {
            "total": total_projects,
            "internal": internal_count,
            "cross": cross_count,
        },
        "alerts": {
            "total": total_alerts,
            "by_level": alert_stats,
        },
        "this_week": {
            "planned": weekly_planned,
            "actual": weekly_actual,
            "variance": round(weekly_actual - weekly_planned, 1),
        }
    }


@router.get("/projects/health")
async def get_projects_health(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    获取所有项目的健康度列表（适用于室经理/组长视角）。

    每个项目返回：
    - basic info: id, name, type
    - target_man_days: 目标人天（已批准报备汇总）
    - actual_man_days: 实际投入
    - progress: {st, uat} 进度百分比
    - health_status: green / yellow / red
    """
    # 查询所有项目
    projects_result = await db.execute(select(Project))
    projects = projects_result.scalars().all()

    health_list = []
    for project in projects:
        # 目标人天（已批准的报备汇总）
        target_result = await db.execute(
            select(func.coalesce(func.sum(ManpowerRegistration.registered_man_days), 0.0))
            .where(
                ManpowerRegistration.project_id == project.id,
                ManpowerRegistration.status == "approved"
            )
        )
        target_man_days = target_result.scalar() or 0.0

        # 实际投入
        actual_result = await db.execute(
            select(func.coalesce(func.sum(ActualEffort.actual_man_days), 0.0))
            .where(ActualEffort.project_id == project.id)
        )
        actual_man_days = actual_result.scalar() or 0.0

        # 计算健康度
        health_status = "green"
        if target_man_days > 0:
            ratio = actual_man_days / target_man_days
            if ratio >= 1.0:
                health_status = "red"
            elif ratio >= 0.8:
                health_status = "yellow"

        health_list.append({
            "id": project.id,
            "name": project.name,
            "type": project.type,
            "target_man_days": round(target_man_days, 1),
            "actual_man_days": round(actual_man_days, 1),
            "progress": {
                "st": project.st_progress or 0,
                "uat": project.uat_progress or 0,
            },
            "health_status": health_status,
        })

    return health_list


@router.get("/projects/{project_id}/detail")
async def get_project_dashboard_detail(
    project_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """获取单个项目的详细仪表盘数据（差异分析）。"""
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        return {"error": "项目不存在"}

    # 目标人天
    target_result = await db.execute(
        select(func.coalesce(func.sum(ManpowerRegistration.registered_man_days), 0.0))
        .where(
            ManpowerRegistration.project_id == project_id,
            ManpowerRegistration.status == "approved"
        )
    )
    target_man_days = target_result.scalar() or 0.0

    # 实际投入
    actual_result = await db.execute(
        select(func.coalesce(func.sum(ActualEffort.actual_man_days), 0.0))
        .where(ActualEffort.project_id == project_id)
    )
    actual_man_days = actual_result.scalar() or 0.0

    # 按人员汇总投入
    user_efforts_result = await db.execute(
        select(
            ActualEffort.user_id,
            User.name,
            func.sum(ActualEffort.actual_man_days).label("total")
        )
        .join(User, User.id == ActualEffort.user_id)
        .where(ActualEffort.project_id == project_id)
        .group_by(ActualEffort.user_id, User.name)
    )
    by_user = [
        {"user_id": row.user_id, "name": row.name, "total": round(row.total, 1)}
        for row in user_efforts_result.fetchall()
    ]

    return {
        "id": project.id,
        "name": project.name,
        "type": project.type,
        "progress": {
            "st": project.st_progress or 0,
            "uat": project.uat_progress or 0,
        },
        "target_man_days": round(target_man_days, 1),
        "actual_man_days": round(actual_man_days, 1),
        "remaining_man_days": round(target_man_days - actual_man_days, 1),
        "by_user": by_user,
    }


# ============ 人力总览表（各组每周计划/实际总和）============
from app.models.group import Group
from pydantic import BaseModel


class GroupWeeklyOverviewItem(BaseModel):
    group_id: int
    group_name: str
    week_start: str
    week_label: str
    planned: float
    actual: float
    variance: float
    variance_pct: float | None


class GroupManpowerOverviewResponse(BaseModel):
    weeks: list[str]           # 所有涉及的周（降序）
    groups: list[dict]         # 每个组的人力数据
    totals: list[dict]         # 全室每周汇总


@router.get("/manpower/overview", response_model=GroupManpowerOverviewResponse)
async def get_group_manpower_overview(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    weeks_back: int = Query(default=8, ge=1, le=52),
):
    """
    人力总览表：各组每周计划总人天 vs 实际总人天。
    返回最近 N 周（默认8周）的数据，按组汇总。
    """
    today = datetime.now().date()
    week_starts = []
    for i in range(weeks_back):
        ws = today - timedelta(days=today.weekday() + i * 7)
        week_starts.append(ws)
    week_starts.sort()

    # 获取所有活跃组
    groups_result = await db.execute(select(Group).order_by(Group.id))
    groups = groups_result.scalars().all()

    # 按组按周汇总
    rows = []
    all_weeks = set()
    group_data: dict[int, dict] = {}
    totals_map: dict[date, dict] = {}

    for ws in week_starts:
        week_end = ws + timedelta(days=6)
        week_label = f"W{ws.isocalendar()[1]}/{ws.month:02d}-{ws.day:02d}"
        all_weeks.add(ws)

        # 全室计划
        plan_sum_result = await db.execute(
            select(func.coalesce(func.sum(WeeklyPlan.planned_man_days), 0.0)).where(
                WeeklyPlan.week_start_date == ws
            )
        )
        total_planned = plan_sum_result.scalar() or 0.0

        # 全室实际
        actual_sum_result = await db.execute(
            select(func.coalesce(func.sum(ActualEffort.actual_man_days), 0.0)).where(
                ActualEffort.week_start_date == ws,
            )
        )
        total_actual = actual_sum_result.scalar() or 0.0

        totals_map[ws] = {
            "week_start": ws.isoformat(),
            "week_label": week_label,
            "planned": round(total_planned, 1),
            "actual": round(total_actual, 1),
            "variance": round(total_actual - total_planned, 1),
            "variance_pct": round((total_actual - total_planned) / total_planned * 100, 1) if total_planned > 0 else None,
        }

        for group in groups:
            # 该组该周计划
            plan_grp_result = await db.execute(
                select(func.coalesce(func.sum(WeeklyPlan.planned_man_days), 0.0))
                .join(User, User.id == WeeklyPlan.user_id)
                .where(WeeklyPlan.week_start_date == ws, User.group_id == group.id)
            )
            grp_planned = plan_grp_result.scalar() or 0.0

            # 该组该周实际
            actual_grp_result = await db.execute(
                select(func.coalesce(func.sum(ActualEffort.actual_man_days), 0.0))
                .join(User, User.id == ActualEffort.user_id)
                .where(
                    ActualEffort.week_start_date == ws,
                    User.group_id == group.id,
                )
            )
            grp_actual = actual_grp_result.scalar() or 0.0

            grp_name = f"{group.room}{group.name}" if group.room else group.name

            if group.id not in group_data:
                group_data[group.id] = {"group_id": group.id, "group_name": grp_name, "weeks": {}}

            group_data[group.id]["weeks"][ws] = {
                "planned": round(grp_planned, 1),
                "actual": round(grp_actual, 1),
                "variance": round(grp_actual - grp_planned, 1),
                "variance_pct": round((grp_actual - grp_planned) / grp_planned * 100, 1) if grp_planned > 0 else None,
            }

    # 序列化
    week_list = sorted(all_weeks)
    group_list = []
    for g in groups:
        if g.id in group_data:
            weeks_serialized = [
                {
                    "week_start": ws.isoformat(),
                    "week_label": f"W{ws.isocalendar()[1]}/{ws.month:02d}-{ws.day:02d}",
                    **group_data[g.id]["weeks"].get(ws, {"planned": 0.0, "actual": 0.0, "variance": 0.0, "variance_pct": None}),
                }
                for ws in week_list
            ]
            group_list.append({
                "group_id": g.id,
                "group_name": group_data[g.id]["group_name"],
                "weeks": weeks_serialized,
            })

    totals_list = [totals_map[ws] for ws in week_list]

    return GroupManpowerOverviewResponse(
        weeks=[f"{ws.month}/{ws.day}" for ws in week_list],
        groups=group_list,
        totals=totals_list,
    )
