"""
Pydantic models for request/response validation.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ─── Request Models ───────────────────────────────────────────────

class TryOnRequest(BaseModel):
    """Request body for the /try-on endpoint."""
    profile_image_base64: str = Field(
        ..., description="Base64-encoded user photo (data:image/...;base64,...)"
    )
    product_image_url: str = Field(
        ..., description="URL of the product/garment image to try on"
    )
    product_title: Optional[str] = Field(
        None, description="Optional product name for history tracking"
    )
    hue_rotation: int = Field(
        0, description="Hue rotation in degrees for Magic Color Swap (0-360)"
    )


class ProfileUploadRequest(BaseModel):
    """Request body for uploading a profile image via base64."""
    image_base64: str = Field(
        ..., description="Base64-encoded user photo"
    )


# ─── Response Models ─────────────────────────────────────────────

class TryOnResponse(BaseModel):
    """Response from the /try-on endpoint."""
    success: bool
    result_url: Optional[str] = None
    result_id: Optional[str] = None
    error: Optional[str] = None


class HistoryItem(BaseModel):
    """A single try-on history entry."""
    id: str
    product_image_url: str
    product_title: Optional[str] = None
    result_url: str
    created_at: str


class HistoryResponse(BaseModel):
    """Response from the /history endpoint."""
    items: list[HistoryItem]
    total: int


class HealthResponse(BaseModel):
    """Response from the / health check."""
    status: str
    version: str
    ai_configured: bool


class StyleAdvisorRequest(BaseModel):
    result_url: str = Field(..., description="The URL of the generated try-on image")
    product_title: str = Field(..., description="The name of the product")


class StyleAdvisorResponse(BaseModel):
    success: bool
    advice: Optional[str] = None
    error: Optional[str] = None
