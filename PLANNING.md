# AI-Powered Query-to-Insight System — Product & Engineering Plan

> Working title: **BusinessFlow** — A self-learning natural-language analytics layer over messy enterprise databases.

---

## 0. TL;DR

We are building a **query-driven semantic layer**: instead of forcing data teams to model an entire warehouse upfront (the Looker / Cube / dbt approach), we let users ask questions in plain English and **grow the semantic model one question at a time**. Each query teaches the system a new metric, a new join, or a new table relationship — and every future user benefits.

**Why now:** LLMs made text-to-SQL viable in 2023–2024. By 2026, raw text-to-SQL is commoditized (every BI vendor ships it). The remaining moat is **trust, governance, and accuracy on real-world messy schemas** — which is exactly what an *incremental, learned* semantic layer solves.

**Wedge:** Mid-market companies (50–500 employees) with a Postgres / MySQL / Snowflake / BigQuery backend, no dedicated analytics engineer, and a CEO/Ops lead who wants answers in Slack — not a Tableau license.

---

## 1. Problem Statement

### 1.1 The pain we're solving
1. **Analysts are a bottleneck.** 70%+ of internal data requests in SMBs go through 1–2 people who write SQL. Turnaround is days.
2. **BI dashboards are stale.** They answer yesterday's questions. New questions = new ticket.
3. **Existing "AI BI" tools fail on real schemas.** They demo beautifully on `northwind.db` and break on a 400-table production warehouse with cryptic column names (`f_amt_2`, `cust_typ_cd`).
4. **Semantic layers are too expensive to bootstrap.** Cube.dev / LookML / dbt Semantic Layer require weeks of upfront modeling before the first query works.

### 1.2 Who feels it most
| Persona | Pain | Willingness to pay |
|---|---|---|
| **Ops / Growth lead** at a Series A–C startup | Waits 2 days for a SQL answer | High (uses budget) |
| **Founder / CEO** of a 20–200 person company | Can't self-serve metrics | Very high |
| **Solo data analyst** drowning in ad-hoc requests | Wants to deflect 50% of tickets | High (champion) |
| **Product manager** | Needs funnel/cohort answers fast | Medium |

We are **not** initially targeting Fortune 500 enterprises — they have governance, RBAC, and compliance requirements that take 12+ months to satisfy.

---

## 2. Competitive Landscape (April 2026)

### 2.1 Direct competitors

| Category | Player | Strength | Weakness | Our edge |
|---|---|---|---|---|
| **Text-to-SQL OSS** | Vanna.ai, Wren AI, Dataherald | Free, dev-friendly, RAG-on-schema | Requires self-hosting, no insight layer, no learning loop | We ship a hosted product with insight generation + learning |
| **AI-native BI** | Julius AI, DataGPT, Hex Magic, Mode AI Assistant | Beautiful UX, fast | Mostly CSV/notebook-first, weak on multi-table joins | We focus on production DBs with messy schemas |
| **Incumbent BI + AI** | ThoughtSpot Sage, Tableau Pulse, Power BI Copilot, Looker Studio Gemini | Distribution, trust | Locked to their data model; expensive ($30–75/user/mo); slow innovation | Lighter, cheaper, works on raw DB |
| **Warehouse-native** | Snowflake Cortex Analyst, Databricks Genie, BigQuery Data Canvas | Zero data movement, secure | Locked to one warehouse; requires existing semantic model | We are warehouse-agnostic and bootstrap the model |
| **Semantic layer** | Cube.dev, dbt Semantic Layer, AtScale | Governance, consistency | Months of upfront modeling | Incremental, query-driven |
| **Chat-with-DB** | Defog.ai, AI2SQL, SQLChat | Quick demos | No learning, no insight generation, accuracy plateaus ~60% | Self-improving; targets 90%+ on repeated queries |

### 2.2 Honest assessment of our position

**Risks from competition:**
- **ThoughtSpot / Snowflake / Databricks** can crush us on distribution if they ship the same feature. Cortex Analyst is the biggest threat — it's free for Snowflake customers.
- **Wren AI** (open source, Y Combinator W24) is the closest architectural twin. They also do semantic layer + text-to-SQL. They have a head start on community.
- **Julius AI / DataGPT** have raised significant capital and have polished product.

**Where we win:**
1. **Query-driven incremental learning** — most competitors require the semantic layer upfront. We grow it from usage. This is a defensible flywheel: the more queries, the better the system, the harder to switch.
2. **Multi-warehouse from day 1** — Cortex is Snowflake-only. We work on Postgres, MySQL, Snowflake, BigQuery, Redshift.
3. **Insight-first, not SQL-first** — most tools dump a SQL result. We return a *narrative* ("Revenue grew 12% in the South, driven by 3 new enterprise accounts"). This is what non-technical users actually want.
4. **Price point** — target $99–499/mo per workspace, not $30/user/mo.

