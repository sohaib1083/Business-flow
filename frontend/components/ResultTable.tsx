interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  maxRows?: number;
}

export default function ResultTable({ columns, rows, maxRows = 50 }: Props) {
  if (!rows || rows.length === 0) {
    return <div className="text-sm text-slate-500">No rows returned.</div>;
  }
  const visible = rows.slice(0, maxRows);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left font-medium text-slate-600"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {visible.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} className="px-3 py-2 text-slate-700">
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <div className="border-t bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Showing first {maxRows} of {rows.length} rows.
        </div>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
  }
  return String(v);
}
