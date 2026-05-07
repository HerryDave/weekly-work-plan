from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.project import Project, ProjectMember
from app.models.notification import Notification
from app.schemas.project import ProjectMemberCreate, ProjectMemberResponse
from app.dependencies import get_current_user
from app.models.operation_log import OperationLog

router = APIRouter(prefix="/projects", tags=["members"])

# 全局成员列表（不隶属于某项目）
members_router = APIRouter(prefix="/members", tags=["members"])


@members_router.get("", response_model=list[ProjectMemberResponse])
async def list_all_members(
    current_user: Annotated[User, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """列出所有项目成员（全局）"""
    result = await db.execute(select(ProjectMember))
    return result.scalars().all()


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
async def get_project_members(
    project_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id)
    )
    members = result.scalars().all()
    return members


@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_project_member(
    project_id: int,
    member_data: ProjectMemberCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if current_user.role != UserRole.manager and project.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner or manager can add members")

    # Check if user exists
    user_result = await db.execute(select(User).where(User.id == member_data.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check if already a member
    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == member_data.user_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a member")

    member = ProjectMember(project_id=project_id, user_id=member_data.user_id)
    db.add(member)
    await db.flush()  # get member.id

    # 记录操作日志
    db.add(OperationLog(
        operator_id=current_user.id,
        action="member_add",
        entity_type="project_member",
        entity_id=member.id,
        detail=f'{{"user_id": {member_data.user_id}, "project_id": {project_id}}}',
    ))

    # 跨组支持通知（W03）：添加跨组成员时通知对方组长
    if user.group_id:
        leader_result = await db.execute(
            select(User).where(User.group_id == user.group_id, User.role == UserRole.leader, User.is_active == True)
        )
        leader = leader_result.scalar_one_or_none()
        if leader:
            notification = Notification(
                user_id=leader.id,
                type="W03_MEMBER_ADDED",
                title=f"跨组支持通知 - {project.name}",
                content=(
                    f"您组内员工「{user.real_name}」已被项目「{project.name}」"
                    f"（负责人：{current_user.real_name}）添加为成员，"
                    f"请在周计划中为其分配该项目投入。"
                ),
                related_entity_type="project",
                related_entity_id=project_id,
            )
            db.add(notification)

    await db.commit()
    await db.refresh(member)

    return member


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    project_id: int,
    user_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if current_user.role != UserRole.manager and project.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner or manager can remove members")

    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    # 记录操作日志（在删除前）
    db.add(OperationLog(
        operator_id=current_user.id,
        action="member_remove",
        entity_type="project_member",
        entity_id=user_id,  # 用 user_id 代替已被删除的 member.id
        detail=f'{{"user_id": {user_id}, "project_id": {project_id}}}',
    ))

    await db.delete(member)

    # 跨组支持通知（W03）：移除跨组成员时通知对方组长（在 commit 前）
    if user and user.group_id:
        leader_result = await db.execute(
            select(User).where(User.group_id == user.group_id, User.role == UserRole.leader, User.is_active == True)
        )
        leader = leader_result.scalar_one_or_none()
        if leader:
            notification = Notification(
                user_id=leader.id,
                type="W03_MEMBER_REMOVED",
                title=f"跨组支持变更 - {project.name}",
                content=(
                    f"您组内员工「{user.real_name}」已被从项目「{project.name}」"
                    f"（操作人：{current_user.real_name}）移除。"
                ),
                related_entity_type="project",
                related_entity_id=project_id,
            )
            db.add(notification)

    await db.commit()
