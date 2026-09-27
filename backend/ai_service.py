"""
AI service layer — handles all communication with the Replicate API
for virtual try-on image generation.
"""
import httpx
import asyncio
import base64
import time
import os
import uuid
import json
import shutil
from datetime import datetime
from config import get_settings
from gradio_client import Client, handle_file

settings = get_settings()

# In-memory history store
_history: list[dict] = []


async def download_image_to_file(url: str, directory: str) -> str:
    """Download an image from a URL and save it to disk."""
    os.makedirs(directory, exist_ok=True)
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        
        ext = "jpg"
        content_type = response.headers.get("content-type", "")
        if "png" in content_type:
            ext = "png"
            
        filename = f"prod_{uuid.uuid4().hex}.{ext}"
        filepath = os.path.join(directory, filename)
        
        with open(filepath, "wb") as f:
            f.write(response.content)
            
        return filepath


def save_base64_image(base64_str: str, directory: str) -> str:
    """Save a base64 data URI to disk and return the file path."""
    os.makedirs(directory, exist_ok=True)
    
    if "," in base64_str:
        header, data = base64_str.split(",", 1)
    else:
        data = base64_str
    
    ext = "png"
    if "jpeg" in base64_str or "jpg" in base64_str:
        ext = "jpg"
    
    filename = f"human_{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(directory, filename)
    
    with open(filepath, "wb") as f:
        f.write(base64.b64decode(data))
    
    return filepath


async def generate_tryon(
    profile_image_base64: str,
    product_image_url: str,
    product_title: str | None = None
) -> dict:
    """
    Run the virtual try-on AI model using 100% Free Hugging Face Spaces.
    """
    # 1. Save profile image to disk
    profile_path = save_base64_image(profile_image_base64, settings.UPLOAD_DIR)
    
    # 2. Save product image to disk (handle both URL and Base64)
    if product_image_url.startswith("data:image"):
        product_path = save_base64_image(product_image_url, settings.UPLOAD_DIR)
    else:
        product_path = await download_image_to_file(product_image_url, settings.UPLOAD_DIR)
    
    print(f"[AI] Starting try-on generation via Replicate...")
    import sys; sys.stdout.flush()
    print(f"[AI] Profile: {profile_path}")
    print(f"[AI] Product: {product_path}")
    
    def _run_replicate():
        """Run the Replicate API call in a thread."""
        import replicate
        
        replicate_key = settings.REPLICATE_API_TOKEN
        if not replicate_key:
            raise Exception("Hugging Face quota exceeded, and no REPLICATE_API_TOKEN found in .env as a fallback.")
            
        client = replicate.Client(api_token=replicate_key)
        
        # cuuupid/idm-vton model on Replicate
        input_args = {
            "crop": False,
            "seed": 42,
            "steps": 25,
            "category": "upper_body",
            "force_dc": False,
            "human_image": open(profile_path, "rb"),
            "garm_img": open(product_path, "rb"),
            "garment_des": "product"
        }
        
        output = client.run(settings.TRYON_MODEL, input=input_args)
        # Replicate usually returns a list or a URL string
        return output
    
    try:
        # Run in thread so we don't block the async event loop
        output = await asyncio.to_thread(_run_replicate)
    except Exception as e:
        raise Exception(f"AI generation failed: {str(e)}")
    
    # Replicate returns a URL (or list of URLs)
    temp_result_url = output
    if isinstance(output, list) and len(output) > 0:
        temp_result_url = output[0]
        
    if not temp_result_url:
        raise Exception("AI did not return an image.")
        
    # Download the result from Replicate to our local results directory
    result_filename = f"result_{uuid.uuid4().hex}.png"
    final_result_path = os.path.join(settings.RESULTS_DIR, result_filename)
    
    # Download it
    async with httpx.AsyncClient() as client:
        res = await client.get(temp_result_url)
        with open(final_result_path, "wb") as f:
            f.write(res.content)
    
    # E.g., https://sma-tryon.onrender.com/results/result_abcd.png
    result_url = f"https://sma-tryon.onrender.com/results/{result_filename}"
    
    print(f"[AI] Generation complete: {result_url}")
    sys.stdout.flush()
    
    # Save to history
    result_id = uuid.uuid4().hex[:12]
    history_entry = {
        "id": result_id,
        "product_image_url": product_image_url,
        "product_title": product_title,
        "result_url": result_url,
        "created_at": datetime.now().isoformat()
    }
    _history.insert(0, history_entry)
    
    if len(_history) > 50:
        _history.pop()
    
    return {
        "success": True,
        "result_url": result_url,
        "result_id": result_id
    }


def get_history(limit: int = 20, offset: int = 0) -> dict:
    sliced = _history[offset:offset + limit]
    return {
        "items": sliced,
        "total": len(_history)
    }

async def get_style_advice(result_url: str, product_title: str) -> str:
    """Analyze the try-on result using Gemini Vision and return styling advice."""
    gemini_key = settings.GEMINI_API_KEY
    if not gemini_key or gemini_key == "put_your_key_here":
        return "I'd love to give you styling advice, but you need to add your GEMINI_API_KEY to the .env file first!"
        
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=gemini_key)
        
        # Extract filename from URL (e.g. http://localhost:8000/results/file.png)
        filename = result_url.split("/")[-1]
        filepath = os.path.join(settings.RESULTS_DIR, filename)
        
        if not os.path.exists(filepath):
            return "Could not find the image to analyze."
            
        # Read the image file directly
        with open(filepath, "rb") as f:
            image_bytes = f.read()
            
        prompt = f"You are a professional fashion advisor. Look at this photo of me wearing the '{product_title}'. Does this outfit suit my skin tone and body type? What kind of pants, shoes, or accessories should I pair this with to complete the look? Be concise and friendly."
        
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=[
                prompt, 
                types.Part.from_bytes(data=image_bytes, mime_type="image/png")
            ]
        )
        return response.text
    except Exception as e:
        print(f"[AI] Gemini Error: {str(e)}")
        return f"Sorry, I couldn't generate fashion advice right now. Error: {str(e)}"
