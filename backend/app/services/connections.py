"""Datasource connection registry.

Manages the customer's database connections (SQLite / PostgreSQL / MySQL).
Persists definitions through the `storage` adapter (Firebase first, local
JSON fallback) so that connections survive restarts. Passwords are encrypted
at rest using Fernet (AES-128-CBC + HMAC).

The built-in `demo` connection is synthesised at runtime and never persisted —
it always points at the seeded SQLite demo database. Users may add additional
connections via the API.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Literal

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings
from app.services import storage

log = logging.getLogger(__name__)

Dialect = Literal["sqlite", "postgresql", "mysql"]
SUPPORTED_DIALECTS: tuple[str, ...] = ("sqlite", "postgresql", "mysql")

DEMO_CONNECTION_ID = "demo"
_GLOBAL_WORKSPACE = "_system"  # connections are global, not per-workspace
_SLUG_RE = re.compile(r"[^a-z0-9_-]+")

# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------


def _key_path():
    return get_settings().local_store_path.parent / ".encryption.key"


def _get_fernet() -> Fernet:
    path = _key_path()
    if not path.exists():
        path.write_bytes(Fernet.generate_key())
        log.info("connections: generated new encryption key at %s", path)
    return Fernet(path.read_bytes())


def _encrypt(value: str) -> str:
    if not value:
        return ""
    return _get_fernet().encrypt(value.encode("utf-8")).decode("ascii")


def _decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _get_fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        log.error("connections: failed to decrypt password (key changed?)")
        return ""


# ---------------------------------------------------------------------------
# Connection record helpers
# ---------------------------------------------------------------------------


def _slugify(value: str) -> str:
    slug = _SLUG_RE.sub("-", value.strip().lower()).strip("-")
    return slug or "conn"


def _demo_record() -> dict[str, Any]:
    settings = get_settings()
    return {
        "id": DEMO_CONNECTION_ID,
        "name": "Demo (SQLite)",
        "dialect": "sqlite",
        "host": "",
        "port": 0,
        "database": settings.demo_db_path.as_posix(),
        "username": "",
        "ssl": False,
        "is_demo": True,
        "created_at": "built-in",
        "updated_at": "built-in",
    }


def _public(record: dict[str, Any]) -> dict[str, Any]:
    """Strip secrets before returning to API callers."""
    out = {k: v for k, v in record.items() if k != "password_encrypted"}
    out["has_password"] = bool(record.get("password_encrypted"))
    return out


def build_url(record: dict[str, Any]) -> str:
    """Construct a SQLAlchemy connection URL from a stored record."""
    dialect = record["dialect"]
    if dialect == "sqlite":
        return f"sqlite:///{record['database']}"

    user = record.get("username") or ""
    password = _decrypt(record.get("password_encrypted", ""))
    host = record.get("host") or "localhost"
    port = int(record.get("port") or (5432 if dialect == "postgresql" else 3306))
    db = record.get("database") or ""

    # URL-encode user/password to handle special chars
    from urllib.parse import quote_plus

    auth = ""
    if user:
        auth = quote_plus(user)
        if password:
            auth += f":{quote_plus(password)}"
        auth += "@"

    if dialect == "postgresql":
        driver = "postgresql+psycopg2"
    elif dialect == "mysql":
        driver = "mysql+pymysql"
    else:  # pragma: no cover — guarded above
        raise ValueError(f"Unsupported dialect: {dialect}")

    url = f"{driver}://{auth}{host}:{port}/{db}"
    if record.get("ssl"):
        sep = "&" if "?" in url else "?"
        if dialect == "postgresql":
            url += f"{sep}sslmode=require"
        else:
            url += f"{sep}ssl=true"
    return url


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_connection(connection_id: str) -> dict[str, Any] | None:
    """Return the full (decrypted-on-demand) connection record or None."""
    if not connection_id or connection_id == DEMO_CONNECTION_ID:
        return _demo_record()
    for rec in storage.list_connections(_GLOBAL_WORKSPACE):
        if rec.get("id") == connection_id:
            return rec
    return None


def list_connections() -> list[dict[str, Any]]:
    """List all connections (built-in demo + user-defined), passwords redacted."""
    out = [_public(_demo_record())]
    for rec in storage.list_connections(_GLOBAL_WORKSPACE):
        out.append(_public(rec))
    return out


def create_connection(
    *,
    name: str,
    dialect: str,
    database: str,
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    ssl: bool = False,
    connection_id: str | None = None,
) -> dict[str, Any]:
    if dialect not in SUPPORTED_DIALECTS:
        raise ValueError(
            f"Unsupported dialect '{dialect}'. Choose: {', '.join(SUPPORTED_DIALECTS)}"
        )
    if not name.strip():
        raise ValueError("name is required")
    if not database.strip():
        raise ValueError("database is required")
    if dialect != "sqlite":
        if not host.strip():
            raise ValueError(f"host is required for {dialect}")

    cid = _slugify(connection_id or name)
    if cid == DEMO_CONNECTION_ID:
        raise ValueError("'demo' is reserved for the built-in SQLite database")

    now = datetime.now(timezone.utc).isoformat()
    record: dict[str, Any] = {
        "id": cid,
        "name": name.strip(),
        "dialect": dialect,
        "host": host.strip(),
        "port": int(port) if port else (5432 if dialect == "postgresql" else 3306 if dialect == "mysql" else 0),
        "database": database.strip(),
        "username": username.strip(),
        "password_encrypted": _encrypt(password) if password else "",
        "ssl": bool(ssl),
        "is_demo": False,
        "created_at": now,
        "updated_at": now,
    }
    storage.upsert_connection(_GLOBAL_WORKSPACE, record)
    return _public(record)


def delete_connection(connection_id: str) -> bool:
    if connection_id == DEMO_CONNECTION_ID:
        raise ValueError("Cannot delete the built-in demo connection")
    return storage.delete_connection(_GLOBAL_WORKSPACE, connection_id)


def test_connection(record: dict[str, Any]) -> dict[str, Any]:
    """Open a short connection and run SELECT 1 to verify reachability."""
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import SQLAlchemyError

    try:
        url = build_url(record)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    try:
        engine = create_engine(url, future=True, connect_args={"connect_timeout": 5} if record["dialect"] != "sqlite" else {})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        return {"ok": True, "dialect": record["dialect"]}
    except SQLAlchemyError as exc:
        return {"ok": False, "error": str(exc.orig if hasattr(exc, "orig") and exc.orig else exc)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
