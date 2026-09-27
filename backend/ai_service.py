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
    
    print(f"[AI] Starting free try-on generation via Hugging Face...")
    import sys; sys.stdout.flush()
    print(f"[AI] Profile: {profile_path}")
    print(f"[AI] Product: {product_path}")
    
    def _run_gradio():
        """Run the blocking Gradio API call in a thread."""
        hf_token = settings.HF_TOKEN if settings.HF_TOKEN else None
        from gradio_client import Client, handle_file
        client = Client("fashn-ai/fashn-vton-1.5", token=hf_token)
        
        result = client.predict(
            person_image=handle_file(profile_path),
            garment_image=handle_file(product_path),
            category="tops",
            garment_photo_type="flat-lay", 
            num_timesteps=50,      # MAX QUALITY (Slower generation)
            guidance_scale=2.5,
            seed=-1,
            segmentation_free=True,
            api_name="/try_on"
        )
        return result
    
    try:
        # Run in thread so we don't block the async event loop
        output = await asyncio.to_thread(_run_gradio)
    except Exception as e:
        if "IndexError" in str(e):
            raise Exception("AI failed to detect a human body in your profile picture. Please upload a clear photo of yourself.")
        raise
    
    # fashn-vton returns a string path directly or dict depending on gradio version.
    # We can just extract it gracefully.
    temp_result_path = output
    if isinstance(output, dict) and "path" in output:
        temp_result_path = output["path"]
    elif isinstance(output, tuple) or isinstance(output, list):
        temp_result_path = output[0]
    if not temp_result_path:
        raise Exception("AI did not return an image.")
        
    # Move the result to our results directory
    result_filename = f"result_{uuid.uuid4().hex}.png"
    final_result_path = os.path.join(settings.RESULTS_DIR, result_filename)
    
    import shutil
    shutil.copy2(temp_result_path, final_result_path)
    
    # Generate the local URL for the frontend
    # E.g., http://localhost:8000/results/result_abcd.png
    result_url = f"http://localhost:{settings.PORT}/results/{result_filename}"
    
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
            model="gemini-3.5-flash",
            contents=[
                prompt, 
                types.Part.from_bytes(data=image_bytes, mime_type="image/png")
            ]
        )
        return response.text
    except Exception as e:
        print(f"[AI] Gemini Error: {str(e)}")
        return f"Sorry, I couldn't generate fashion advice right now. Error: {str(e)}"
