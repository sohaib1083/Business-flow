"""Storage adapter for the learning layer.

We try Firebase Firestore first (using the service-account JSON in `.env`).
If Firebase is unavailable for any reason — bad credentials, no network,
missing dependency — we transparently fall back to a local JSON file at
`backend/local_store.json` so the demo always works.

This is intentional: the learning loop should NEVER block a query. Storage
failures are logged and degraded, never raised to the user.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from typing import Any

from app.config import get_settings

log = logging.getLogger(__name__)

# ----------------------------- Firebase backend -----------------------------

_firebase_ready = False
_firebase_db = None
_firebase_lock = threading.Lock()


def _init_firebase() -> bool:
    """Return True if Firebase is initialised and usable."""
    global _firebase_ready, _firebase_db
    if _firebase_ready:
        return True
    settings = get_settings()
    if not settings.firebase_service_account_json:
        return False
    with _firebase_lock:
        if _firebase_ready:
            return True
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            sa = json.loads(settings.firebase_service_account_json)
            cred = credentials.Certificate(sa)
            try:
                firebase_admin.get_app()
            except ValueError:
                firebase_admin.initialize_app(cred)
            _firebase_db = firestore.client()
            _firebase_ready = True
            log.info("firebase: initialised (project=%s)", sa.get("project_id"))
            return True
        except Exception as exc:  # pragma: no cover — env-dependent
            log.warning("firebase: init failed, falling back to local store: %s", exc)
            return False


# ----------------------------- Local backend --------------------------------

_local_lock = threading.Lock()


def _load_local() -> dict[str, Any]:
    settings = get_settings()
    path = settings.local_store_path
    if not path.exists():
        return {"workspaces": {}}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"workspaces": {}}


def _save_local(data: dict[str, Any]) -> None:
    settings = get_settings()
    settings.local_store_path.write_text(
        json.dumps(data, indent=2, default=str), encoding="utf-8"
    )


def _local_workspace(data: dict[str, Any], workspace_id: str) -> dict[str, Any]:
    ws = data["workspaces"].setdefault(
        workspace_id, {"metrics": {}, "queries": [], "connections": {}}
    )
    ws.setdefault("metrics", {})
    ws.setdefault("queries", [])
    ws.setdefault("connections", {})
    return ws


# ----------------------------- Public API -----------------------------------


def upsert_metric(workspace_id: str, metric: dict[str, Any]) -> None:
    name = metric.get("name")
    if not name:
        return
    if _init_firebase():
        try:
            _firebase_db.collection("workspaces").document(workspace_id) \
                .collection("semantic_metrics").document(name).set(metric, merge=True)
            return
        except Exception as exc:  # pragma: no cover
            log.warning("firebase upsert_metric failed, falling back: %s", exc)

    with _local_lock:
        data = _load_local()
        ws = _local_workspace(data, workspace_id)
        ws["metrics"][name] = metric
        _save_local(data)


def list_metrics(workspace_id: str) -> list[dict[str, Any]]:
    if _init_firebase():
        try:
            docs = (
                _firebase_db.collection("workspaces").document(workspace_id)
                .collection("semantic_metrics").stream()
            )
            return [d.to_dict() for d in docs]
        except Exception as exc:  # pragma: no cover
            log.warning("firebase list_metrics failed, falling back: %s", exc)

    with _local_lock:
        data = _load_local()
        ws = _local_workspace(data, workspace_id)
        return list(ws["metrics"].values())


def log_query(workspace_id: str, record: dict[str, Any]) -> None:
    record = {**record, "logged_at": datetime.now(timezone.utc).isoformat()}
    if _init_firebase():
        try:
            _firebase_db.collection("workspaces").document(workspace_id) \
                .collection("query_history").add(record)
            return
        except Exception as exc:  # pragma: no cover
            log.warning("firebase log_query failed, falling back: %s", exc)

    with _local_lock:
        data = _load_local()
        ws = _local_workspace(data, workspace_id)
        ws["queries"].append(record)
        # Keep last 500 to avoid unbounded growth
        ws["queries"] = ws["queries"][-500:]
        _save_local(data)


def list_queries(workspace_id: str, limit: int = 50) -> list[dict[str, Any]]:
    if _init_firebase():
        try:
            from firebase_admin.firestore import firestore  # type: ignore
            docs = (
                _firebase_db.collection("workspaces").document(workspace_id)
                .collection("query_history")
                .order_by("logged_at", direction=firestore.Query.DESCENDING)
                .limit(limit).stream()
            )
            return [d.to_dict() for d in docs]
        except Exception as exc:  # pragma: no cover
            log.warning("firebase list_queries failed, falling back: %s", exc)

    with _local_lock:
        data = _load_local()
        ws = _local_workspace(data, workspace_id)
        return list(reversed(ws["queries"]))[:limit]


def backend_in_use() -> str:
    return "firebase" if _init_firebase() else "local-json"


# ----------------------------- Connections -----------------------------------


def upsert_connection(workspace_id: str, record: dict[str, Any]) -> None:
    cid = record.get("id")
    if not cid:
        return
    if _init_firebase():
        try:
            _firebase_db.collection("workspaces").document(workspace_id) \
                .collection("connections").document(cid).set(record, merge=True)
            return
        except Exception as exc:  # pragma: no cover
            log.warning("firebase upsert_connection failed, falling back: %s", exc)

    with _local_lock:
        data = _load_local()
        ws = _local_workspace(data, workspace_id)
        ws["connections"][cid] = record
        _save_local(data)


def list_connections(workspace_id: str) -> list[dict[str, Any]]:
    if _init_firebase():
        try:
            docs = (
                _firebase_db.collection("workspaces").document(workspace_id)
                .collection("connections").stream()
            )
            return [d.to_dict() for d in docs]
        except Exception as exc:  # pragma: no cover
            log.warning("firebase list_connections failed, falling back: %s", exc)

    with _local_lock:
        data = _load_local()
        ws = _local_workspace(data, workspace_id)
        return list(ws["connections"].values())


def delete_connection(workspace_id: str, connection_id: str) -> bool:
    deleted = False
    if _init_firebase():
        try:
            doc_ref = (
                _firebase_db.collection("workspaces").document(workspace_id)
                .collection("connections").document(connection_id)
            )
            if doc_ref.get().exists:
                doc_ref.delete()
                deleted = True
        except Exception as exc:  # pragma: no cover
            log.warning("firebase delete_connection failed: %s", exc)

    with _local_lock:
        data = _load_local()
        ws = _local_workspace(data, workspace_id)
        if connection_id in ws["connections"]:
            del ws["connections"][connection_id]
            _save_local(data)
            deleted = True
    return deleted
