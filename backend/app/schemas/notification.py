from datetime import datetime
from pydantic import BaseModel, ConfigDict


class NotificationBase(BaseModel):
    type: str
    title: str
    content: str
    related_entity_type: str | None = None
    related_entity_id: int | None = None


class NotificationCreate(NotificationBase):
    user_id: int


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    type: str
    title: str
    content: str
    related_entity_type: str | None
    related_entity_id: int | None
    is_read: bool
    created_at: datetime
    updated_at: datetime
