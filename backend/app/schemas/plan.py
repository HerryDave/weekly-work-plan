from datetime import datetime, date
from pydantic import BaseModel, ConfigDict


class WeeklyPlanBase(BaseModel):
    user_id: int
    project_id: int
    week_start_date: date
    planned_man_days: float = 0.0


class WeeklyPlanCreate(WeeklyPlanBase):
    pass


class WeeklyPlanUpdate(BaseModel):
    planned_man_days: float


class WeeklyPlanResponse(WeeklyPlanBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class WeeklyPlanBatchItem(BaseModel):
    id: int | None = None  # 有值则更新，无值则创建
    user_id: int
    project_id: int
    week_start_date: date
    planned_man_days: float


class WeeklyPlanBatchRequest(BaseModel):
    plans: list[WeeklyPlanBatchItem]
