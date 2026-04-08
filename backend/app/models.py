from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class Artwork(BaseModel):
    id: str
    title: str
    artist: Optional[str] = None
    image_url: Optional[str] = None
    detail_url: Optional[str] = None
    location: Optional[str] = None
    gallery: Optional[str] = None
    department: Optional[str] = None
    culture: Optional[str] = None
    period: Optional[str] = None
    medium: Optional[str] = None
    object_date: Optional[str] = None
    style_tags: List[str] = Field(default_factory=list)
    story_tags: List[str] = Field(default_factory=list)
    is_on_view: Optional[bool] = None


class UserInterestRequest(BaseModel):
    free_text: str = ""
    keywords: List[str] = Field(default_factory=list)
    max_stops: int = Field(default=8, ge=1, le=30)
    walk_preference: Literal["closer", "further"] = "closer"


class RouteStop(BaseModel):
    order: int
    artwork: Artwork
    reason: str


class RouteResponse(BaseModel):
    interests_detected: List[str]
    route: List[RouteStop]
