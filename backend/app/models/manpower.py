from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, DateTime, Float, ForeignKey, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class RegistrationStatus(str, enum.Enum):
    pending = "pending"    # 待审批
    approved = "approved"  # 已批准
    rejected = "rejected"  # 已驳回


class ManpowerRegistration(Base):
    __tablename__ = "manpower_registrations"
    __table_args__ = (
        UniqueConstraint("project_id", "team_id", name="uq_project_team"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), nullable=False)
    registered_man_days: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[RegistrationStatus] = mapped_column(String(20), default=RegistrationStatus.pending)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="registrations")
    team = relationship("Group", backref="manpower_registrations")
    creator = relationship("User", foreign_keys=[created_by], backref="created_registrations")
    approver = relationship("User", foreign_keys=[approved_by])
