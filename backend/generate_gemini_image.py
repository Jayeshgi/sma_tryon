import os
from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image
import io

# Load environment variables from .env
load_dotenv()

# Get the API key
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY environment variable not set. Please ensure it is in your .env file.")

client = genai.Client(api_key=api_key)
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents="A highly detailed cinematic portrait, dramatic neon lighting, 8k resolution, sharp focus",
    config=types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
    ),
)

for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        image = Image.open(io.BytesIO(part.inline_data.data))
        image.save("generated_image.png")
        print("Image saved successfully to generated_image.png!")
