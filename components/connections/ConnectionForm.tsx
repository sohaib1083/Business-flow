'use client'

import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiFetch } from '@/lib/store/chat-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Database,
  Server,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Plug,
} from 'lucide-react'

type ConnectionType = 'POSTGRES' | 'MYSQL' | 'MONGODB' | 'CSV' | 'EXCEL'

interface ConnectionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ConnectionFormData) => Promise<void>
  initialData?: {
    id?: string
    name?: string
    type?: ConnectionType
    credentials?: Record<string, unknown>
  }
  mode: 'create' | 'edit'
}

const baseSchema = z.object({
  name: z.string().min(1, 'Connection name is required').max(100, 'Name is too long'),
  type: z.enum(['POSTGRES', 'MYSQL', 'MONGODB', 'CSV', 'EXCEL']),
})

const postgresSchema = baseSchema.extend({
  type: z.literal('POSTGRES'),
  host: z.string().min(1, 'Host is required'),
  port: z.coerce.number().min(1).max(65535, 'Invalid port'),
  database: z.string().min(1, 'Database is required'),
  user: z.string().min(1, 'User is required'),
  password: z.string().min(1, 'Password is required'),
  ssl: z.boolean().optional().default(false),
})

const mysqlSchema = baseSchema.extend({
  type: z.literal('MYSQL'),
  host: z.string().min(1, 'Host is required'),
  port: z.coerce.number().min(1).max(65535, 'Invalid port'),
  database: z.string().min(1, 'Database is required'),
  user: z.string().min(1, 'User is required'),
  password: z.string().min(1, 'Password is required'),
  ssl: z.boolean().optional().default(false),
})

const mongoSchema = baseSchema.extend({
  type: z.literal('MONGODB'),
  uri: z.string().min(1, 'Connection URI is required'),
  database: z.string().min(1, 'Database name is required'),
})

const fileSchema = baseSchema.extend({
  type: z.enum(['CSV', 'EXCEL']),
  file: z.any().optional(),
})

const formSchema = z.discriminatedUnion('type', [
  postgresSchema,
  mysqlSchema,
  mongoSchema,
  fileSchema,
])

type ConnectionFormData = z.infer<typeof formSchema>

const CONNECTION_TYPES: Array<{
  value: ConnectionType
  label: string
  icon: React.ElementType
  description: string
}> = [
  {
    value: 'POSTGRES',
    label: 'PostgreSQL',
    icon: Database,
    description: 'Connect to a PostgreSQL database',
  },
  {
    value: 'MYSQL',
    label: 'MySQL',
    icon: Database,
    description: 'Connect to a MySQL database',
  },
  {
    value: 'MONGODB',
    label: 'MongoDB',
    icon: Server,
    description: 'Connect to a MongoDB cluster (Beta)',
  },
  {
    value: 'CSV',
    label: 'CSV Upload',
    icon: FileSpreadsheet,
    description: 'Upload a CSV file as a data source',
  },
  {
    value: 'EXCEL',
    label: 'Excel Upload',
    icon: Upload,
    description: 'Upload an Excel file as a data source',
  },
]

