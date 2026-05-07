"""
预警引擎 — 对齐需求规格说明书（2026-03-10）

预警类型（按需求规格）：
- W01 项目周人力不足：某项目某周计划总人天 < 该项目该周需求人天（若需求已设置）
- W02 个人过度负载：某员工某周计划总人天 > 阈值（默认5人天）
- W04 连续偏差过大：某员工连续两周计划vs实际偏差绝对值 > 30%

触发时机：
- 周计划提交/更新 → 检查 W01、W02
- 实际投入录入 → 检查 W01（针对涉及项目的所有周）、W04
"""
from datetime import date, datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertStatus
from app.models.project import Project, ProjectWeeklyDemand
from app.models.user import User, UserRole
from app.models.plan import WeeklyPlan
from app.models.effort import ActualEffort

# ============ 阈值配置 ============
PERSONAL_LOAD_THRESHOLD = 5.0    # W02 个人周计划人天上限（可配置）
VARIANCE_THRESHOLD = 0.30       # W04 偏差阈值 30%


# ============ W01: 项目周人力不足 ============
async def check_w01_for_project_week(
    db: AsyncSession,
    project_id: int,
    week_start_date: date,
) -> None:
    """检查某项目某周的 W01 预警：计划总人天 < 需求人天。"""
    # 查找该周该项目的需求人天
    demand_result = await db.execute(
        select(ProjectWeeklyDemand).where(
            ProjectWeeklyDemand.project_id == project_id,
            ProjectWeeklyDemand.week_start_date == week_start_date,
        )
    )
    demand: ProjectWeeklyDemand | None = demand_result.scalar_one_or_none()
    if not demand or demand.required_man_days <= 0:
        return  # 未设置需求，跳过

    # 计算该周该项目的计划总人天
    planned_result = await db.execute(
        select(func.coalesce(func.sum(WeeklyPlan.planned_man_days), 0.0)).where(
            WeeklyPlan.project_id == project_id,
            WeeklyPlan.week_start_date == week_start_date,
        )
    )
    planned = planned_result.scalar() or 0.0

    if planned < demand.required_man_days:
        # 检查是否已存在活跃预警，避免重复
        existing = await db.execute(
            select(Alert).where(
                Alert.alert_type == "W01",
                Alert.related_entity_type == "project_week",
                Alert.related_entity_id == f"{project_id}_{week_start_date.isoformat()}",
                Alert.status == AlertStatus.active,
            )
        )
        if not existing.scalar_one_or_none():
            proj_result = await db.execute(select(Project.name).where(Project.id == project_id))
            proj_name = proj_result.scalar_one_or_none() or f"项目{project_id}"
            week_label = f"W{week_start_date.isocalendar()[1]}"
            new_alert = Alert(
                alert_type="W01",
                alert_level="yellow",
                related_entity_type="project_week",
                related_entity_id=f"{project_id}_{week_start_date.isoformat()}",
                message=(
                    f"项目「{proj_name}」{week_label}计划{planned:.1f}人天 "
                    f"< 需求{demand.required_man_days:.1f}人天，人力不足"
                ),
            )
            db.add(new_alert)
    else:
        # 恢复正常，关闭 W01
        related_id = f"{project_id}_{week_start_date.isoformat()}"
        alerts_to_resolve = await db.execute(
            select(Alert).where(
                Alert.alert_type == "W01",
                Alert.related_entity_type == "project_week",
                Alert.related_entity_id == related_id,
                Alert.status == AlertStatus.active,
            )
        )
        for alert in alerts_to_resolve.scalars().all():
            alert.status = AlertStatus.resolved
            alert.resolved_at = datetime.utcnow()


async def check_w01_for_project(db: AsyncSession, project_id: int) -> None:
    """对某项目所有已设置需求的周，检查 W01。"""
    demands_result = await db.execute(
        select(ProjectWeeklyDemand).where(ProjectWeeklyDemand.project_id == project_id)
    )
    for demand in demands_result.scalars().all():
        await check_w01_for_project_week(db, project_id, demand.week_start_date)


# ============ W02: 个人过度负载 ============
PERSONAL_W02_USER_CACHE: dict[int, float] = {}  # user_id -> threshold（未来可从配置表读取）


