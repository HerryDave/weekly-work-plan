from __future__ import annotations
from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Float, ForeignKey, func, Enum as SQLEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class ProjectType(str, enum.Enum):
    internal = "internal"
    cross = "cross"


class ProjectStatus(str, enum.Enum):
    preparing = "preparing"
    active = "active"
    closed = "closed"


class ProjectType(str, enum.Enum):
    internal = "internal"      # 流量项目
    cross = "cross"          # 重点项目


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_code: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 任务编号
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    type: Mapped[ProjectType] = mapped_column(SQLEnum(ProjectType), default=ProjectType.internal)
    status: Mapped[ProjectStatus] = mapped_column(SQLEnum(ProjectStatus), default=ProjectStatus.preparing)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("groups.id"), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    st_progress: Mapped[float] = mapped_column(Float, default=0.0)  # ST进度 0-100
    uat_progress: Mapped[float] = mapped_column(Float, default=0.0)  # UAT进度 0-100
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    owner = relationship("User", backref="owned_projects")
    registrations = relationship("ManpowerRegistration", back_populates="project")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project", backref="members")
    user = relationship("User", backref="project_memberships")


class ProjectWeeklyDemand(Base):
    __tablename__ = "project_weekly_demands"
    __table_args__ = (
        UniqueConstraint("project_id", "week_start_date", name="uq_project_week_demand"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    required_man_days: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", backref="weekly_demands")
