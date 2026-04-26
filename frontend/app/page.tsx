"use client";

import { useEffect, useState } from "react";
import { api, type QueryResponse } from "@/lib/api";
import ChartPanel from "@/components/ChartPanel";
import ResultTable from "@/components/ResultTable";
import MetricsPanel from "@/components/MetricsPanel";
import ConnectionsPanel from "@/components/ConnectionsPanel";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<QueryResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [metricsRefresh, setMetricsRefresh] = useState(0);
  const [connectionId, setConnectionId] = useState("demo");

  useEffect(() => {
    api.suggestions().then((s) => setSuggestions(s.suggestions)).catch(() => {});
  }, []);

  async function ask(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setQuery("");
    // optimistic placeholder
    const placeholder: QueryResponse = {
      id: `pending-${Date.now()}`,
      query: q,
      workspace_id: "demo",
      ok: false,
    };
    setHistory((h) => [placeholder, ...h]);
    try {
      const res = await api.query(q, "demo", connectionId);
      setHistory((h) => [res, ...h.filter((x) => x.id !== placeholder.id)]);
      setMetricsRefresh((n) => n + 1);
    } catch (err) {
      setHistory((h) =>
        h.map((x) =>
          x.id === placeholder.id
            ? { ...x, ok: false, error: (err as Error).message }
            : x
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Business<span className="text-brand-600">Flow</span>
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Ask your database anything. It learns. You ship.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,320px]">
        {/* Main column */}
        <section className="space-y-6">
          {/* Query input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(query);
            }}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(query);
                }
              }}
              placeholder="e.g., What is total revenue by country?"
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              rows={2}
            />
            <div className="mt-3 flex items-center justify-between">
              <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    disabled={loading}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Thinking…" : "Ask"}
              </button>
            </div>
          </form>

          {history.length === 0 && !loading && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Try one of the suggestions above, or type your own question.
            </div>
          )}

          {history.map((r) => (
            <ResultCard key={r.id} response={r} />
          ))}
        </section>

        {/* Sidebar */}
        <div className="space-y-6">
          <ConnectionsPanel selectedId={connectionId} onSelect={setConnectionId} />
          <MetricsPanel refreshKey={metricsRefresh} />
        </div>
      </div>
    </main>
  );
}

function ResultCard({ response }: { response: QueryResponse }) {
  const [showSql, setShowSql] = useState(false);

  if (!response.ok && !response.narrative) {
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          You asked
        </div>
        <h2 className="mt-1 text-base font-medium text-slate-900">
          {response.query}
        </h2>
        {response.error ? (
          <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            {response.error}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />
            Generating SQL and running on your database…
          </div>
        )}
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        You asked
      </div>
      <h2 className="mt-1 text-base font-medium text-slate-900">
        {response.query}
      </h2>

      {response.narrative && (
        <p className="mt-3 text-[15px] leading-relaxed text-slate-800">
          {response.narrative}
        </p>
      )}

      {response.chart && response.rows && (
        <div className="mt-4">
          <ChartPanel config={response.chart} rows={response.rows} />
        </div>
      )}

      {response.columns && response.rows && (
        <div className="mt-4">
          <ResultTable columns={response.columns} rows={response.rows} />
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        {response.tables_used && response.tables_used.length > 0 && (
          <span>
            tables:{" "}
            <span className="font-mono text-slate-600">
              {response.tables_used.join(", ")}
            </span>
          </span>
        )}
        {response.row_count !== undefined && (
          <span>{response.row_count} rows</span>
        )}
        {response.total_ms !== undefined && (
          <span>{response.total_ms} ms</span>
        )}
        {response.learned_metric && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
            learned: {response.learned_metric.name}
          </span>
        )}
        {response.sql && (
          <button
            onClick={() => setShowSql((s) => !s)}
            className="ml-auto text-brand-600 hover:underline"
          >
            {showSql ? "Hide SQL" : "Show SQL"}
          </button>
        )}
      </footer>

      {showSql && response.sql && (
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
          {response.sql}
        </pre>
      )}
    </article>
  );
}
