from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.group import Group
from app.models.project import Project, ProjectMember
from app.models.plan import WeeklyPlan
from app.models.manpower import ManpowerRegistration
from app.models.effort import ActualEffort
from app.models.alert import Alert
from app.models.operation_log import OperationLog
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectMergeRequest, ProjectMergePreviewResponse
from app.dependencies import get_current_user
import json

router = APIRouter(prefix="/projects", tags=["projects"])


async def _build_project_response(db: AsyncSession, project: Project) -> dict:
    """计算项目动态字段并返回 dict。优化：批量查询避免 N+1。"""
    # 批量获取 owner 名字
    owner_result = await db.execute(select(User.real_name).where(User.id == project.owner_user_id))
    owner_real_name = owner_result.scalar_one_or_none() or ""

    # 组名
    group_name = None
    if project.group_id:
        g_result = await db.execute(select(Group).where(Group.id == project.group_id))
        g = g_result.scalar_one_or_none()
        if g:
            group_name = f"{g.room}{g.name}" if g.room else g.name

    # 成员数
    member_count_result = await db.execute(
        select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == project.id)
    )
    member_count = member_count_result.scalar() or 0

    # 目标人天 = 已批准的人力报备汇总
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

    # 进度百分比
    progress = round(actual_man_days / target_man_days * 100, 1) if target_man_days > 0 else 0.0

    return {
        "id": project.id,
        "task_code": project.task_code,
        "name": project.name,
        "description": project.description,
        "type": project.type.value if hasattr(project.type, 'value') else project.type,
        "status": project.status.value if hasattr(project.status, 'value') else project.status,
        "owner_user_id": project.owner_user_id,
        "owner_real_name": owner_real_name,
        "group_id": project.group_id,
        "group_name": group_name,
        "member_count": member_count,
        "target_man_days": target_man_days,
        "actual_man_days": actual_man_days,
        "progress": progress,
        "st_progress": project.st_progress or 0.0,
        "uat_progress": project.uat_progress or 0.0,
        "start_date": project.start_date.isoformat() if project.start_date else None,
        "end_date": project.end_date.isoformat() if project.end_date else None,
    }


