# The learning loop

> **The semantic layer is the cache of approved query interpretations.**

Most text-to-SQL tools re-derive every metric from scratch on every query.
That's why two users asking "What's our revenue?" can get two different
numbers from the same database. BusinessFlow fixes this by *remembering*.

## What gets learned

Every successful query that names a metric (the LLM's `metric_name` +
`metric_formula` outputs) writes a record to the workspace's
`semantic_metrics` collection:

```json
{
  "name": "revenue",
  "sql_fragment": "SUM(orders.amount)",
  "definition_text": "Total order amount across all completed orders.",
  "tables_used": ["orders"],
  "status": "suggested",
  "usage_count": 1,
  "created_at": "2026-04-26T...",
  "last_used_at": "2026-04-26T..."
}
```

If a record already exists for that name, we just bump `usage_count` and
`last_used_at`. The first definition wins until an admin edits or approves.

## Reuse on the next query

In stage 4 (`sql_gen.generate_sql`), all known metrics are passed to the LLM
as context. The system prompt instructs the model to **prefer the known
formula** when the user's metric matches.

This produces three nice properties:
1. **Consistency.** "Revenue" means the same thing on every dashboard.
2. **Speed.** The LLM has fewer choices to make → fewer mistakes, faster
   completions.
3. **Governance.** Admins can audit every formula by glancing at the metrics
   panel.

## Approval flow

- All freshly-learned metrics start with `status: "suggested"`.
- The metrics sidebar in the UI exposes an **Approve** button.
- Approving a metric promotes it; the LLM trusts approved formulas first.
- (Future) An admin digest email surfaces the week's new suggestions for
  bulk review.

## Storage

Adapter code lives in `backend/app/services/storage.py`. It tries Firestore
first; on any failure it transparently writes to
`backend/local_store.json`. The local file is great for offline development
and gives you a complete, inspectable record of everything the system has
learned so far.

## What we don't learn yet (roadmap)

| Feature | Phase |
|---|---|
| Per-workspace join paths (e.g. `orders.customer_id → customers.id`) | v0.2 |
| Multi-turn refinement memory ("now break it by month") | v0.2 |
| User feedback signal (👍/👎) → re-rank metric reuse | v0.3 |
| Embedding-based metric matching for synonyms ("sales" ≈ "revenue") | v0.4 |
| Cross-workspace pattern transfer (privacy-preserving) | v1.0 — long-term moat |

See [PLANNING.md](../PLANNING.md) for the full roadmap.