async def check_w02_for_user_week(
    db: AsyncSession,
    user_id: int,
    week_start_date: date,
) -> None:
    """检查某员工某周的 W02 预警：计划总人天 > 5人天。"""
    threshold = PERSONAL_W02_USER_CACHE.get(user_id, PERSONAL_LOAD_THRESHOLD)

    # 计算该员工该周所有项目的计划总人天
    planned_result = await db.execute(
        select(func.coalesce(func.sum(WeeklyPlan.planned_man_days), 0.0)).where(
            WeeklyPlan.user_id == user_id,
            WeeklyPlan.week_start_date == week_start_date,
        )
    )
    planned = planned_result.scalar() or 0.0

    if planned > threshold:
        existing = await db.execute(
            select(Alert).where(
                Alert.alert_type == "W02",
                Alert.related_entity_type == "user_week",
                Alert.related_entity_id == f"{user_id}_{week_start_date.isoformat()}",
                Alert.status == AlertStatus.active,
            )
        )
        if not existing.scalar_one_or_none():
            user_result = await db.execute(
                select(User.real_name).where(User.id == user_id)
            )
            user_name = user_result.scalar_one_or_none() or f"员工{user_id}"
            week_label = f"W{week_start_date.isocalendar()[1]}"
            new_alert = Alert(
                alert_type="W02",
                alert_level="yellow",
                related_entity_type="user_week",
                related_entity_id=f"{user_id}_{week_start_date.isoformat()}",
                message=f"员工「{user_name}」{week_label}计划{planned:.1f}人天 > {threshold:.1f}人天，过度负载",
            )
            db.add(new_alert)
    else:
        # 恢复正常，关闭 W02
        related_id = f"{user_id}_{week_start_date.isoformat()}"
        alerts_to_resolve = await db.execute(
            select(Alert).where(
                Alert.alert_type == "W02",
                Alert.related_entity_type == "user_week",
                Alert.related_entity_id == related_id,
                Alert.status == AlertStatus.active,
            )
        )
        for alert in alerts_to_resolve.scalars().all():
            alert.status = AlertStatus.resolved
            alert.resolved_at = datetime.utcnow()


async def check_w02_for_user(db: AsyncSession, user_id: int) -> None:
    """对某员工所有已有计划的周，检查 W02。"""
    weeks_result = await db.execute(
        select(WeeklyPlan.week_start_date)
        .where(WeeklyPlan.user_id == user_id)
        .distinct()
    )
    for row in weeks_result.fetchall():
        await check_w02_for_user_week(db, user_id, row.week_start_date)


