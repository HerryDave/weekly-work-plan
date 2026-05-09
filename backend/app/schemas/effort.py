from datetime import datetime, date
from pydantic import BaseModel, ConfigDict


class ActualEffortBase(BaseModel):
    user_id: int
    project_id: int
    week_start_date: date          # 周期起始日（周一）
    actual_man_days: float
    team_id: int | None = None


class ActualEffortCreate(ActualEffortBase):
    pass


class ActualEffortResponse(ActualEffortBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_by: int
    created_at: datetime
    updated_at: datetime
    # 关联字段
    username: str | None = None
    user_real_name: str | None = None
    role: str | None = None
    group_name: str | None = None
    project_name: str | None = None
    created_by_real_name: str | None = None
    week_label: str | None = None


class ActualEffortBatchItem(BaseModel):
    user_id: int
    project_id: int
    week_start_date: date          # 周期起始日（周一）
    actual_man_days: float
    team_id: int | None = None


class ActualEffortBatchRequest(BaseModel):
    efforts: list[ActualEffortBatchItem]
