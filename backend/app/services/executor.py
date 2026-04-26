"""Step 8: Query execution.

Runs validated SQL against the connected (demo) database with a hard row cap.
Returns columns, rows, and execution time. We deliberately catch all DB errors
and surface them as a structured result rather than letting them crash the
request handler.
"""
from __future__ import annotations

import datetime as _dt
import decimal as _dec
import logging
import time
import uuid as _uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.services import connections
from app.services.schema import get_engine

log = logging.getLogger(__name__)


def execute(sql: str, connection_id: str = connections.DEMO_CONNECTION_ID) -> dict[str, Any]:
    settings = get_settings()
    started = time.perf_counter()
    engine = get_engine(connection_id)
    try:
        with engine.connect() as conn:
            cursor = conn.execute(text(sql))
            columns = list(cursor.keys())
            rows_raw = cursor.fetchmany(settings.max_rows_returned)
            rows = [
                {col: _coerce(value) for col, value in zip(columns, row)}
                for row in rows_raw
            ]
        ms = int((time.perf_counter() - started) * 1000)
        log.info("sql executed in %sms, %s rows", ms, len(rows))
        return {
            "ok": True,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "execution_ms": ms,
        }
    except SQLAlchemyError as exc:
        ms = int((time.perf_counter() - started) * 1000)
        log.warning("sql failed in %sms: %s", ms, exc)
        return {
            "ok": False,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "execution_ms": ms,
            "error": str(exc.orig if hasattr(exc, "orig") and exc.orig else exc),
        }


def _coerce(value: Any) -> Any:
    """Convert non-JSON-friendly DB types (Decimal, date, UUID, bytes...) to
    JSON-serialisable primitives. Decimals become floats so charts / sorts
    behave numerically."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, _dec.Decimal):
        return float(value)
    if isinstance(value, (_dt.datetime, _dt.date, _dt.time)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        try:
            return bytes(value).decode("utf-8", errors="replace")
        except Exception:
            return str(value)
    if isinstance(value, _uuid.UUID):
        return str(value)
    return str(value)
