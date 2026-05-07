from datetime import datetime, date
from sqlalchemy import DateTime, Date, Float, ForeignKey, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ActualEffort(Base):
    __tablename__ = "actual_efforts"
    __table_args__ = (
        UniqueConstraint("user_id", "project_id", "week_start_date", name="uq_user_project_week"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)  # 周期起始日（周一）
    actual_man_days: Mapped[float] = mapped_column(Float, default=0.0)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("groups.id"), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", foreign_keys=[user_id], backref="actual_efforts")
    project = relationship("Project", backref="actual_efforts")
    creator = relationship("User", foreign_keys=[created_by])
    team = relationship("Group", backref="efforts")