export function ConnectionForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  mode,
}: ConnectionFormProps) {
  const [testResult, setTestResult] = React.useState<{
    success: boolean
    message: string
  } | null>(null)
  const [isTesting, setIsTesting] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)

  const defaultType = initialData?.type ?? 'POSTGRES'

  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      type: defaultType,
      ...(defaultType === 'POSTGRES' || defaultType === 'MYSQL'
        ? {
            host: (initialData?.credentials?.host as string) ?? '',
            port: (initialData?.credentials?.port as number) ?? (defaultType === 'MYSQL' ? 3306 : 5432),
            database: (initialData?.credentials?.database as string) ?? '',
            user: (initialData?.credentials?.user as string) ?? '',
            password: '',
            ssl: (initialData?.credentials?.ssl as boolean) ?? false,
          }
        : {}),
      ...(defaultType === 'MONGODB'
        ? {
            uri: (initialData?.credentials?.uri as string) ?? '',
            database: (initialData?.credentials?.database as string) ?? '',
          }
        : {}),
    },
  })

  const watchedType = form.watch('type')

  React.useEffect(() => {
    setTestResult(null)
    setSelectedFile(null)
  }, [watchedType])

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const formData = form.getValues()
      if (formData.type === 'CSV' || formData.type === 'EXCEL') {
        setTestResult({
          success: !!selectedFile,
          message: selectedFile ? 'File ready for upload' : 'Please select a file first',
        })
        return
      }
      // Validate the form client-side; the real credential test happens when
      // the connection is saved (the POST /api/connections endpoint tests
      // credentials before persisting).
      const valid = await form.trigger()
      setTestResult({
        success: valid,
        message: valid
          ? 'Looks valid — click Save to verify the credentials.'
          : 'Please fix the form errors first.',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const buildCredentialsPayload = (data: ConnectionFormData): Record<string, unknown> => {
    if (data.type === 'POSTGRES' || data.type === 'MYSQL') {
      return {
        host: data.host,
        port: data.port,
        database: data.database,
        user: data.user,
        password: data.password,
        ssl: data.ssl ?? false,
      }
    }
    if (data.type === 'MONGODB') {
      return {
        uri: data.uri,
        database: data.database,
      }
    }
    return {}
  }

  const handleFormSubmit = async (data: ConnectionFormData) => {
    setIsSubmitting(true)
    try {
      if (data.type === 'CSV' || data.type === 'EXCEL') {
        if (!selectedFile && mode === 'create') {
          form.setError('root', { message: 'Please select a file' })
          return
        }

        if (selectedFile) {
          const formData = new FormData()
          formData.append('file', selectedFile)
          formData.append('name', data.name)
          formData.append('type', data.type)

          const response = await apiFetch('/api/upload', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            const result = await response.json()
            throw new Error(result.error || 'Upload failed')
          }
        }

        onOpenChange(false)
        form.reset()
        setSelectedFile(null)
        setTestResult(null)
        return
      }

      await onSubmit({
        ...data,
        credentials: buildCredentialsPayload(data),
      } as unknown as ConnectionFormData)

      onOpenChange(false)
      form.reset()
      setTestResult(null)
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Failed to save connection',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setSelectedFile(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  const isFileType = watchedType === 'CSV' || watchedType === 'EXCEL'
  const isEditingFile = isFileType && mode === 'edit'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            {mode === 'create' ? 'New Connection' : 'Edit Connection'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Connect a database or upload a file as a data source.'
              : 'Update your connection settings.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-5">
          {form.formState.errors.root && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {form.formState.errors.root.message}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Connection Name</Label>
            <Input
              id="name"
              placeholder="e.g. Production Database"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          {mode === 'create' && (
            <div className="space-y-2">
              <Label>Connection Type</Label>
              <div className="grid gap-2">
                {CONNECTION_TYPES.map((ct) => {
                  const Icon = ct.icon
                  return (
                    <button
                      key={ct.value}
                      type="button"
                      onClick={() => form.setValue('type', ct.value)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3 text-left transition-all hover:bg-accent/50',
                        watchedType === ct.value
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-5 w-5 shrink-0',
                          watchedType === ct.value ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{ct.label}</div>
                        <div className="text-xs text-muted-foreground">{ct.description}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {(watchedType === 'POSTGRES' || watchedType === 'MYSQL') && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    placeholder={watchedType === 'POSTGRES' ? 'localhost or db.example.com' : 'localhost or db.example.com'}
                    {...form.register('host')}
                  />
                  {'host' in form.formState.errors && form.formState.errors.host && (
                    <p className="text-xs text-destructive">
                      {(form.formState.errors.host as { message?: string }).message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    placeholder={watchedType === 'POSTGRES' ? '5432' : '3306'}
                    {...form.register('port')}
                  />
                  {'port' in form.formState.errors && form.formState.errors.port && (
                    <p className="text-xs text-destructive">
                      {(form.formState.errors.port as { message?: string }).message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="database">Database</Label>
                <Input
                  id="database"
                  placeholder="my_database"
                  {...form.register('database')}
                />
                {'database' in form.formState.errors && form.formState.errors.database && (
                  <p className="text-xs text-destructive">
                    {(form.formState.errors.database as { message?: string }).message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="user">User</Label>
                <Input
                  id="user"
                  placeholder="read_only_user"
                  {...form.register('user')}
                />
                {'user' in form.formState.errors && form.formState.errors.user && (
                  <p className="text-xs text-destructive">
                    {(form.formState.errors.user as { message?: string }).message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  Password{' '}
                  {mode === 'edit' && (
                    <span className="text-muted-foreground font-normal">(leave blank to keep current)</span>
                  )}
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={mode === 'edit' ? 'Enter new password' : 'Enter password'}
                  {...form.register('password', {
                    required: mode === 'create',
                  })}
                />
                {'password' in form.formState.errors && form.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {(form.formState.errors.password as { message?: string }).message}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Controller
                  name="ssl"
                  control={form.control}
                  render={({ field }) => (
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label>Use SSL</Label>
              </div>
            </div>
          )}

          {watchedType === 'MONGODB' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="uri">Connection URI</Label>
                <Input
                  id="uri"
                  placeholder="mongodb+srv://user:password@cluster.mongodb.net"
                  {...form.register('uri')}
                />
                {'uri' in form.formState.errors && form.formState.errors.uri && (
                  <p className="text-xs text-destructive">
                    {(form.formState.errors.uri as { message?: string }).message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="mongoDatabase">Database Name</Label>
                <Input
                  id="mongoDatabase"
                  placeholder="my_database"
                  {...form.register('database')}
                />
                {'database' in form.formState.errors && form.formState.errors.database && (
                  <p className="text-xs text-destructive">
                    {(form.formState.errors.database as { message?: string }).message}
                  </p>
                )}
              </div>

              <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
                <p className="text-xs text-yellow-500/90">
                  MongoDB support is currently in beta. Schema introspection uses document sampling and may not capture all field variations.
                </p>
              </div>
            </div>
          )}

          {(isFileType) && !isEditingFile && (
            <div className="space-y-3">
              <Label>Upload File</Label>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent/30',
                  selectedFile && 'border-primary/50 bg-primary/5'
                )}
              >
                <input
                  type="file"
                  accept={watchedType === 'CSV' ? '.csv' : '.xlsx,.xls'}
                  onChange={handleFileSelect}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="h-8 w-8 text-muted-foreground mb-3" />
                {selectedFile ? (
                  <div className="text-center">
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      Drag and drop your {watchedType === 'CSV' ? 'CSV' : 'Excel'} file here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {watchedType === 'CSV' ? 'Supports .csv files' : 'Supports .xlsx and .xls files'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isFileType && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleTest}
                disabled={isTesting}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>

              {testResult && (
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-md px-3 py-2 text-sm',
                    testResult.success
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-destructive/10 text-destructive border border-destructive/20'
                  )}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </>
              ) : mode === 'create' ? (
                'Create Connection'
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
