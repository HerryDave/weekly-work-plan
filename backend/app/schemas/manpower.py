from datetime import datetime, date
from pydantic import BaseModel, ConfigDict


class ManpowerRegistrationBase(BaseModel):
    project_id: int
    team_id: int
    registered_man_days: float
    notes: str | None = None


class ManpowerRegistrationCreate(ManpowerRegistrationBase):
    pass


class ManpowerRegistrationUpdate(BaseModel):
    registered_man_days: float | None = None
    notes: str | None = None


class ManpowerRegistrationResponse(ManpowerRegistrationBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    created_by: int
    approved_by: int | None = None
    approved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # 关联字段
    project_name: str | None = None
    team_name: str | None = None
    created_by_real_name: str | None = None
    approved_by_real_name: str | None = None