**Where we are vulnerable:**
- We have no data, no design partners, no brand.
- LLM cost per query is non-trivial (~$0.02–0.10). Margin compression is real.
- Accuracy on first-touch queries (no prior learning) will be ~60–70%, same as everyone else. We need to communicate this honestly.

---

## 3. Product Strategy

### 3.1 Differentiation pillars (the 3 things we will not compromise)

1. **The Learning Loop is visible to the user.** Every query shows: "I learned that `revenue = SUM(orders.amount) - SUM(refunds.amount)`. Confirm?" → user clicks → system gets smarter. This turns a black box into a collaborator.
2. **Insights, not tables.** Default output is a 1-paragraph narrative + a chart. The SQL and raw table are secondary (collapsible).
3. **Trust through transparency.** Every answer shows: the SQL run, the tables used, the confidence score, and the assumption set ("I assumed 'last month' = March 2026").

### 3.2 Anti-features (what we will *not* build in v1)
- Custom dashboards (use Metabase / Superset for that)
- Write/mutation queries (read-only, period — security)
- Multi-modal (images, PDFs) — focus on structured DBs
- On-prem deployment (cloud-only until $1M ARR)
- RBAC beyond workspace-level (enterprise problem, not SMB)

### 3.3 Core user journeys

**Journey A — First-time setup (target: < 10 minutes)**
1. Sign up → connect DB (read-only credentials, IP allowlist instructions)
2. System scans schema → caches into Firebase
3. System auto-generates 5 suggested queries based on table names ("It looks like you have an `orders` table — want to ask about revenue?")
4. User runs first query → sees insight + learning prompt

**Journey B — Daily use**
1. User types question in chat-style UI or Slack bot
2. System returns insight + chart in < 8 seconds (p50)
3. User can drill down ("break this down by week"), export, share

**Journey C — Admin / data-owner review**
1. Weekly digest email: "Here are 12 new metrics learned this week. Approve / reject / edit."
2. Admin canonicalizes definitions → becomes the source of truth

---

## 4. Architecture Decisions & Rationale

The original spec is solid. Here are refinements based on production realities:

### 4.1 Stack choices — confirmed and justified

