import type { SchemaInfo, ConnectionType } from '@/types/connection'

export function buildQueryPlanPrompt(schema: SchemaInfo, connectionType: ConnectionType): string {
  const flavour =
    connectionType === 'MONGODB'
      ? 'The target is MongoDB. `entities` are collection names. Field paths may use dotted syntax.'
      : 'The target is a SQL database or a tabular file. `entities` are table/sheet names.'

  return `You plan data queries. Given a business question, produce a JSON plan.

${flavour}

Respond with ONLY a JSON object with this exact shape - no prose, no code fences:
{
  "sourceType": "postgres" | "mysql" | "csv" | "excel" | "mongodb",
  "intent": "aggregate" | "filter" | "group" | "timeseries" | "ranking" | "detail",
  "entities": [string],
  "fields": [{"field": string, "agg"?: "sum"|"avg"|"count"|"min"|"max"|"distinct_count", "alias"?: string}],
  "filters": [{"field": string, "op": "="|"!="|">"|">="|"<"|"<="|"in"|"between"|"contains", "value": any}],
  "groupBy"?: [string],
  "orderBy"?: [{"field": string, "direction": "asc"|"desc"}],
  "limit"?: number,
  "joins"?: [{"table": string, "on": {"left": "tableA.col", "right": "tableB.col"}, "type"?: "inner"|"left"}],
  "timeBucket"?: {"field": "table.date_col", "unit": "day"|"week"|"month"|"quarter"|"year", "alias"?: string}
}

Rules:
- Pick fields that actually exist in the schema below. Never invent.
- When a question needs columns from multiple tables, list the primary table in entities[0]
  and add each additional table as an entry in joins with a proper on clause.
- Always fully qualify field names as 'table.column' whenever more than one table is used.
  Bare 'column' names are only OK when there is a single entity and no joins.
- Do NOT use table aliases like 'c.country'. Use the full table name: 'customers.country'.
- For relative date filters on Postgres/MySQL, use raw SQL expressions as the value, e.g.
  "now() - interval '30 days'" or "current_date - interval '7 days'" or
  "date_trunc('year', now())". Emit them as a plain JSON string whose content is itself a
  valid SQL expression. ALWAYS pair these with op ">=" (not "="). For "this year" /
  "this month" use op ">=" and value "date_trunc('year', now())" / "date_trunc('month', now())".
- Prefer small result sets. Default limit 100 unless the question asks for all rows.
- For "over time" / "by month" / "by week" / "by day" questions, use intent="timeseries" and
  set timeBucket with the date column and unit. Do NOT put a DATE_TRUNC or similar SQL
  function into fields. Do NOT invent agg values like "month" or "date_trunc".
- Only the five aggs are supported: sum, avg, count, min, max, distinct_count. Never emit any
  other agg value.
- For "top N" questions, use intent="ranking" with orderBy + limit N.
- For "how many X per Y" / "count by Y" questions, use agg="count" on a primary key column
  (e.g. the id of the table being counted), not distinct_count on the group column.

Schema:
${JSON.stringify(schema, null, 2)}
`
}

export function buildSummarizePrompt(
  question: string,
  rows: Record<string, unknown>[],
  rowCount: number,
): string {
  return `You write crisp, factual data summaries.

Question: ${question}
Rows returned: ${rowCount}
Sample rows (JSON, up to ${rows.length}):
${JSON.stringify(rows, null, 2)}

Write ONE short paragraph (<= 3 sentences) that directly answers the question
using concrete numbers from the rows. No preamble, no "based on the data", no
markdown, no bullet points.`
}

export const FORMAT_HEURISTICS = {
  TIMESERIES_MIN_POINTS: 3,
  PIE_MAX_BUCKETS: 8,
  TABLE_MIN_COLUMNS: 4,
  TABLE_MIN_ROWS: 10,
  DATE_PATTERNS: [/date/i, /time/i, /_at$/i, /month/i, /year/i, /week/i, /day/i],
  PERCENTAGE_PATTERNS: [/percent/i, /pct/i, /share/i, /ratio/i],
  RANKING_PATTERNS: [/top\s+\d+/i, /most/i, /highest/i, /lowest/i, /best/i, /worst/i],
  TIMESERIES_PATTERNS: [/over time/i, /trend/i, /by (month|week|day|year)/i, /timeline/i],
}
