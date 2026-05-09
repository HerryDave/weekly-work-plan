from __future__ import annotations
from typing import Annotated
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.group import Group
from app.models.project_weekly_plan import ProjectWeeklyStatus, ProjectWeeklyMemberAllocation
from app.dependencies import get_current_user

router = APIRouter(prefix="/project-weekly-plan", tags=["project-weekly-plan"])

WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def get_week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


# ─── 项目情况页签 ─────────────────────────────────────────────────────────────


@router.get("/projects/status")
async def get_project_status_list(
    week_start_date: Annotated[date | None, Query] = None,
    group_id: Annotated[int | None, Query] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    获取项目周计划列表（项目情况页签）
    - week_start_date: 周一日期，默认本周
    - group_id: 室组筛选
    """
    if week_start_date is None:
        week_start_date = get_week_start(date.today())

    # 查项目（筹备中 + 进行中）
    query = select(Project).where(Project.status.in_(["preparing", "ongoing"]))
    if group_id:
        query = query.where(Project.group_id == group_id)
    query = query.order_by(Project.name)
    result = await db.execute(query)
    projects = result.scalars().all()

    # 批量查 project_weekly_status（带 allocations 预加载）
    status_result = await db.execute(
        select(ProjectWeeklyStatus)
        .options(selectinload(ProjectWeeklyStatus.allocations))
        .where(ProjectWeeklyStatus.week_start_date == week_start_date)
    )
    status_records = status_result.scalars().all()
    status_map = {s.project_id: s for s in status_records}

    # 查所有活跃成员（用于下拉）
    users_result = await db.execute(
        select(User).where(User.is_active == True)
    )
    all_users = users_result.scalars().all()

    # 查室组
    groups_result = await db.execute(select(Group))
    all_groups = groups_result.scalars().all()
    group_map = {g.id: g for g in all_groups}

    items = []
    for p in projects:
        s = status_map.get(p.id)
        alloc_list = list(s.allocations) if s else []

        # 整理每天的分配人员ID列表
        daily_allocs = {wd: [] for wd in range(1, 8)}
        for a in alloc_list:
            daily_allocs.setdefault(a.weekday, []).append(a.user_id)

        # 拼日期
        week_dates = [week_start_date + timedelta(days=i) for i in range(7)]

        # 室组名称
        group_name = None
        if p.group_id and p.group_id in group_map:
            g = group_map[p.group_id]
            group_name = f"{g.room or ''}{g.name}".strip() or g.name

        items.append({
            "project_id": p.id,
            "project_name": p.name,
            "status": s.status if s else "normal",
            "risk_desc": s.risk_desc if s else "",
            "weekly_progress": s.weekly_progress if s else "",
            "next_week_plan": s.next_week_plan if s else "",
            "week_start_date": str(week_start_date),
            "week_dates": [str(d) for d in week_dates],
            "daily_allocations": {
                f"day{i+1}": daily_allocs.get(i+1, []) for i in range(7)
            },
        })

    return {
        "week_start_date": str(week_start_date),
        "week_dates": [str(week_start_date + timedelta(days=i)) for i in range(7)],
        "weekdays": WEEKDAYS,
        "projects": items,
        "all_users": [{"id": u.id, "real_name": u.real_name} for u in all_users],
        "groups": [{"id": g.id, "name": g.name, "room": g.room} for g in all_groups],
    }


@router.post("/projects/status")
async def save_project_status(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    保存/更新项目周计划记录
    {
      "project_id": int,
      "week_start_date": "YYYY-MM-DD",
      "status": "normal|risk|delayed",
      "risk_desc": str,
      "weekly_progress": str,
      "next_week_plan": str,
      "daily_allocations": {"day1": [user_id, ...], ...}
    }
    """
    project_id = payload["project_id"]
    week_start = date.fromisoformat(payload["week_start_date"])
    daily_allocs: dict = payload.get("daily_allocations", {})

    # upsert project_weekly_status
    existing_result = await db.execute(
        select(ProjectWeeklyStatus).where(
            and_(
                ProjectWeeklyStatus.project_id == project_id,
                ProjectWeeklyStatus.week_start_date == week_start
            )
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.status = payload.get("status", "normal")
        existing.risk_desc = payload.get("risk_desc", "")
        existing.weekly_progress = payload.get("weekly_progress", "")
        existing.next_week_plan = payload.get("next_week_plan", "")
        status_id = existing.id
    else:
        new_status = ProjectWeeklyStatus(
            project_id=project_id,
            week_start_date=week_start,
            status=payload.get("status", "normal"),
            risk_desc=payload.get("risk_desc", ""),
            weekly_progress=payload.get("weekly_progress", ""),
            next_week_plan=payload.get("next_week_plan", ""),
        )
        db.add(new_status)
        await db.flush()
        status_id = new_status.id

    # 删除旧 allocations，重新插入
    await db.execute(
        delete(ProjectWeeklyMemberAllocation).where(
            ProjectWeeklyMemberAllocation.project_weekly_status_id == status_id
        )
    )
    await db.flush()

    for day_num in range(1, 8):
        user_ids: list = daily_allocs.get(f"day{day_num}", [])
        for uid in user_ids:
            new_alloc = ProjectWeeklyMemberAllocation(
                project_weekly_status_id=status_id,
                user_id=uid,
                weekday=day_num,
            )
            db.add(new_alloc)

    await db.commit()
    return {"success": True, "status_id": status_id}


# ─── 人员维度页签 ─────────────────────────────────────────────────────────────


@router.get("/projects/dimension")
async def get_person_dimension(
    week_start_date: Annotated[date | None, Query] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    人员维度统计
    - 总项目数、参与人员数、人均负责项目数
    - 人员投入明细列表
    - 投入分析
    """
    if week_start_date is None:
        week_start_date = get_week_start(date.today())

    # 获取本周有记录的项目
    status_result = await db.execute(
        select(ProjectWeeklyStatus)
        .options(selectinload(ProjectWeeklyStatus.allocations))
        .where(ProjectWeeklyStatus.week_start_date == week_start_date)
    )
    status_records = status_result.scalars().all()

    if not status_records:
        return {
            "week_start_date": str(week_start_date),
            "summary": {"total_projects": 0, "total_users": 0, "avg_projects_per_user": 0},
            "details": [],
            "analysis": ["本周暂无周计划记录。"],
        }

    # 按人员分组统计
    from collections import defaultdict
    user_stats: dict = defaultdict(lambda: {
        "user_id": 0, "user_name": "", "project_ids": [], "total_days": 0
    })

    project_ids = []
    for s in status_records:
        project_ids.append(s.project_id)
        for a in s.allocations:
            uid = a.user_id
            user_stats[uid]["user_id"] = uid
            if s.project_id not in user_stats[uid]["project_ids"]:
                user_stats[uid]["project_ids"].append(s.project_id)
            user_stats[uid]["total_days"] += 1

    # 获取项目名
    project_map = {}
    if project_ids:
        proj_result = await db.execute(
            select(Project).where(Project.id.in_(project_ids))
        )
        for p in proj_result.scalars().all():
            project_map[p.id] = p.name

    # 获取用户名
    all_user_ids = list(user_stats.keys())
    user_map = {}
    if all_user_ids:
        user_result = await db.execute(
            select(User).where(User.id.in_(all_user_ids))
        )
        for u in user_result.scalars().all():
            user_map[u.id] = u.real_name

    total_projects = len(project_map)
    total_users = len(user_stats)
    avg_projects = round(total_projects / total_users, 1) if total_users > 0 else 0

    detail_list = []
    for uid, info in user_stats.items():
        project_count = len(info["project_ids"])
        total_days = info["total_days"]
        # 投入比例 = 实际投入天数 / (参与项目数 * 7) * 100%
        ratio = round(total_days / (project_count * 7) * 100, 1) if project_count > 0 else 0
        project_names = [project_map.get(pid, f"项目{pid}") for pid in info["project_ids"]]

        detail_list.append({
            "user_id": uid,
            "user_name": user_map.get(uid, f"用户{uid}"),
            "project_count": project_count,
            "total_days": total_days,
            "ratio": ratio,
            "project_names": project_names,
        })

    # 投入分析
    analysis = []
    for item in sorted(detail_list, key=lambda x: -x["ratio"]):
        if item["ratio"] >= 100:
            if item["project_count"] == 1:
                analysis.append(
                    f"【{item['user_name']}】负责【{item['project_names'][0]}】，投入比例 {item['ratio']}%，共 {item['total_days']} 天。"
                )
            else:
                analysis.append(
                    f"【{item['user_name']}】负责 {item['project_count']} 个项目（{', '.join(item['project_names'])}），"
                    f"投入比例 {item['ratio']}%，共 {item['total_days']} 天。"
                )
        elif item["ratio"] >= 50:
            analysis.append(
                f"【{item['user_name']}】参与 {item['project_count']} 个项目（{', '.join(item['project_names'])}），"
                f"投入比例 {item['ratio']}%，需关注。"
            )

    return {
        "week_start_date": str(week_start_date),
        "summary": {
            "total_projects": total_projects,
            "total_users": total_users,
            "avg_projects_per_user": avg_projects,
        },
        "details": detail_list,
        "analysis": analysis if analysis else ["本周暂无明显投入异常的人员。"],
    }
