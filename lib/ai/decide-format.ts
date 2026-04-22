import { FORMAT_HEURISTICS as R } from './prompts'
import type { FormattedResponse } from '@/types/query'

/**
 * Pure heuristic that chooses between text / table / chart presentations.
 * The user can always override by asking (e.g. "show as a bar chart").
 */

function valuesOf(data: Record<string, unknown>[], col: string): unknown[] {
  return data.map((r) => r[col]).filter((v) => v !== null && v !== undefined)
}

function isDateLike(value: unknown): boolean {
  if (value instanceof Date) return true
  if (typeof value === 'string') {
    return /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(value)
  }
  return false
}

function matches(question: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(question))
}

function chartTitle(question: string): string {
  const t = question.trim().replace(/[?!.]+$/, '')
  return t.length > 60 ? t.slice(0, 57) + '...' : t
}

export function decideFormat(
  data: Record<string, unknown>[],
  question: string,
  options: { illustrations?: boolean } = {},
): Omit<FormattedResponse, 'summary'> {
  const illustrations = options.illustrations ?? true

  if (!data || data.length === 0) return { kind: 'text', data: [] }

  const columns = Object.keys(data[0])

  // Single scalar → text
  if (data.length === 1 && columns.length <= 2) {
    const numCount = columns.filter((c) => typeof data[0][c] === 'number').length
    if (numCount === 1) return { kind: 'text', data }
  }

  if (!illustrations) {
    return columns.length >= R.TABLE_MIN_COLUMNS || data.length >= R.TABLE_MIN_ROWS
      ? { kind: 'table', data }
      : { kind: 'text', data }
  }

  const dateColumns = columns.filter((c) => {
    const vals = valuesOf(data, c)
    return vals.length > 0 && vals.every(isDateLike)
  })
  const numericColumns = columns.filter((c) =>
    data.some((r) => typeof r[c] === 'number'),
  )
  const categoryColumns = columns.filter((c) => {
    const vals = valuesOf(data, c)
    return vals.length > 0 && vals.every((v) => typeof v === 'string')
  })

  // Time series
  if (
    dateColumns.length > 0 &&
    numericColumns.length > 0 &&
    (data.length >= R.TIMESERIES_MIN_POINTS || matches(question, R.TIMESERIES_PATTERNS))
  ) {
    return {
      kind: 'chart',
      chartSubtype: 'line',
      data,
      chartConfig: {
        xKey: dateColumns[0],
        yKey: numericColumns.find((c) => c !== dateColumns[0]) ?? numericColumns[0],
        title: chartTitle(question),
      },
    }
  }

  // Part-of-whole → pie
  if (
    matches(question, R.PERCENTAGE_PATTERNS) &&
    categoryColumns.length > 0 &&
    numericColumns.length > 0 &&
    data.length <= R.PIE_MAX_BUCKETS
  ) {
    return {
      kind: 'chart',
      chartSubtype: 'pie',
      data,
      chartConfig: {
        xKey: categoryColumns[0],
        yKey: numericColumns[0],
        title: chartTitle(question),
      },
    }
  }

  // Ranking / category comparison → bar
  if (
    categoryColumns.length > 0 &&
    numericColumns.length > 0 &&
    (matches(question, R.RANKING_PATTERNS) || data.length > 1)
  ) {
    return {
      kind: 'chart',
      chartSubtype: 'bar',
      data,
      chartConfig: {
        xKey: categoryColumns[0],
        yKey: numericColumns[0],
        title: chartTitle(question),
      },
    }
  }

  // Wide or detailed data → table
  if (columns.length >= R.TABLE_MIN_COLUMNS || data.length >= R.TABLE_MIN_ROWS) {
    return { kind: 'table', data }
  }

  return { kind: 'table', data }
}
