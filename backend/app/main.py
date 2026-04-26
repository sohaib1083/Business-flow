"""FastAPI application entry-point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("businessflow")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="BusinessFlow API",
        version="0.1.0",
        description="Query-driven, self-learning natural-language analytics.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    @app.get("/", tags=["meta"])
    def root() -> dict[str, str]:
        return {"service": "businessflow", "version": "0.1.0", "docs": "/docs"}

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    log.info("BusinessFlow backend ready (model=%s)", settings.groq_model)
    return app


app = create_app()
