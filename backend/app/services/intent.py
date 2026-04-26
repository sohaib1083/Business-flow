"""Step 3: Query understanding.

Parse a natural-language query into a structured intent: metric, dimensions,
filters, and time range. The intent is a small JSON object — easy to log,
cache, and reason about — and is the input to table discovery.
"""
from __future__ import annotations

from typing import Any

from app.services import llm

SYSTEM = """You are a senior analytics engineer. Given a user's natural-language
question about their business data, extract a structured intent.

Output schema:
{
  "metric":       string | null,        // e.g. "revenue", "customer_count"
  "aggregation":  string | null,        // "sum" | "avg" | "count" | "min" | "max" | null
  "dimensions":   string[],             // grouping fields, e.g. ["country", "month"]
  "filters":      [{"field": string, "op": string, "value": any}],
  "time_filter":  string | null,        // "last_month" | "ytd" | "2024" | null
  "limit":        integer | null,       // top-N if requested
  "order":        "asc" | "desc" | null
}

Rules:
- Use snake_case for metric and dimension names.
- If something isn't specified, use null or [].
- Don't invent fields the user didn't ask for.
"""


def extract_intent(query: str) -> dict[str, Any]:
    user = f'User question: "{query.strip()}"\n\nReturn the structured intent JSON.'
    intent = llm.chat_json(SYSTEM, user, temperature=0.0, max_tokens=400)
    # Defensive defaults
    intent.setdefault("metric", None)
    intent.setdefault("aggregation", None)
    intent.setdefault("dimensions", [])
    intent.setdefault("filters", [])
    intent.setdefault("time_filter", None)
    intent.setdefault("limit", None)
    intent.setdefault("order", None)
    return intent
