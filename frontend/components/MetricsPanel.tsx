"use client";

import { useEffect, useState } from "react";
import { api, type Metric } from "@/lib/api";

export default function MetricsPanel({ refreshKey }: { refreshKey: number }) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.metrics();
      setMetrics(res.metrics);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function approve(name: string) {
    setBusy(name);
    try {
      await api.approveMetric(name);
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">
          Learned metrics
        </h2>
        <button
          onClick={load}
          className="text-xs text-brand-600 hover:underline"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </header>

      {metrics.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nothing learned yet. Ask a question to start building your semantic
          layer.
        </p>
      ) : (
        <ul className="space-y-3">
          {metrics.map((m) => (
            <li
              key={m.name}
              className="rounded-lg border border-slate-100 bg-slate-50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium text-slate-800">
                  {m.name}
                </span>
                <StatusBadge status={m.status} />
              </div>
              <code className="mt-1 block text-xs text-slate-600">
                {m.sql_fragment}
              </code>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>used {m.usage_count}×</span>
                {m.status !== "approved" && (
                  <button
                    onClick={() => approve(m.name)}
                    disabled={busy === m.name}
                    className="rounded bg-brand-600 px-2 py-1 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {busy === m.name ? "…" : "Approve"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{status}</span>
  );
}