# ============ W04: 连续偏差过大 ============
async def check_w04_for_user(db: AsyncSession, user_id: int) -> None:
    """
    检查某员工连续两周计划vs实际偏差绝对值 > 30%（W04）。
    逻辑：找到该员工最近连续两周都有计划+实际数据的记录，
    若两周偏差均 > 30%，则触发 W04。
    """
    # 获取该员工所有有实际投入的周（直接按 week_start_date 汇总）
    actual_weeks_result = await db.execute(
        select(
            ActualEffort.week_start_date,
            func.sum(ActualEffort.actual_man_days).label("actual"),
        )
        .where(ActualEffort.user_id == user_id)
        .group_by(ActualEffort.week_start_date)
        .order_by(ActualEffort.week_start_date.desc())
    )
    actual_by_week: dict[date, float] = {}
    for row in actual_weeks_result.fetchall():
        actual_by_week[row.week_start_date] = row.actual

    if len(actual_by_week) < 2:
        return  # 不足两周，不检查

    # 获取该员工有计划的周
    plan_weeks_result = await db.execute(
        select(
            WeeklyPlan.week_start_date,
            func.sum(WeeklyPlan.planned_man_days).label("planned"),
        )
        .where(WeeklyPlan.user_id == user_id)
        .group_by(WeeklyPlan.week_start_date)
    )
    plan_by_week: dict[date, float] = {row.week_start_date: row.planned for row in plan_weeks_result.fetchall()}

    # 取最新连续两周（降序排列）
    sorted_weeks = sorted(actual_by_week.keys(), reverse=True)
    consecutive_pairs = []
    for i in range(len(sorted_weeks) - 1):
        w1, w2 = sorted_weeks[i], sorted_weeks[i + 1]
        # 检查是否连续（差7天）
        if (w1 - w2).days == 7:
            consecutive_pairs.append((w1, w2))

    for w_recent, w_prev in consecutive_pairs:
        planned_recent = plan_by_week.get(w_recent, 0.0)
        planned_prev = plan_by_week.get(w_prev, 0.0)

        if planned_recent <= 0 or planned_prev <= 0:
            continue

        actual_recent = actual_by_week.get(w_recent, 0.0)
        actual_prev = actual_by_week.get(w_prev, 0.0)

        variance_recent = abs(actual_recent - planned_recent) / planned_recent
        variance_prev = abs(actual_prev - planned_prev) / planned_prev

        if variance_recent > VARIANCE_THRESHOLD and variance_prev > VARIANCE_THRESHOLD:
            # 检查是否已存在活跃预警
            existing = await db.execute(
                select(Alert).where(
                    Alert.alert_type == "W04",
                    Alert.related_entity_type == "user",
                    Alert.related_entity_id == str(user_id),
                    Alert.status == AlertStatus.active,
                )
            )
            if not existing.scalar_one_or_none():
                user_result = await db.execute(
                    select(User.real_name).where(User.id == user_id)
                )
                user_name = user_result.scalar_one_or_none() or f"员工{user_id}"
                new_alert = Alert(
                    alert_type="W04",
                    alert_level="red",
                    related_entity_type="user",
                    related_entity_id=str(user_id),
                    message=(
                        f"员工「{user_name}」连续两周（"
                        f"W{w_recent.isocalendar()[1]}/{w_prev.isocalendar()[1]}）"
                        f"计划vs实际偏差均超过{int(VARIANCE_THRESHOLD*100)}%，"
                        f"分别为{int(variance_recent*100)}%/{int(variance_prev*100)}%"
                    ),
                )
                db.add(new_alert)
        else:
            # 恢复正常，关闭 W04
            alerts_to_resolve = await db.execute(
                select(Alert).where(
                    Alert.alert_type == "W04",
                    Alert.related_entity_type == "user",
                    Alert.related_entity_id == str(user_id),
                    Alert.status == AlertStatus.active,
                )
            )
            for alert in alerts_to_resolve.scalars().all():
                alert.status = AlertStatus.resolved
                alert.resolved_at = datetime.utcnow()


# ============ 统一触发入口（被 plans.py / efforts.py 调用）============

async def trigger_alerts_on_plan_change(
    db: AsyncSession,
    user_id: int,
    project_id: int,
    week_start_date: date,
) -> None:
    """
    周计划变化时触发：W01（项目该周）+ W02（员工该周）。
    由 plans.py batch_update_plans 末尾调用。
    注意：不在此函数内 commit，由调用方统一管理事务。
    """
    await check_w01_for_project_week(db, project_id, week_start_date)
    await check_w02_for_user_week(db, user_id, week_start_date)


async def trigger_alerts_on_effort_change(
    db: AsyncSession,
    user_id: int,
    project_id: int,
    week_start_date: date,
) -> None:
    """
    实际投入变化时触发：W01（项目该周）+ W04（员工连续偏差）。
    由 efforts.py batch_update_efforts 末尾调用。
    注意：不在此函数内 commit，由调用方统一管理事务。
    """
    await check_w01_for_project_week(db, project_id, week_start_date)
    await check_w04_for_user(db, user_id)


# ============ 向后兼容 wrapper ============
async def check_and_update_alerts(
    db: AsyncSession,
    project_id: int | None = None,
    week_start_date: date | None = None,
) -> None:
    """
    兼容旧调用方（dashboard.py / manpower.py 等）。
    新代码应使用 trigger_alerts_on_* 系列函数。
    """
    if project_id is not None:
        await check_w01_for_project(db, project_id)
    if week_start_date is not None:
        # 对该周所有项目检查 W01
        projects_result = await db.execute(
            select(WeeklyPlan.project_id)
            .where(WeeklyPlan.week_start_date == week_start_date)
            .distinct()
        )
        for row in projects_result.fetchall():
            await check_w01_for_project_week(db, row.project_id, week_start_date)
    await db.commit()
