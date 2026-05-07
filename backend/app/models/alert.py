from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, DateTime, Float, func, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
import enum


class AlertStatus(str, enum.Enum):
    active = "active"
    resolved = "resolved"


class AlertLevel(str, enum.Enum):
    yellow = "yellow"
    red = "red"


class AlertType(str, enum.Enum):
    # 需求规格预警
    W01_PROJECT_MANPOWER_SHORTAGE = "W01"  # 项目周人力不足
    W02_PERSONAL_OVERLOAD = "W02"           # 个人过度负载
    W04_CONSECUTIVE_VARIANCE = "W04"       # 连续偏差过大


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    alert_type: Mapped[str] = mapped_column(String(20), nullable=False)
    alert_level: Mapped[str] = mapped_column(String(10), default="yellow")
    related_entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # project / user / weekly_plan
    related_entity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[AlertStatus] = mapped_column(String(20), default=AlertStatus.active)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
