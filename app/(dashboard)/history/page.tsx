'use client'

import * as React from 'react'
import {
  Search,
  RefreshCw,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  BarChart3,
  Table2,
  FileText,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Play,
  Clock3,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, formatDuration } from '@/lib/utils'
import type { QueryHistoryEntry } from '@/types/query'
import { apiFetch } from '@/lib/store/chat-store'

type StatusFilter = 'ALL' | 'SUCCESS' | 'FAILED' | 'BLOCKED'

const STATUS_CONFIG = {
  SUCCESS: {
    icon: CheckCircle2,
    label: 'Success',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
  },
  FAILED: {
    icon: XCircle,
    label: 'Failed',
    color: 'text-red-400',
    bg: 'bg-red-400/10',
  },
  BLOCKED: {
    icon: ShieldAlert,
    label: 'Blocked',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
  },
} as const

const RESPONSE_KIND_CONFIG = {
  TEXT: { icon: FileText, label: 'Text', color: 'text-chart-2' },
  TABLE: { icon: Table2, label: 'Table', color: 'text-chart-3' },
  CHART: { icon: BarChart3, label: 'Chart', color: 'text-primary' },
} as const

export default function HistoryPage() {
  const [entries, setEntries] = React.useState<QueryHistoryEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ALL')
  const [sortColumn, setSortColumn] = React.useState<string>('createdAt')
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = React.useState(false)

  const filteredEntries = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return entries.filter((e) => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false
      if (q && !e.question.toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, searchQuery, statusFilter])
  const total = filteredEntries.length

  const fetchHistory = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await apiFetch(`/api/history?limit=200`)
      if (!response.ok) throw new Error('Failed to fetch history')
      const data = await response.json()
      setEntries(data.entries || [])
    } catch (error) {
      console.error('Failed to fetch history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleRetry = (entry: QueryHistoryEntry) => {
    const chatUrl = `/chat`
    window.open(chatUrl, '_self')
  }

  const handleExportHistory = () => {
    if (entries.length === 0) return

    const headers = [
      'Question',
      'Connection',
      'Status',
      'Response Type',
      'Duration',
      'Rows',
      'Time',
    ]
    const rows = entries.map((entry) => [
      `"${entry.question.replace(/"/g, '""')}"`,
      entry.connectionName,
      entry.status,
      entry.responseKind || '-',
      entry.durationMs ? String(entry.durationMs) : '-',
      entry.rowCount !== null ? String(entry.rowCount) : '-',
      entry.createdAt,
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'query-history.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const formatTime = (isoString: string) => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 opacity-40" />
    return sortDirection === 'asc' ? (
      <ArrowUpDown className="w-3 h-3 text-primary" />
    ) : (
      <ArrowUpDown className="w-3 h-3 text-primary" />
    )
  }

  const successCount = entries.filter((e) => e.status === 'SUCCESS').length
  const failedCount = entries.filter((e) => e.status === 'FAILED').length
  const avgDuration =
    entries.filter((e) => e.durationMs).length > 0
      ? Math.round(
          entries
            .filter((e) => e.durationMs)
            .reduce((sum, e) => sum + (e.durationMs || 0), 0) /
            entries.filter((e) => e.durationMs).length
        )
      : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Query History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage your past query runs across all connections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchHistory}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm',
              'border border-border hover:border-primary/30',
              'text-muted-foreground hover:text-foreground',
              'bg-card transition-all'
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={handleExportHistory}
            disabled={entries.length === 0}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm',
              'border border-border hover:border-primary/30',
              'text-muted-foreground hover:text-foreground',
              'bg-card transition-all',
              'disabled:opacity-30 disabled:cursor-not-allowed'
            )}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Total Queries</p>
            <p className="text-xl font-bold text-foreground mt-1">
              {total}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Success Rate</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">
              {entries.length > 0
                ? `${Math.round((successCount / entries.length) * 100)}%`
                : '-'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Avg Duration</p>
            <p className="text-xl font-bold text-primary mt-1">
              {avgDuration > 0 ? formatDuration(avgDuration) : '-'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-xl font-bold text-red-400 mt-1">
              {failedCount}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search queries..."
            className={cn(
              'w-full pl-10 pr-4 py-2.5 rounded-lg text-sm',
              'bg-card border border-border',
              'text-foreground placeholder:text-muted-foreground/70',
              'focus:outline-none focus:border-primary/50',
              'transition-colors'
            )}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm',
              'border border-border',
              'text-muted-foreground hover:text-foreground',
              'hover:border-primary/30 transition-all',
              showFilters && 'border-primary/30 text-primary'
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
          </button>

          {(['ALL', 'SUCCESS', 'FAILED', 'BLOCKED'] as StatusFilter[]).map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  statusFilter === status
                    ? 'bg-primary text-background'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                )}
              >
                {status === 'ALL' ? 'All' : STATUS_CONFIG[status]?.label}
              </button>
            )
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <Clock3 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">
              No query history
            </h3>
            <p className="text-sm text-muted-foreground max-w-md text-center">
              {searchQuery || statusFilter !== 'ALL'
                ? 'No queries match your current filters. Try adjusting your search or filters.'
                : 'Your query runs will appear here once you start asking questions in the chat.'}
            </p>
            {!searchQuery && statusFilter === 'ALL' && (
              <a
                href="/chat"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-background hover:brightness-110 transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                Start Chatting
              </a>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th
                    onClick={() => handleSort('question')}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Question {getSortIcon('question')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Connection
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Type
                  </th>
                  <th
                    onClick={() => handleSort('durationMs')}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Duration {getSortIcon('durationMs')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Rows
                  </th>
                  <th
                    onClick={() => handleSort('createdAt')}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Time {getSortIcon('createdAt')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, idx) => {
                  const statusConfig =
                    STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG]
                  const StatusIcon = statusConfig?.icon || XCircle
                  const kindConfig =
                    RESPONSE_KIND_CONFIG[
                      entry.responseKind as keyof typeof RESPONSE_KIND_CONFIG
                    ]
                  const KindIcon = kindConfig?.icon || FileText

                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        'border-b border-border last:border-b-0',
                        'hover:bg-secondary transition-colors',
                        idx % 2 === 1 && 'bg-card/50'
                      )}
                    >
                      <td className="px-4 py-3 max-w-[300px]">
                        <p className="text-foreground truncate font-medium">
                          {entry.question}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-foreground/80 text-xs">
                          {entry.connectionName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
                            statusConfig?.bg,
                            statusConfig?.color
                          )}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig?.label}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {entry.responseKind && kindConfig ? (
                          <div
                            className={cn(
                              'inline-flex items-center gap-1 text-xs',
                              kindConfig.color
                            )}
                          >
                            <KindIcon className="w-3 h-3" />
                            {kindConfig.label}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/70">
                            -
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-foreground/80">
                          {entry.durationMs
                            ? formatDuration(entry.durationMs)
                            : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-foreground/80">
                          {entry.rowCount !== null
                            ? formatNumber(entry.rowCount)
                            : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(entry.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRetry(entry)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs',
                            'text-primary hover:bg-primary/10',
                            'transition-all'
                          )}
                          title="Re-run query"
                        >
                          <Play className="w-3 h-3" />
                          Run
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
