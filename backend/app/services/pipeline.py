"""Pipeline orchestrator.

Glues the per-step services together into a single `run_query` function that
the API layer calls. Keeping this orchestration in one place makes the data
flow obvious: intent -> tables -> SQL -> execute -> insight -> learn.
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from app.services import connections, discovery, executor, insight, intent, semantic, sql_gen, storage

log = logging.getLogger(__name__)


def run_query(
    query: str,
    workspace_id: str = "demo",
    connection_id: str = connections.DEMO_CONNECTION_ID,
) -> dict[str, Any]:
    """Run the full natural-language → insight pipeline for one user query."""
    started = time.perf_counter()
    qid = str(uuid.uuid4())
    result: dict[str, Any] = {
        "id": qid,
        "query": query,
        "workspace_id": workspace_id,
        "connection_id": connection_id,
        "ok": False,
        "stages": {},
    }

    try:
        # 0. Validate the connection exists
        if connections.get_connection(connection_id) is None:
            result["error"] = f"Unknown connection: {connection_id}"
            return _finalise(result, started)

        # 1. Intent
        parsed_intent = intent.extract_intent(query)
        result["stages"]["intent"] = parsed_intent

        # 2. Table discovery
        disc = discovery.discover_tables(parsed_intent, connection_id)
        result["stages"]["discovery"] = disc
        if not disc["tables"]:
            result["error"] = "Could not identify any relevant tables for this question."
            return _finalise(result, started)

        # 3. Look up reusable metrics
        known = semantic.get_known_metrics(workspace_id)
        result["stages"]["known_metrics"] = known

        # 4. SQL generation
        gen = sql_gen.generate_sql(parsed_intent, disc["tables"], known, connection_id)
        result["stages"]["sql_generation"] = gen
        raw_sql = gen.get("sql", "")
        if not raw_sql:
            result["error"] = "The model did not produce SQL for this question."
            return _finalise(result, started)

        # 5. Safety check
        try:
            safe_sql = sql_gen.validate_sql(raw_sql, connection_id)
        except sql_gen.UnsafeSQLError as exc:
            result["error"] = f"SQL blocked by safety check: {exc}"
            result["stages"]["sql_validation"] = {"ok": False, "reason": str(exc)}
            return _finalise(result, started)
        result["sql"] = safe_sql
        result["stages"]["sql_validation"] = {"ok": True}

        # 6. Execute
        exec_result = executor.execute(safe_sql, connection_id)
        result["stages"]["execution"] = exec_result
        if not exec_result["ok"]:
            result["error"] = exec_result.get("error", "SQL execution failed.")
            return _finalise(result, started)

        # 7. Insight
        ins = insight.generate(query, exec_result["columns"], exec_result["rows"])
        result["stages"]["insight"] = ins

        # 8. Learn (semantic layer)
        learned = None
        metric_name = (gen.get("metric_name") or "").strip().lower()
        formula = (gen.get("metric_formula") or "").strip()
        if metric_name and formula:
            learned = semantic.remember_metric(
                name=metric_name,
                sql_fragment=formula,
                definition_text=gen.get("explanation", ""),
                tables_used=disc["tables"],
                workspace_id=workspace_id,
            )
        result["learned_metric"] = learned

        # 9. Build the user-facing response payload
        result.update(
            {
                "ok": True,
                "narrative": ins["narrative"],
                "chart": ins["chart"],
                "columns": exec_result["columns"],
                "rows": exec_result["rows"],
                "row_count": exec_result["row_count"],
                "tables_used": disc["tables"],
                "execution_ms": exec_result["execution_ms"],
            }
        )
        return _finalise(result, started)

    except Exception as exc:  # noqa: BLE001 — top-level boundary
        log.exception("pipeline failed")
        result["error"] = f"Internal error: {exc}"
        return _finalise(result, started)


def _finalise(result: dict[str, Any], started: float) -> dict[str, Any]:
    result["total_ms"] = int((time.perf_counter() - started) * 1000)

    # Best-effort log to the learning store
    try:
        storage.log_query(
            result["workspace_id"],
            {
                "id": result["id"],
                "query": result["query"],
                "connection_id": result.get("connection_id"),
                "ok": result["ok"],
                "sql": result.get("sql"),
                "tables_used": result.get("tables_used", []),
                "row_count": result.get("row_count", 0),
                "execution_ms": result.get("execution_ms"),
                "total_ms": result["total_ms"],
                "error": result.get("error"),
            },
        )
    except Exception as exc:  # pragma: no cover
        log.warning("query logging failed: %s", exc)

    return result
