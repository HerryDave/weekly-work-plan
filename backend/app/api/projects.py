from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.group import Group
from app.models.project import Project, ProjectMember
from app.models.manpower import ManpowerRegistration
from app.models.effort import ActualEffort
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.dependencies import get_current_user

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
        name=project_data.name,
        description=project_data.description,
        type=project_data.type,
        group_id=project_data.group_id,
        owner_user_id=project_data.owner_user_id,
        start_date=project_data.start_date,
        end_date=project_data.end_date,
    )
    db.add(project)
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

    project.status = "closed"
    await db.commit()
