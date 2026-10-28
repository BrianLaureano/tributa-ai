"""Configuração via ambiente (.env opcional)."""
from __future__ import annotations

import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass  # dotenv é opcional

# CORS: libera o front local e o GitHub Pages por padrão.
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,"
    "https://brianlaureano.github.io",
).split(",")

HAS_LLM_KEY = bool(os.getenv("ANTHROPIC_API_KEY", "").strip())
