"""Thin wrapper around the Groq client.

We expose a single `chat_json` helper that asks the LLM to respond in JSON and
parses defensively. Every call is logged with rough token counts so you can
trace cost in development.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from groq import Groq

from app.config import get_settings

log = logging.getLogger(__name__)

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.groq_api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Add it to the repo-root .env file."
            )
        _client = Groq(api_key=settings.groq_api_key)
    return _client


def chat(
    system: str,
    user: str,
    *,
    temperature: float = 0.1,
    max_tokens: int = 1024,
) -> str:
    """Run a single chat completion and return the raw text response."""
    settings = get_settings()
    client = _get_client()
    resp = client.chat.completions.create(
        model=settings.groq_model,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    text = resp.choices[0].message.content or ""
    usage = getattr(resp, "usage", None)
    if usage is not None:
        log.info(
            "groq call: prompt=%s completion=%s total=%s",
            getattr(usage, "prompt_tokens", "?"),
            getattr(usage, "completion_tokens", "?"),
            getattr(usage, "total_tokens", "?"),
        )
    return text.strip()


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _extract_json_blob(text: str) -> str:
    """Pull a JSON object out of a possibly-fenced LLM response."""
    m = _JSON_FENCE_RE.search(text)
    if m:
        return m.group(1).strip()
    # Otherwise try to find the first balanced { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]
    return text


def chat_json(
    system: str,
    user: str,
    *,
    temperature: float = 0.1,
    max_tokens: int = 1024,
) -> dict[str, Any]:
    """Run a chat completion and parse the response as JSON.

    Falls back to wrapping a parse failure in {"_raw": ...} so callers can
    decide how to handle malformed output without crashing the pipeline.
    """
    raw = chat(
        system + "\n\nRespond ONLY with valid JSON. No prose, no code fences.",
        user,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    blob = _extract_json_blob(raw)
    try:
        return json.loads(blob)
    except json.JSONDecodeError as exc:
        log.warning("LLM returned non-JSON output: %s", exc)
        return {"_raw": raw, "_error": str(exc)}