@router.get("", response_model=list[ProjectResponse])
async def get_projects(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[str | None, Query] = None,
    type_filter: Annotated[str | None, Query] = None,
):
    """获取项目列表。室经理看全部，组长看自己参与的项目。"""
    query = select(Project)

    if status_filter:
        query = query.where(Project.status == status_filter)
    if type_filter:
        query = query.where(Project.type == type_filter)

    if current_user.role == UserRole.manager:
        pass  # 看全部
    elif current_user.role == UserRole.leader:
        query = query.where(
            (Project.owner_user_id == current_user.id) | (Project.status != "closed")
        ).join(ProjectMember, Project.id == ProjectMember.project_id, isouter=True)
        query = query.where(
            (Project.owner_user_id == current_user.id) |
            (ProjectMember.user_id == current_user.id)
        ).distinct()
    else:
        query = query.join(ProjectMember).where(ProjectMember.user_id == current_user.id)

    query = query.order_by(Project.id.desc())
    result = await db.execute(query)
    projects = result.scalars().unique().all()

    responses = []
    for p in projects:
        responses.append(await _build_project_response(db, p))
    return responses


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    if current_user.role not in [UserRole.manager, UserRole.leader]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有室经理或组长可以创建项目")

    project = Project(
        task_code=project_data.task_code,
        name=project_data.name,
        description=project_data.description,
        type=project_data.type,
        group_id=project_data.group_id,
        owner_user_id=project_data.owner_user_id,
        start_date=project_data.start_date,
        end_date=project_data.end_date,
    )
    db.add(project)
    await db.flush()

    db.add(OperationLog(
        operator_id=current_user.id,
        action="project_create",
        entity_type="project",
        entity_id=project.id,
        detail=json.dumps({"after": {"name": project.name, "status": project.status.value if hasattr(project.status, 'value') else project.status}}, ensure_ascii=False),
    ))

    await db.commit()
    await db.refresh(project)
    return await _build_project_response(db, project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    if current_user.role == UserRole.employee:
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id
            )
        )
        if not member_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此项目")
    return await _build_project_response(db, project)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    if current_user.role != UserRole.manager and project.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改此项目")

    before = {"name": project.name, "status": project.status.value if hasattr(project.status, 'value') else project.status}
    if project_data.task_code is not None:
        project.task_code = project_data.task_code
    if project_data.name is not None:
        project.name = project_data.name
    if project_data.description is not None:
        project.description = project_data.description
    if project_data.type is not None:
        project.type = project_data.type
    if project_data.group_id is not None:
        project.group_id = project_data.group_id
    if project_data.status is not None:
        project.status = project_data.status
    if project_data.start_date is not None:
        project.start_date = project_data.start_date
    if project_data.end_date is not None:
        project.end_date = project_data.end_date
    if project_data.st_progress is not None:
        project.st_progress = project_data.st_progress
    if project_data.uat_progress is not None:
        project.uat_progress = project_data.uat_progress
    after = {"name": project.name, "status": project.status.value if hasattr(project.status, 'value') else project.status}

    db.add(OperationLog(
        operator_id=current_user.id,
        action="project_update",
        entity_type="project",
        entity_id=project_id,
        detail=json.dumps({"before": before, "after": after}, ensure_ascii=False),
    ))

    await db.commit()
    await db.refresh(project)
    return await _build_project_response(db, project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    if current_user.role != UserRole.manager and project.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除此项目")

    # 物理删除：先删除关联数据，再删除项目本身
    # 1. 删除 ProjectMember
    await db.execute(select(ProjectMember).where(ProjectMember.project_id == project_id))
    members_result = await db.execute(select(ProjectMember).where(ProjectMember.project_id == project_id))
    for m in members_result.scalars().all():
        await db.delete(m)

    # 2. 删除 ProjectWeeklyDemand
    from app.models.project import ProjectWeeklyDemand
    demands_q = await db.execute(select(ProjectWeeklyDemand).where(ProjectWeeklyDemand.project_id == project_id))
    for d in demands_q.scalars().all():
        await db.delete(d)

    # 3. 删除 ManpowerRegistration
    regs_q = await db.execute(select(ManpowerRegistration).where(ManpowerRegistration.project_id == project_id))
    for r in regs_q.scalars().all():
        await db.delete(r)

    # 4. 删除 ActualEffort
    efforts_q = await db.execute(select(ActualEffort).where(ActualEffort.project_id == project_id))
    for e in efforts_q.scalars().all():
        await db.delete(e)

    # 5. 删除 WeeklyPlan
    plans_q = await db.execute(select(WeeklyPlan).where(WeeklyPlan.project_id == project_id))
    for p in plans_q.scalars().all():
        await db.delete(p)

    # 6. 删除 Alert（关联到本项目的）
    alerts_q = await db.execute(
        select(Alert).where(
            and_(Alert.related_entity_type == "project", Alert.related_entity_id == str(project_id))
        )
    )
    for a in alerts_q.scalars().all():
        await db.delete(a)

    # 6. 删除项目本身
    db.add(OperationLog(
        operator_id=current_user.id,
        action="project_delete",
        entity_type="project",
        entity_id=project_id,
        detail=json.dumps({"before": {"name": project.name, "status": project.status.value if hasattr(project.status, 'value') else project.status}}, ensure_ascii=False),
    ))
    await db.delete(project)
    await db.commit()


@router.get("/merge/preview", response_model=ProjectMergePreviewResponse)
async def merge_preview(
    source_project_id: int,
    target_project_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """合并前预览影响范围。"""
    if current_user.role != UserRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有室经理可以预览合并")

    if source_project_id == target_project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能合并到自身")

    src_result = await db.execute(select(Project).where(Project.id == source_project_id))
    source = src_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="源项目不存在")

    tgt_result = await db.execute(select(Project).where(Project.id == target_project_id))
    target = tgt_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标项目不存在")

    # Count members
    members_result = await db.execute(
        select(func.count()).where(ProjectMember.project_id == source_project_id)
    )
    members_count = members_result.scalar() or 0

    # Count plans
    plans_result = await db.execute(
        select(func.count()).where(WeeklyPlan.project_id == source_project_id)
    )
    plans_count = plans_result.scalar() or 0

    # Count duplicate plans (same user+week already in target)
    duplicate_plans = 0
    plans_src = await db.execute(
        select(WeeklyPlan).where(WeeklyPlan.project_id == source_project_id)
    )
    for plan in plans_src.scalars().all():
        exists = await db.execute(
            select(WeeklyPlan).where(
                and_(
                    WeeklyPlan.user_id == plan.user_id,
                    WeeklyPlan.project_id == target_project_id,
                    WeeklyPlan.week_start_date == plan.week_start_date,
                )
            )
        )
        if exists.scalar_one_or_none():
            duplicate_plans += 1

    # Count registrations
    reg_result = await db.execute(
        select(func.count()).where(ManpowerRegistration.project_id == source_project_id)
    )
    registrations_count = reg_result.scalar() or 0

    # Count duplicate registrations
    duplicate_registrations = 0
    regs_src = await db.execute(
        select(ManpowerRegistration).where(ManpowerRegistration.project_id == source_project_id)
    )
    for reg in regs_src.scalars().all():
        exists = await db.execute(
            select(ManpowerRegistration).where(
                ManpowerRegistration.project_id == target_project_id,
                ManpowerRegistration.team_id == reg.team_id,
            )
        )
        if exists.scalar_one_or_none():
            duplicate_registrations += 1

    # Count efforts
    efforts_result = await db.execute(
        select(func.count()).where(ActualEffort.project_id == source_project_id)
    )
    efforts_count = efforts_result.scalar() or 0

    return ProjectMergePreviewResponse(
        source_project_name=source.name,
        target_project_name=target.name,
        members_count=members_count,
        plans_count=plans_count,
        duplicate_plans_count=duplicate_plans,
        registrations_count=registrations_count,
        duplicate_registrations_count=duplicate_registrations,
        efforts_count=efforts_count,
    )


@router.post("/merge", status_code=status.HTTP_200_OK)
async def merge_projects(
    merge_data: ProjectMergeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """合并两个项目：source → target，source 被标记为 closed。"""
    if current_user.role != UserRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有室经理可以合并项目")

    source_id = merge_data.source_project_id
    target_id = merge_data.target_project_id

    if source_id == target_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能合并到自身")

    # 查询两个项目
    src_result = await db.execute(select(Project).where(Project.id == source_id))
    source = src_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="源项目不存在")

    tgt_result = await db.execute(select(Project).where(Project.id == target_id))
    target = tgt_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标项目不存在")

    if source.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="源项目已结项，无法合并")

    # 1. 迁移 ProjectMember（跳过已存在的成员）
    members_result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == source_id)
    )
    existing_members_result = await db.execute(
        select(ProjectMember.project_id, ProjectMember.user_id)
        .where(ProjectMember.project_id == target_id)
    )
    existing_target_members = set(
        (r[0], r[1]) for r in existing_members_result.all()
    )

    for member in members_result.scalars().all():
        if (target_id, member.user_id) not in existing_target_members:
            db.add(ProjectMember(
                project_id=target_id,
                user_id=member.user_id,
                joined_at=member.joined_at,
            ))
        # 无论是否冲突都删掉旧记录，避免删除源项目时 FK 违反 NOT NULL
        await db.delete(member)

    # 2. 迁移周计划（冲突的删源保留目标，无冲突的迁过去）
    plans_result = await db.execute(
        select(WeeklyPlan).where(WeeklyPlan.project_id == source_id)
    )
    for plan in plans_result.scalars().all():
        exists = await db.execute(
            select(WeeklyPlan).where(
                and_(
                    WeeklyPlan.user_id == plan.user_id,
                    WeeklyPlan.project_id == target_id,
                    WeeklyPlan.week_start_date == plan.week_start_date,
                )
            )
        )
        if exists.scalar_one_or_none():
            # 目标已有该用户同周期的计划，删掉源项目的这条（重复数据）
            await db.delete(plan)
        else:
            plan.project_id = target_id

    # 3. 迁移人力报备（跳过目标项目已存在的记录）
    reg_result = await db.execute(
        select(ManpowerRegistration).where(ManpowerRegistration.project_id == source_id)
    )
    for reg in reg_result.scalars().all():
        exists = await db.execute(
            select(ManpowerRegistration).where(
                ManpowerRegistration.project_id == target_id,
                ManpowerRegistration.team_id == reg.team_id,
            )
        )
        if not exists.scalar_one_or_none():
            reg.project_id = target_id

    # 4. 迁移实际投入
    effort_result = await db.execute(
        select(ActualEffort).where(ActualEffort.project_id == source_id)
    )
    for effort in effort_result.scalars().all():
        effort.project_id = target_id

    # 5. 迁移预警
    alert_result = await db.execute(
        select(Alert).where(
            and_(
                Alert.related_entity_type == "project",
                Alert.related_entity_id == str(source_id),
            )
        )
    )
    for alert in alert_result.scalars().all():
        alert.related_entity_id = str(target_id)

    # 6. 物理删除源项目（关联数据已全部迁移，仅删除项目记录）
    await db.delete(source)

    # 7. 记录合并日志
    db.add(OperationLog(
        operator_id=current_user.id,
        action="project_merge",
        entity_type="project",
        entity_id=source_id,
        detail=json.dumps({"before": {"name": source.name}, "after": {"merged_to_project_id": target_id, "merged_to_project_name": target.name}}, ensure_ascii=False),
    ))

    await db.commit()
    return {"message": f"项目 {source.name} 已合并到 {target.name}"}
