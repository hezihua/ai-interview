"""FastAPI / workbench environment helpers."""

from __future__ import annotations

import os

_DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000,http://localhost:5173,"
    "http://127.0.0.1:3000,http://127.0.0.1:5173"
)


def cors_origins_from_env() -> tuple[str, ...]:
    cors_raw = os.getenv("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS)
    return tuple(origin.strip() for origin in cors_raw.split(",") if origin.strip())
