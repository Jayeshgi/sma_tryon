"""
Configuration management using pydantic-settings.
Loads settings from .env file and environment variables.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    # Hugging Face API Token (Free)
    HF_TOKEN: str = ""
    
    # Gemini API Key
    GEMINI_API_KEY: str = ""
    
    # Replicate API (Legacy)
    REPLICATE_API_TOKEN: str = ""
    
    # The virtual try-on model on Replicate
    # IDM-VTON: https://replicate.com/cuuupid/idm-vton
    TRYON_MODEL: str = "cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985"
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # File storage paths
    UPLOAD_DIR: str = "uploads"
    RESULTS_DIR: str = "results"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
