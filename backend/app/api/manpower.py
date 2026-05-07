from __future__ import annotations
from typing import Annotated
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.group import Group
from app.models.project import Project
from app.models.manpower import ManpowerRegistration
from app.schemas.manpower import (
    ManpowerRegistrationCreate,
    ManpowerRegistrationUpdate,
    ManpowerRegistrationResponse,
)
from app.dependencies import get_current_user

router = APIRouter(prefix="/manpower", tags=["manpower"])


async def _build_response(db: AsyncSession, reg: ManpowerRegistration) -> dict:
    """Build registration response with joined info."""
    # Project name
    project_result = await db.execute(select(Project.name).where(Project.id == reg.project_id))
    project_name = project_result.scalar_one_or_none()

    # Team name (带室前缀)
    team_result = await db.execute(select(Group).where(Group.id == reg.team_id))
    team = team_result.scalar_one_or_none()
    team_name = None
    if team:
        team_name = f"{team.room}{team.name}" if team.room else team.name

    # Creator name
    creator_result = await db.execute(select(User.real_name).where(User.id == reg.created_by))
    creator_name = creator_result.scalar_one_or_none()

    # Approver name
    approver_name = None
    if reg.approved_by:
        approver_result = await db.execute(select(User.real_name).where(User.id == reg.approved_by))
        approver_name = approver_result.scalar_one_or_none()

    return {
        "id": reg.id,
        "project_id": reg.project_id,
        "project_name": project_name,
        "team_id": reg.team_id,
        "team_name": team_name,
        "registered_man_days": reg.registered_man_days,
        "notes": reg.notes,
        "status": reg.status,
        "created_by": reg.created_by,
        "created_by_real_name": creator_name,
        "approved_by": reg.approved_by,
        "approved_by_real_name": approver_name,
        "approved_at": reg.approved_at.isoformat() if reg.approved_at else None,
        "created_at": reg.created_at,
        "updated_at": reg.updated_at,
    }


@router.get("", response_model=list[ManpowerRegistrationResponse])
async def get_registrations(
    project_id: Annotated[int | None, Query] = None,
    team_id: Annotated[int | None, Query] = None,
    status_filter: Annotated[str | None, Query] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """获取人力报备列表。室经理可见所有，组长可见本组。"""
    query = select(ManpowerRegistration)

    if project_id:
        query = query.where(ManpowerRegistration.project_id == project_id)
    if team_id:
        if current_user.role == UserRole.leader and current_user.group_id != team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看此组报备")
        query = query.where(ManpowerRegistration.team_id == team_id)
    elif current_user.role == UserRole.leader:
        # 组长只能看本组的报备
        query = query.where(ManpowerRegistration.team_id == current_user.group_id)

    if status_filter:
        query = query.where(ManpowerRegistration.status == status_filter)

    query = query.order_by(ManpowerRegistration.created_at.desc())
    result = await db.execute(query)
    regs = result.scalars().all()

    responses = []
    for reg in regs:
        responses.append(await _build_response(db, reg))
    return responses


@router.post("", response_model=ManpowerRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def create_registration(
    data: ManpowerRegistrationCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """创建人力报备。只有室经理可以创建。"""
    if current_user.role != UserRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有室经理可以创建人力报备")

    # 检查项目是否存在
    proj_result = await db.execute(select(Project).where(Project.id == data.project_id))
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    # 检查组是否存在
    team_result = await db.execute(select(Group).where(Group.id == data.team_id))
    if not team_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="组不存在")

    # 检查是否已有该项目的报备
    existing = await db.execute(
        select(ManpowerRegistration).where(
            ManpowerRegistration.project_id == data.project_id,
            ManpowerRegistration.team_id == data.team_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该项目已有该组的报备")

    reg = ManpowerRegistration(
        project_id=data.project_id,
        team_id=data.team_id,
        registered_man_days=data.registered_man_days,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(reg)
    await db.commit()
    await db.refresh(reg)
    return await _build_response(db, reg)


@router.put("/{reg_id}/approve", response_model=ManpowerRegistrationResponse)
async def approve_registration(
    reg_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """审批通过人力报备。室经理审批。"""
    if current_user.role != UserRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有室经理可以审批报备")

    result = await db.execute(select(ManpowerRegistration).where(ManpowerRegistration.id == reg_id))
    reg = result.scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="报备不存在")

    if reg.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只能审批待审批状态的报备")

    reg.status = "approved"
    reg.approved_by = current_user.id
    reg.approved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(reg)
    return await _build_response(db, reg)


@router.put("/{reg_id}/reject", response_model=ManpowerRegistrationResponse)
async def reject_registration(
    reg_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """驳回人力报备。室经理驳回。"""
    if current_user.role != UserRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有室经理可以驳回报备")

    result = await db.execute(select(ManpowerRegistration).where(ManpowerRegistration.id == reg_id))
    reg = result.scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="报备不存在")

    if reg.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只能驳回待审批状态的报备")

    reg.status = "rejected"
    reg.approved_by = current_user.id
    reg.approved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(reg)
    return await _build_response(db, reg)


@router.delete("/{reg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_registration(
    reg_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """删除人力报备（仅室经理，且只能删除待审批的）。"""
    if current_user.role != UserRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有室经理可以删除报备")

    result = await db.execute(select(ManpowerRegistration).where(ManpowerRegistration.id == reg_id))
    reg = result.scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="报备不存在")

    if reg.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只能删除待审批状态的报备")

    await db.delete(reg)
    await db.commit()
    return None
