"""Step 9: Insight generation + chart hint.

Convert raw query results into a 1–3 sentence narrative plus a recommended
chart configuration. We pass the LLM only the first ~25 rows to keep token
costs predictable; for aggregate queries this is almost always all the rows.
"""
from __future__ import annotations

import json
from typing import Any

from app.services import llm

SYSTEM = """You are a senior data analyst. Given a user's question and the
result rows, write a concise insight in plain English (2–4 sentences max). Be
specific about numbers, time periods, and direction of change. If the result
is empty, say so honestly and suggest what might be wrong.

Also recommend a chart.

Output JSON:
{
  "narrative": string,
  "chart": {
    "type":   "bar" | "line" | "pie" | "table",
    "x":      string | null,    // column name to use on the x-axis / category
    "y":      string | null,    // column name with the numeric value
    "title":  string
  }
}

Rules:
- Use "table" when there is no clean (category, value) pair.
- Use "line" for time-series, "bar" for categorical comparisons, "pie" only
  when there are <= 6 categories that sum to a whole.
"""


def generate(query: str, columns: list[str], rows: list[dict[str, Any]]) -> dict[str, Any]:
    sample = rows[:25]
    user = (
        f"Question: {query}\n\n"
        f"Columns: {columns}\n\n"
        f"Result rows (up to 25 shown): {json.dumps(sample, default=str)}\n\n"
        f"Total rows in result: {len(rows)}\n"
    )
    out = llm.chat_json(SYSTEM, user, temperature=0.3, max_tokens=400)
    out.setdefault("narrative", "")
    chart = out.get("chart") or {}
    chart.setdefault("type", "table")
    chart.setdefault("x", None)
    chart.setdefault("y", None)
    chart.setdefault("title", "")
    out["chart"] = chart
    return out
