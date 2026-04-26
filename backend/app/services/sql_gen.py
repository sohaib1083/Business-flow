"""Step 7: SQL generation + safety.

The LLM produces SQL given the intent, the chosen tables, and any reusable
metric fragments from the semantic layer. We then *validate* the SQL before
ever sending it to the database:

- Must be a single statement
- Must be a SELECT (or WITH ... SELECT)
- Must not reference unknown tables
- Must have a LIMIT (we add one if missing)

Safety violations raise `UnsafeSQLError` and the pipeline returns an error
to the user instead of executing.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

import sqlparse
from sqlparse.sql import Statement
from sqlparse.tokens import DML, Keyword

from app.config import get_settings
from app.services import connections, llm, schema

log = logging.getLogger(__name__)


class UnsafeSQLError(ValueError):
    """Raised when generated SQL fails our safety checks."""


SYSTEM_TEMPLATE = """You are an expert SQL author. Generate a single {dialect_name}-compatible
SELECT statement that answers the user's intent using ONLY the provided tables.

Rules:
- SELECT only. No INSERT/UPDATE/DELETE/DDL.
- Use exact table and column names from the schema.
- Use explicit JOINs with ON clauses; never CROSS JOIN.
- Apply time filters using {dialect_name}-native date functions.
- If the user asks for top-N, ORDER BY and LIMIT.
- If the user asks for a metric you can compute with a known formula, prefer
  the known formula. Otherwise pick the most reasonable computation.
- Always include a LIMIT clause (use 1000 if no top-N requested).
- Quote identifiers only if they conflict with reserved words.

Dialect notes:
{dialect_notes}

Output JSON:
{{
  "sql":            string,    // the SQL statement
  "metric_name":    string,    // canonical lowercase metric name (e.g. "revenue")
  "metric_formula": string,    // the SQL fragment that defines the metric (e.g. "SUM(orders.amount)")
  "explanation":    string     // 1 sentence describing what the query does
}}
"""

_DIALECT_INFO = {
    "sqlite": {
        "name": "SQLite",
        "notes": "- Use DATE('now', '-1 year') for relative dates.\n- String concat with ||.",
    },
    "postgresql": {
        "name": "PostgreSQL",
        "notes": (
            "- Use NOW() - INTERVAL '1 year' for relative dates.\n"
            "- DATE_TRUNC('month', col) for month buckets.\n"
            "- Identifiers are case-folded to lowercase unless quoted."
        ),
    },
    "mysql": {
        "name": "MySQL",
        "notes": (
            "- Use DATE_SUB(NOW(), INTERVAL 1 YEAR) for relative dates.\n"
            "- DATE_FORMAT(col, '%Y-%m') for month buckets.\n"
            "- Backticks for reserved-word identifiers."
        ),
    },
}


def _system_prompt(dialect: str) -> str:
    info = _DIALECT_INFO.get(dialect, _DIALECT_INFO["sqlite"])
    return SYSTEM_TEMPLATE.format(dialect_name=info["name"], dialect_notes=info["notes"])


def generate_sql(
    intent: dict[str, Any],
    tables: list[str],
    known_metrics: list[dict[str, Any]],
    connection_id: str = connections.DEMO_CONNECTION_ID,
) -> dict[str, Any]:
    dialect = schema.get_dialect(connection_id)
    table_schema = schema.schema_for_prompt(connection_id, tables)
    user = (
        f"Intent:\n{json.dumps(intent, indent=2)}\n\n"
        f"Available tables (full schema):\n{json.dumps(table_schema, indent=2)}\n\n"
        f"Known metrics you can reuse:\n{json.dumps(known_metrics, indent=2)}\n\n"
        "Generate the SQL."
    )
    out = llm.chat_json(_system_prompt(dialect), user, temperature=0.0, max_tokens=700)
    out.setdefault("sql", "")
    out.setdefault("metric_name", "")
    out.setdefault("metric_formula", "")
    out.setdefault("explanation", "")
    return out


# ---------- safety ----------

_FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE",
    "ALTER", "CREATE", "GRANT", "REVOKE", "ATTACH", "DETACH",
    "PRAGMA", "REPLACE", "VACUUM",
}

_LIMIT_RE = re.compile(r"\blimit\b\s+\d+", re.IGNORECASE)


def _statement_is_select(stmt: Statement) -> bool:
    for token in stmt.tokens:
        if token.ttype is DML:
            return token.normalized.upper() == "SELECT"
        # Allow CTE
        if token.ttype is Keyword and token.normalized.upper() == "WITH":
            return True
        if token.ttype is None and token.is_group:
            # First meaningful child decides it; recurse one level
            for sub in token.tokens:
                if sub.ttype is DML:
                    return sub.normalized.upper() == "SELECT"
    return False


def validate_sql(sql: str, connection_id: str = connections.DEMO_CONNECTION_ID) -> str:
    """Validate and lightly normalise a generated SQL statement.

    Returns the validated (possibly LIMIT-augmented) SQL or raises UnsafeSQLError.
    """
    settings = get_settings()
    if not sql or not sql.strip():
        raise UnsafeSQLError("Empty SQL")

    cleaned = sql.strip().rstrip(";")
    statements = sqlparse.parse(cleaned)
    if len(statements) != 1:
        raise UnsafeSQLError("Multiple statements are not allowed")

    stmt = statements[0]
    if not _statement_is_select(stmt):
        raise UnsafeSQLError("Only SELECT statements are allowed")

    upper = cleaned.upper()
    for kw in _FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{kw}\b", upper):
            raise UnsafeSQLError(f"Forbidden keyword: {kw}")

    # Validate that referenced tables exist on this connection.
    known_tables = set(schema.get_schema(connection_id).keys())
    known_lower = {t.lower() for t in known_tables}
    # crude table extraction: tokens following FROM / JOIN, optional schema-qualified
    for match in re.finditer(
        r"\b(?:from|join)\s+(?:[A-Za-z_][A-Za-z0-9_]*\.)?[`\"]?([A-Za-z_][A-Za-z0-9_]*)[`\"]?",
        cleaned,
        re.IGNORECASE,
    ):
        tname = match.group(1).lower()
        if tname not in known_lower:
            raise UnsafeSQLError(f"Unknown table referenced: {tname}")

    if not _LIMIT_RE.search(cleaned):
        cleaned = f"{cleaned}\nLIMIT {settings.max_rows_returned}"

    return cleaned
