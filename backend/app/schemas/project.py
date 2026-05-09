from datetime import date, datetime
from pydantic import BaseModel, ConfigDict


class ProjectBase(BaseModel):
    name: str
    description: str | None = None
    type: str = "internal"  # internal=流量项目, cross=重点项目
    group_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None


class ProjectCreate(ProjectBase):
    owner_user_id: int


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    type: str | None = None
    group_id: int | None = None
    status: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    st_progress: float | None = None  # ST进度 0-100
    uat_progress: float | None = None  # UAT进度 0-100


class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    owner_user_id: int
    owner_real_name: str | None = None
    group_name: str | None = None
    member_count: int = 0
    target_man_days: float = 0.0  # 由已批准报备汇总得出
    actual_man_days: float = 0.0
    st_progress: float = 0.0  # ST进度 0-100
    uat_progress: float = 0.0  # UAT进度 0-100
    progress: float = 0.0  # 实际/目标 百分比


class ProjectMemberBase(BaseModel):
    user_id: int


class ProjectMemberCreate(ProjectMemberBase):
    pass


class ProjectMemberResponse(ProjectMemberBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    joined_at: datetime


class ProjectMergeRequest(BaseModel):
    source_project_id: int
    target_project_id: int


class ProjectMergePreviewResponse(BaseModel):
    source_project_name: str
    target_project_name: str
    members_count: int
    plans_count: int
    duplicate_plans_count: int
    registrations_count: int
    duplicate_registrations_count: int
    efforts_count: int


class ProjectWeeklyDemandBase(BaseModel):
    week_start_date: date
    required_man_days: float


class ProjectWeeklyDemandCreate(ProjectWeeklyDemandBase):
    pass


class ProjectWeeklyDemandResponse(ProjectWeeklyDemandBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
