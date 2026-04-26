"""Step 5–6: Incremental semantic layer.

Stores learned metric definitions and join paths keyed by workspace. Each time
a query introduces a new metric (e.g. "revenue" -> SUM(orders.amount)), we
persist it via the storage adapter so the next query can reuse the definition.

This module is a thin layer over `storage` — it knows about the *shape* of
semantic objects and how to look them up by natural-language name.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services import storage

WORKSPACE_DEFAULT = "demo"


def get_known_metrics(workspace_id: str = WORKSPACE_DEFAULT) -> list[dict[str, Any]]:
    return storage.list_metrics(workspace_id)


def find_metric(name: str, workspace_id: str = WORKSPACE_DEFAULT) -> dict[str, Any] | None:
    if not name:
        return None
    target = name.strip().lower()
    for m in get_known_metrics(workspace_id):
        if m.get("name", "").strip().lower() == target:
            return m
    return None


def remember_metric(
    *,
    name: str,
    sql_fragment: str,
    definition_text: str,
    tables_used: list[str],
    workspace_id: str = WORKSPACE_DEFAULT,
) -> dict[str, Any]:
    """Persist a metric definition or bump usage if it already exists."""
    if not name or not sql_fragment:
        return {}
    existing = find_metric(name, workspace_id)
    if existing:
        existing["usage_count"] = int(existing.get("usage_count", 0)) + 1
        existing["last_used_at"] = datetime.now(timezone.utc).isoformat()
        storage.upsert_metric(workspace_id, existing)
        return existing

    record = {
        "name": name.strip().lower(),
        "sql_fragment": sql_fragment.strip(),
        "definition_text": definition_text.strip(),
        "tables_used": tables_used,
        "status": "suggested",   # admin can promote to "approved"
        "usage_count": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_used_at": datetime.now(timezone.utc).isoformat(),
    }
    storage.upsert_metric(workspace_id, record)
    return record


def approve_metric(name: str, workspace_id: str = WORKSPACE_DEFAULT) -> dict[str, Any] | None:
    metric = find_metric(name, workspace_id)
    if not metric:
        return None
    metric["status"] = "approved"
    metric["approved_at"] = datetime.now(timezone.utc).isoformat()
    storage.upsert_metric(workspace_id, metric)
    return metric