| Layer | Choice | Rationale | Risk |
|---|---|---|---|
| Frontend | **Next.js 15 + shadcn/ui** | SSR for marketing site + app under one repo; fast | None |
| Backend | **FastAPI + Pydantic v2** | Async, typed, great LLM ecosystem | None |
| LLM | **Groq (Llama 3.3 70B / DeepSeek)** primary, **OpenAI GPT-4o-mini** fallback | Groq is 10x faster (latency wins UX); fallback for reliability | Groq rate limits → mitigation: queue + fallback |
| Storage (metadata) | **Firebase Firestore** | Fast to ship, real-time updates for the UI | Cost at scale; **migration path: Postgres + Redis** at ~10k MAU |
| Vector store | **pgvector** (in user's metadata Postgres) or **Qdrant** | Schema embeddings | Pick one — recommend Qdrant Cloud for ops simplicity |
| Customer DBs | Postgres, MySQL, Snowflake, BigQuery (read-only connectors) | Cover 80% of the market | BigQuery auth is painful — defer to v1.1 |
| Auth | **Clerk** or **Firebase Auth** | Don't build it | None |
| Observability | **Langfuse** + **Sentry** | LLM tracing is non-negotiable | None |
| Deployment | **Vercel** (frontend) + **Fly.io / Railway** (backend) | Cheap, fast | Move backend to AWS at scale |

### 4.2 Pipeline refinements (what to add to the spec)

**Add a Step 0: Schema ingestion & embedding.**
On DB connect, we should:
- Pull `INFORMATION_SCHEMA`
- Generate column-level embeddings (description = `table.column (type) — sample values: ...`)
- Generate a "schema summary" via LLM (cached) — short paragraph describing each table
- Detect FK relationships from constraints **and** from naming heuristics (`*_id` → `id`)

**Add a Step 4.5: Ambiguity resolution.**
Before generating SQL, if confidence < threshold (e.g., 2+ tables match "revenue"), surface a clarifying question to the user instead of guessing. This is a UX win and an accuracy win.

**Add a Step 7.5: SQL safety & sandboxing.**
- Reject any non-SELECT statement (regex + sqlparse AST check)
- Inject `LIMIT 10000` automatically
- Set query timeout (e.g., 30s)
- Run in read-only DB user account
- Log all SQL for audit

**Add a Step 9.5: Result validation.**
If result set is empty, 1 row, or has obvious issues (NULL-heavy column, gigantic numbers), the LLM should self-critique and either retry or flag uncertainty in the insight.

### 4.3 Firebase data model — additions

```
collection: workspaces
  - id, name, owner_id, db_connection_ref, plan_tier

collection: db_connections (encrypted)
  - id, dialect, host, db_name, encrypted_credentials, last_schema_scan_at

collection: schema_cache
  - workspace_id, table_name, columns[], row_count_estimate, sample_rows, embedding_id

collection: semantic_metrics
  - workspace_id, name, sql_fragment, definition_text, status (suggested|approved|deprecated),
    created_from_query_id, usage_count, last_used_at, approved_by

collection: query_history
  - id, workspace_id, user_id, raw_query, parsed_intent, sql, tables_used[],
    metrics_used[], execution_time_ms, row_count, insight_text, user_feedback (👍/👎/edit)

collection: feedback
  - query_id, type (correct|wrong_metric|wrong_join|wrong_filter), correction_text

collection: usage_metrics  // for billing
  - workspace_id, month, query_count, llm_tokens_in, llm_tokens_out
```

### 4.4 Cost model per query (back-of-envelope)

| Step | Tokens (approx) | Cost (Groq) | Cost (GPT-4o) |
|---|---|---|---|
| Intent extraction | 500 in / 200 out | $0.0001 | $0.001 |
| Table discovery | 2000 in / 100 out | $0.0003 | $0.003 |
| SQL generation | 3000 in / 500 out | $0.0005 | $0.006 |
| Insight generation | 1500 in / 300 out | $0.0003 | $0.003 |
| **Total per query** | | **~$0.001** | **~$0.013** |

At Groq pricing, 100 queries/day/workspace = **$3/month in LLM cost**. We can charge $99/mo with 95%+ gross margin. **This is the business case.**

---

## 5. Roadmap

### Phase 0 — Validation (before writing the v1 backend)
- [ ] 10 customer discovery calls with target persona
- [ ] Build a Loom-only "wizard of oz" demo on a single Postgres DB
- [ ] Get 3 LOIs / paid pilots ($500/mo each)

### Phase 1 — MVP (v0.1)
**Scope:** Single workspace, Postgres-only, manual schema ingestion, no learning loop yet. Just text → SQL → insight.

**Success criteria:** A friendly user runs 20 queries, 70%+ are "useful."

Modules:
1. Auth + workspace creation
2. DB connection wizard (Postgres only)
3. Schema scan → Firebase
4. Chat UI with single-turn query
5. LLM pipeline: intent → table discovery → SQL → execute → insight
6. Result display: narrative + table + auto-chart (Recharts)

### Phase 2 — Learning loop (v0.2)
- Semantic metric extraction & storage
- "I learned X — confirm?" UI
- Query history view
- Reuse of approved metrics

### Phase 3 — Trust & polish (v0.3)
- Multi-turn conversation ("now break it by month")
- Slack integration
- MySQL + Snowflake connectors
- User feedback loop (👍/👎 → fine-tune retrieval)
- Usage dashboard for admins

### Phase 4 — Scale (v1.0)
- Embeddings-based table discovery (replace keyword matching)
- Suggested queries on the home screen
- Weekly digest email
- Billing (Stripe) + plan tiers
- BigQuery connector
- SOC 2 Type 1 prep

---

## 6. Key Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Accuracy is too low (< 70%) on real schemas** | High | Critical | Heavy investment in schema embeddings; transparent confidence scoring; clarifying questions; aggressive learning loop |
| **Snowflake / Databricks ship a free competitor** | High | High | Stay multi-warehouse; out-execute on UX and SMB segment they ignore |
| **LLM costs explode at scale** | Medium | High | Groq primary; aggressive caching of schema + metrics; smaller models for intent extraction |
| **Customer DB credentials leak** | Low | Catastrophic | Encrypted at rest (KMS); read-only users; IP allowlist; SOC 2 by month 12; never log credentials or data |
| **PII / GDPR exposure in query results stored in Firebase** | Medium | High | Hash row data in query history; store only SQL + metadata, not result rows; opt-in for full storage |
| **LLM hallucinates a column that doesn't exist** | High | Medium | Constrain SQL generation to known schema (function calling with schema as JSON); validate AST against schema before execution |
| **Joins are wrong → numerically wrong but plausible answer** | High | Critical | Show the join path in the UI; mark inferred joins as "unverified" until user confirms once; unit tests on golden queries |
| **Wren AI / Vanna eat the OSS niche** | Medium | Medium | We are not OSS; we compete on hosted UX + insights + SMB packaging |

---

## 7. Go-To-Market

### 7.1 Pricing (proposed)
- **Free:** 1 user, 50 queries/month, 1 DB connection, community support
- **Starter — $99/mo:** 5 users, 1,000 queries/mo, 1 DB
- **Growth — $399/mo:** 20 users, 10,000 queries/mo, 3 DBs, Slack integration
- **Business — $1,499/mo:** Unlimited users, 100k queries, SSO, audit log, priority support

### 7.2 Distribution
1. **Founder-led sales** for first 20 customers (LinkedIn outbound to ops/growth leads at Series A–B startups)
2. **Content** — "How we built a self-learning text-to-SQL system" technical blog series; honest accuracy benchmarks
3. **Slack/Notion communities** (Locally Optimistic, Operators Guild, MeasureSlack)
4. **Product Hunt launch** at v0.3
5. **OSS adjacent** — release a small open-source tool (e.g., schema-to-embedding CLI) to seed dev awareness

### 7.3 Moats we are building
1. **Data flywheel** — every query enriches the workspace's semantic layer. Switching cost compounds monthly.
2. **Cross-workspace learning** (privacy-preserving) — generic patterns ("revenue ≈ SUM of an amount column in an orders-like table") improve with every new customer. This is the long-term moat.
3. **Brand trust** — be the honest one in a space full of vendor demos that lie.

---

## 8. Success Metrics (North Star + supporting)

**North Star:** Weekly Active Workspaces × Median queries per workspace per week.

| Metric | v0.1 target | v0.3 target | v1.0 target |
|---|---|---|---|
| Query accuracy (user 👍 rate) | 65% | 80% | 90% |
| Time-to-first-insight (signup → first answer) | < 15 min | < 10 min | < 5 min |
| Median query latency (p50) | < 12s | < 8s | < 5s |
| Paying workspaces | 3 | 25 | 150 |
| Gross margin | 60% | 80% | 88% |
| Repeat query rate (week 2 retention) | 40% | 60% | 75% |

---

## 9. Open Questions for the Founder

1. **Domain focus:** Do we want a vertical wedge (e.g., "BusinessFlow for e-commerce") or stay horizontal? Vertical = faster PMF, smaller TAM.
2. **OSS or closed?** OSS accelerates distribution but compresses pricing. Recommendation: closed, but open-source the schema-embedding library.
3. **Insight depth:** Stop at descriptive ("revenue grew 12%") or push to diagnostic ("...because X")? Diagnostic is much harder but a 10x value prop.
4. **Slack-first vs web-first:** Where does the user spend their day? Most Ops people live in Slack — a Slack-native version might be the real wedge.
5. **Build vs buy on text-to-SQL core:** Vanna AI is Apache 2.0. Do we fork it as a starting point or build from scratch? Recommendation: build from scratch but study their prompt structure.

---

## 10. Immediate Next Steps (this week)

1. Lock down the 3 customer-discovery calls (template DM ready)
2. Spike a Groq + Postgres + FastAPI prototype on the Chinook sample DB — measure end-to-end latency and accuracy on 30 hand-written queries
3. Decide: Firestore vs Postgres for metadata (recommendation: start Firestore, migrate later)
4. Set up Langfuse from day 1 — every LLM call logged
5. Draft the landing page (one sentence: *"Ask your database anything. It learns. You ship."*)

---

## Appendix A — Honest accuracy expectation

On first-touch queries against an unfamiliar schema, expect:
- ~70% accuracy on simple aggregations (single table)
- ~50% on 2-table joins
- ~25% on 3+ table joins or window functions

After the learning loop has 50+ approved metrics for a workspace, expect:
- ~95% on previously-seen metric patterns
- ~80% on novel queries that reuse known joins

**Communicate this honestly in the product.** Every competitor lies about this. Being the honest one is a feature.

---

## Appendix B — Why the "incremental semantic layer" is genuinely novel

Existing semantic layers (LookML, Cube, dbt Semantic Layer) require:
1. A data engineer
2. Weeks of upfront modeling
3. Continuous maintenance as the schema evolves

Existing text-to-SQL tools (Vanna, Defog) skip the semantic layer entirely and re-derive everything from scratch on each query — leading to inconsistent answers ("revenue" computed three different ways across three queries).

Our approach: **the semantic layer is the cache of approved query interpretations.** The first time someone asks for revenue, we compute it, present the definition, and (after approval) store it. The next 100 askers get the same answer with zero LLM ambiguity. The semantic layer grows organically, governed by usage rather than a priori modeling.

This is the same pattern as: Git (history-driven), Stack Overflow (question-driven knowledge), and modern feature flags (usage-driven config). It works because human curiosity is a better prioritization function than top-down planning.
