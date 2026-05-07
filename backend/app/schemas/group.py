from pydantic import BaseModel, ConfigDict


class GroupBase(BaseModel):
    name: str
    room: str | None = None


class GroupCreate(GroupBase):
    pass


class GroupUpdate(BaseModel):
    name: str | None = None
    room: str | None = None


class GroupResponse(GroupBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
