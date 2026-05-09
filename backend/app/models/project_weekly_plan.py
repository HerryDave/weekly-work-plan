from datetime import datetime, date
from sqlalchemy import DateTime, Date, Float, ForeignKey, func, UniqueConstraint, Integer, String, VARCHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ProjectWeeklyStatus(Base):
    __tablename__ = "project_weekly_status"
    __table_args__ = (
        UniqueConstraint("project_id", "week_start_date", name="uq_project_week"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="normal")
    risk_desc: Mapped[str] = mapped_column(String(500), default="")
    weekly_progress: Mapped[str] = mapped_column(String(500), default="")
    next_week_plan: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", backref="weekly_statuses")
    allocations = relationship("ProjectWeeklyMemberAllocation", back_populates="status_record", cascade="all, delete-orphan")


class ProjectWeeklyMemberAllocation(Base):
    __tablename__ = "project_weekly_member_allocation"
    __table_args__ = (
        UniqueConstraint("project_weekly_status_id", "user_id", "weekday", name="uq_status_user_weekday"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_weekly_status_id: Mapped[int] = mapped_column(ForeignKey("project_weekly_status.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)  # 1=周一 ... 7=周日
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    status_record = relationship("ProjectWeeklyStatus", back_populates="allocations")
    user = relationship("User", backref="weekly_allocations")
