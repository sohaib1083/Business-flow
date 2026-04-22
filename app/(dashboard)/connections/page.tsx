'use client'

import * as React from 'react'
import { ConnectionCard } from '@/components/connections/ConnectionCard'
import { ConnectionForm } from '@/components/connections/ConnectionForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/store/chat-store'
import type { DataConnection } from '@/types/session'
import {
  Plus,
  Search,
  Database,
  Server,
  FileSpreadsheet,
  Plug,
  PlugZap,
  Loader2,
} from 'lucide-react'

type ConnectionType = 'POSTGRES' | 'MYSQL' | 'MONGODB' | 'CSV' | 'EXCEL'
type Connection = DataConnection
type FilterType = 'ALL' | ConnectionType

const FILTER_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'POSTGRES', label: 'PostgreSQL' },
  { value: 'MYSQL', label: 'MySQL' },
  { value: 'MONGODB', label: 'MongoDB' },
  { value: 'CSV', label: 'CSV' },
  { value: 'EXCEL', label: 'Excel' },
]

export default function ConnectionsPage() {
  const [connections, setConnections] = React.useState<Connection[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingConnection, setEditingConnection] = React.useState<Connection | null>(null)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterType, setFilterType] = React.useState<FilterType>('ALL')

  const fetchConnections = React.useCallback(async () => {
    try {
      const response = await apiFetch('/api/connections')
      if (!response.ok) throw new Error('Failed to fetch connections')
      const data = await response.json()
      setConnections(data.connections ?? [])
    } catch (error) {
      toast.error('Failed to load connections')
      console.error('Error fetching connections:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchConnections()
  }, [fetchConnections])

  const handleCreateConnection = async (data: Record<string, unknown>) => {
    const response = await apiFetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Failed to create connection')
    }
    toast.success('Connection created')
    await fetchConnections()
  }

  const handleUpdateConnection = async () => {
    // Update isn't supported in the simple model — delete and recreate.
    toast.info('Delete and recreate to change credentials')
  }

  const handleDeleteConnection = async (id: string) => {
    const response = await apiFetch(`/api/connections/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Failed to delete connection')
    }
    toast.success('Connection deleted')
    setConnections((prev) => prev.filter((c) => c.id !== id))
  }

  const handleTestConnection = async (id: string) => {
    const promise = apiFetch(`/api/connections/${id}/test`, { method: 'POST' }).then(
      async (response) => {
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.message || data.error || 'Connection test failed')
        }
        await fetchConnections()
        return data as { success: boolean; message: string }
      },
    )
    toast.promise(promise, {
      loading: 'Testing connection...',
      success: (result) => result.message,
      error: (err: Error) => err.message,
    })
    // Await so the card's spinner mirrors the real state and throws if it fails.
    await promise.catch(() => undefined)
  }

  const handleEditConnection = (id: string) => {
    const conn = connections.find((c) => c.id === id)
    if (conn) {
      setEditingConnection(conn)
      setFormOpen(true)
    }
  }

  const filteredConnections = React.useMemo(() => {
    let result = connections

    if (filterType !== 'ALL') {
      result = result.filter((c) => c.type === filterType)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.type.toLowerCase().includes(query)
      )
    }

    return result
  }, [connections, filterType, searchQuery])

  const activeCount = connections.filter((c) => c.status === 'ACTIVE').length
  const errorCount = connections.filter((c) => c.status === 'ERROR').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your data sources and database connections.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingConnection(null)
            setFormOpen(true)
          }}
          className="shrink-0"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </div>

      {/* Stats */}
      {connections.length > 0 && (
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-sm">
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-muted-foreground">
              {activeCount} active
            </span>
          </div>
          {errorCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <div className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-muted-foreground">
                {errorCount} error{errorCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            {connections.length} total
          </div>
        </div>
      )}

      {/* Search and Filters */}
      {connections.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search connections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilterType(option.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  filterType === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : connections.length === 0 ? (
        <EmptyState onAddConnection={() => setFormOpen(true)} />
      ) : filteredConnections.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">No connections match your search.</p>
          <Button
            variant="link"
            className="mt-2"
            onClick={() => {
              setSearchQuery('')
              setFilterType('ALL')
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredConnections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              id={connection.id}
              name={connection.name}
              type={connection.type}
              status={connection.status}
              fileSizeBytes={connection.fileSizeBytes}
              lastTestedAt={connection.lastTestedAt}
              onDelete={handleDeleteConnection}
              onTest={handleTestConnection}
              onEdit={handleEditConnection}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <ConnectionForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingConnection(null)
        }}
        onSubmit={
          editingConnection
            ? () => handleUpdateConnection()
            : (data) => handleCreateConnection(data as unknown as Record<string, unknown>)
        }
        initialData={
          editingConnection
            ? {
                id: editingConnection.id,
                name: editingConnection.name,
                type: editingConnection.type,
              }
            : undefined
        }
        mode={editingConnection ? 'edit' : 'create'}
      />
    </div>
  )
}

function EmptyState({ onAddConnection }: { onAddConnection: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary">
          <Plug className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
          <Plus className="h-4 w-4 text-primary" />
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-2">No connections yet</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        Connect a database or upload a file to start asking questions about your data.
        You can connect to PostgreSQL, MySQL, MongoDB, or upload CSV and Excel files.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={onAddConnection}>
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </div>

      <div className="flex gap-6 mt-10 text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <Database className="h-5 w-5 text-blue-400" />
          </div>
          <span className="text-xs">PostgreSQL</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <Database className="h-5 w-5 text-orange-400" />
          </div>
          <span className="text-xs">MySQL</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <Server className="h-5 w-5 text-emerald-400" />
          </div>
          <span className="text-xs">MongoDB</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <FileSpreadsheet className="h-5 w-5 text-cyan-400" />
          </div>
          <span className="text-xs">Files</span>
        </div>
      </div>
    </div>
  )
}
