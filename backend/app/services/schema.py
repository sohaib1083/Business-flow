"""Schema introspection per database connection.

Each connection_id has its own SQLAlchemy engine and an in-memory cache of
the introspected schema. The output is small enough to inline in an LLM
prompt. Caches can be invalidated when a connection is created/updated/
deleted.
"""

from __future__ import annotations

import datetime as _dt
import decimal as _dec
import logging
import threading
import uuid as _uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.services import connections

log = logging.getLogger(__name__)


def _json_safe(value: Any) -> Any:
    """Coerce DB-driver native types into JSON-serialisable primitives."""
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


@dataclass
class ColumnInfo:
    name: str
    type: str
    nullable: bool


@dataclass
class TableInfo:
    name: str
    columns: list[ColumnInfo] = field(default_factory=list)
    primary_keys: list[str] = field(default_factory=list)
    foreign_keys: list[dict[str, Any]] = field(default_factory=list)
    sample_rows: list[dict[str, Any]] = field(default_factory=list)
    row_count: int | None = None

    def to_prompt_dict(self) -> dict[str, Any]:
        return {
            "table": self.name,
            "row_count": self.row_count,
            "columns": [
                {"name": c.name, "type": c.type, "nullable": c.nullable}
                for c in self.columns
            ],
            "primary_keys": self.primary_keys,
            "foreign_keys": self.foreign_keys,
            "sample_rows": self.sample_rows[:3],
        }


_engine_cache: dict[str, Engine] = {}
_schema_cache: dict[str, dict[str, TableInfo]] = {}
_cache_lock = threading.Lock()


def get_engine(connection_id: str = connections.DEMO_CONNECTION_ID) -> Engine:
    with _cache_lock:
        if connection_id in _engine_cache:
            return _engine_cache[connection_id]
        record = connections.get_connection(connection_id)
        if not record:
            raise ValueError(f"Unknown connection: {connection_id}")
        url = connections.build_url(record)
        engine = create_engine(url, future=True, pool_pre_ping=True)
        _engine_cache[connection_id] = engine
        return engine


def get_dialect(connection_id: str = connections.DEMO_CONNECTION_ID) -> str:
    record = connections.get_connection(connection_id)
    return record["dialect"] if record else "sqlite"


def get_schema(connection_id: str = connections.DEMO_CONNECTION_ID) -> dict[str, TableInfo]:
    """Introspect the connected DB and return a table->TableInfo dict (cached)."""
    with _cache_lock:
        if connection_id in _schema_cache:
            return _schema_cache[connection_id]

    engine = get_engine(connection_id)
    insp = inspect(engine)
    schema: dict[str, TableInfo] = {}

    with engine.connect() as conn:
        for table_name in insp.get_table_names():
            ti = TableInfo(name=table_name)
            for col in insp.get_columns(table_name):
                ti.columns.append(
                    ColumnInfo(
                        name=col["name"],
                        type=str(col["type"]),
                        nullable=bool(col.get("nullable", True)),
                    )
                )
            ti.primary_keys = list(
                insp.get_pk_constraint(table_name).get("constrained_columns", []) or []
            )
            for fk in insp.get_foreign_keys(table_name):
                ti.foreign_keys.append(
                    {
                        "columns": fk.get("constrained_columns", []),
                        "ref_table": fk.get("referred_table"),
                        "ref_columns": fk.get("referred_columns", []),
                    }
                )

            qname = _quote_ident(engine, table_name)
            try:
                ti.row_count = conn.execute(
                    text(f"SELECT COUNT(*) FROM {qname}")
                ).scalar_one()
            except Exception:
                ti.row_count = None

            try:
                rows = conn.execute(
                    text(f"SELECT * FROM {qname} LIMIT 3")
                ).mappings().all()
                ti.sample_rows = [
                    {k: _json_safe(v) for k, v in dict(r).items()} for r in rows
                ]
            except Exception:
                ti.sample_rows = []

            schema[table_name] = ti

    with _cache_lock:
        _schema_cache[connection_id] = schema
    return schema


def schema_for_prompt(
    connection_id: str = connections.DEMO_CONNECTION_ID,
    tables: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Render the schema as a compact list of dicts for use inside a prompt."""
    schema = get_schema(connection_id)
    if tables:
        return [schema[t].to_prompt_dict() for t in tables if t in schema]
    return [t.to_prompt_dict() for t in schema.values()]


def invalidate(connection_id: str | None = None) -> None:
    """Clear cached engine/schema for one connection (or all)."""
    with _cache_lock:
        if connection_id is None:
            for eng in _engine_cache.values():
                try:
                    eng.dispose()
                except Exception:
                    pass
            _engine_cache.clear()
            _schema_cache.clear()
        else:
            eng = _engine_cache.pop(connection_id, None)
            if eng is not None:
                try:
                    eng.dispose()
                except Exception:
                    pass
            _schema_cache.pop(connection_id, None)


def _quote_ident(engine: Engine, ident: str) -> str:
    return engine.dialect.identifier_preparer.quote(ident)
