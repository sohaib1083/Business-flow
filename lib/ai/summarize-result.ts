import { groqComplete } from './groq'
import { buildSummarizePrompt } from './prompts'
import { filterForLLM } from '@/lib/security/redact'

const MAX_ROWS_FOR_SUMMARY = 50

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatPreview(data: Record<string, unknown>[]): string {
  if (data.length === 0) return 'No data returned.'
  const columns = Object.keys(data[0])
  const header = `Columns: ${columns.join(', ')}\nRows: ${data.length}`
  const sample = data
    .slice(0, 10)
    .map((r) =>
      columns
        .map((c) => {
          const v = r[c]
          if (v === null || v === undefined) return 'null'
          if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
          return String(v)
        })
        .join(' | '),
    )
    .join('\n')
  return `${header}\n\n${sample}`
}

function heuristicSummary(
  data: Record<string, unknown>[],
  question: string,
  kind: string,
): string {
  if (data.length === 0) {
    return 'The query returned no results. Try adjusting your question or filters.'
  }
  const columns = Object.keys(data[0])
  const row = data[0]

  if (data.length === 1 && columns.length <= 2) {
    const numericCol = columns.find((c) => typeof row[c] === 'number')
    if (numericCol) {
      const val = row[numericCol] as number
      const label = columns.find((c) => c !== numericCol)
      return label && row[label]
        ? `${row[label]}: ${formatNum(val)}.`
        : `The result is ${formatNum(val)}.`
    }
    return columns.map((c) => String(row[c])).join(', ') + '.'
  }

  if (kind === 'chart') {
    const nums = columns.filter((c) => data.some((r) => typeof r[c] === 'number'))
    if (nums.length > 0) {
      const first = nums[0]
      const values = data
        .map((r) => r[first] as number)
        .filter((v) => typeof v === 'number')
      const total = values.reduce((a, b) => a + b, 0)
      return `Across ${data.length} data points, the total ${first} is ${formatNum(total)}.`
    }
  }

  return `Returned ${data.length} row${data.length === 1 ? '' : 's'} across columns: ${columns.join(', ')}.`
}

export async function summarizeResult(
  question: string,
  data: Record<string, unknown>[],
  rowCount: number,
): Promise<string> {
  if (data.length === 0) {
    return 'The query returned no results. Try adjusting your question or filters.'
  }

  const safe = filterForLLM(data, MAX_ROWS_FOR_SUMMARY)
  try {
    const raw = await groqComplete({
      messages: [
        { role: 'system', content: buildSummarizePrompt(question, safe, rowCount) },
      ],
      temperature: 0.3,
      maxTokens: 256,
    })
    const trimmed = raw.trim()
    if (trimmed) return trimmed
  } catch {
    /* fall through */
  }
  return heuristicSummary(data, question, 'text')
}
