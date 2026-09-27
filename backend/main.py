"""
AI Virtual Try-On — FastAPI Backend
====================================
Serves as the secure bridge between the Chrome Extension and the
Replicate AI model (IDM-VTON).

Run with: python main.py
Docs at:  http://localhost:8000/docs
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import asyncio
import os

from config import get_settings
from models import (
    TryOnRequest, TryOnResponse,
    HistoryResponse,
    HealthResponse,
)
import ai_service

settings = get_settings()

# Ensure storage directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.RESULTS_DIR, exist_ok=True)

app = FastAPI(
    title="AI Virtual Try-On API",
    description="Backend API for the AI Virtual Try-On Chrome Extension",
    version="1.0.0",
)

# Allow Chrome Extension to communicate with the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to the extension origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated result images as static files
app.mount("/results", StaticFiles(directory=settings.RESULTS_DIR), name="results")

# Serve the AR Mirror HTML (Bypasses Extension MV3 CSP limits)
public_dir = os.path.join(os.path.dirname(__file__), "public")
if os.path.exists(public_dir):
    app.mount("/ar", StaticFiles(directory=public_dir, html=True), name="ar_mirror")


# ─── Health Check ─────────────────────────────────────────────────

@app.get("/", response_model=HealthResponse, tags=["Health"])
def health_check():
    """Check if the backend is running and properly configured."""
    return HealthResponse(
        status="running",
        version="1.0.0",
        ai_configured=bool(settings.REPLICATE_API_TOKEN and settings.REPLICATE_API_TOKEN != "r8_YOUR_TOKEN_HERE"),
    )


# ─── Try-On Endpoint ─────────────────────────────────────────────

@app.post("/try-on", response_model=TryOnResponse, tags=["Try-On"])
async def process_try_on(request: TryOnRequest):
    """
    Accept a user profile image (base64) and a product image URL,
    run the AI virtual try-on model, and return the result.
    """
    try:
        result = await ai_service.generate_tryon(
            profile_image_base64=request.profile_image_base64,
            product_image_url=request.product_image_url,
            product_title=request.product_title,
        )
        return TryOnResponse(**result)

    except ValueError as ve:
        # Config errors (missing API key, etc.)
        return TryOnResponse(success=False, error=str(ve))

    except Exception as e:
        print(f"[ERROR] Try-on failed: {e}")
        return TryOnResponse(
            success=False,
            error=f"AI generation failed: {str(e)}"
        )


# ─── History Endpoint ────────────────────────────────────────────

@app.get("/history", response_model=HistoryResponse, tags=["History"])
def get_history(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    """Return the user's recent try-on history."""
    data = ai_service.get_history(limit=limit, offset=offset)
    return HistoryResponse(**data)


# ─── Style Advisor Endpoint ──────────────────────────────────────

from models import StyleAdvisorRequest, StyleAdvisorResponse

@app.post("/style-advisor", response_model=StyleAdvisorResponse, tags=["AI"])
async def style_advisor(request: StyleAdvisorRequest):
    """Get personalized fashion advice using Gemini Vision."""
    try:
        advice = await ai_service.get_style_advice(request.result_url, request.product_title)
        success = not advice.startswith("I'd love to give you styling advice, but you need to add your GEMINI_API_KEY")
        return StyleAdvisorResponse(success=success, advice=advice)
    except Exception as e:
        return StyleAdvisorResponse(success=False, error=str(e))


# ─── Run ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    
    print("=" * 50)
    print("  AI Virtual Try-On Backend")
    print("=" * 50)
    print(f"  Server:  http://localhost:{settings.PORT}")
    print(f"  Docs:    http://localhost:{settings.PORT}/docs")
    ai_status = "CONFIGURED" if settings.REPLICATE_API_TOKEN and settings.REPLICATE_API_TOKEN != 'r8_YOUR_TOKEN_HERE' else "NOT SET (copy .env.example to .env)"
    print(f"  AI Key:  {ai_status}")
    print("=" * 50)
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
