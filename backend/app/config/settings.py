
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Find the project root using this file's location.
# This avoids problems when FastAPI starts from another folder.
PROJECT_ROOT = Path(__file__).resolve().parents[3]

ENV_FILE = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    # Neon PostgreSQL connection string
    DATABASE_URL: str

    # Gemini API key from the root .env file
    GEMINI_API_KEY: str = Field(
        validation_alias=AliasChoices(
            "Gemini_studio_Key",
            "GEMINI_API_KEY",
        )
    )

    # Always load the same .env file, regardless of working directory.
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Create application settings
settings = Settings()
