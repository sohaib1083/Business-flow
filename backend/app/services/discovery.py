"""Step 4: Table discovery.

Given a parsed intent and the full schema, ask the LLM to pick the minimum set
of tables required to answer the question. We pass the schema as compact JSON
rather than embeddings — embeddings are a v0.4 upgrade once we have enough
real schemas to justify the indexing infrastructure.
"""
from __future__ import annotations

import json
from typing import Any

from app.services import connections, llm, schema

SYSTEM = """You are a database expert. Given an analytical intent and a
database schema, list the MINIMUM set of tables required to answer the
question. Prefer fewer tables.

Output JSON:
{
  "tables":     string[],   // table names from the schema, in join order
  "reasoning":  string      // 1 short sentence
}

Only include tables that exist in the provided schema.
"""


def discover_tables(
    intent: dict[str, Any],
    connection_id: str = connections.DEMO_CONNECTION_ID,
) -> dict[str, Any]:
    full_schema = schema.schema_for_prompt(connection_id)
    user = (
        f"Intent:\n{json.dumps(intent, indent=2)}\n\n"
        f"Schema:\n{json.dumps(full_schema, indent=2)}\n\n"
        "Which tables do we need?"
    )
    out = llm.chat_json(SYSTEM, user, temperature=0.0, max_tokens=300)
    out.setdefault("tables", [])
    out.setdefault("reasoning", "")
    # Filter to known tables defensively
    known = {t["table"] for t in full_schema}
    out["tables"] = [t for t in out["tables"] if t in known]
    return out
