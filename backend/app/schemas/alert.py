from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.models.alert import AlertStatus


class AlertBase(BaseModel):
    alert_type: str
    alert_level: str | None = "yellow"
    related_entity_type: str
    related_entity_id: str
    message: str


class AlertResponse(AlertBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AlertResolveResponse(BaseModel):
    status: str
    resolved_at: datetime
