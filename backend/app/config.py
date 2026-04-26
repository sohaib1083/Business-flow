"""Application configuration loaded from the repo-root `.env` file.

We intentionally read from the repo root so the same `.env` is shared between
the FastAPI backend and the Next.js frontend.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]

# Load the repo-root `.env` once, before Settings is instantiated.
load_dotenv(REPO_ROOT / ".env", override=False)


class Settings(BaseSettings):
    """Strongly-typed runtime settings."""

    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        extra="ignore",
        case_sensitive=False,
    )

    # --- Groq LLM ---
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.3-70b-versatile", alias="GROQ_MODEL")

    # --- Firebase (server) ---
    firebase_service_account_json: str = Field(
        default="", alias="FIREBASE_SERVICE_ACCOUNT_JSON"
    )
    firebase_project_id: str = Field(
        default="", alias="NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    )

    # --- Demo database (the customer DB we query) ---
    demo_db_path: Path = BACKEND_ROOT / "demo.db"

    # --- Local fallback storage (used when Firebase is unavailable) ---
    local_store_path: Path = BACKEND_ROOT / "local_store.json"

    # --- Safety ---
    max_rows_returned: int = 10_000
    query_timeout_seconds: int = 30

    # --- CORS ---
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    @property
    def demo_db_url(self) -> str:
        return f"sqlite:///{self.demo_db_path.as_posix()}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
