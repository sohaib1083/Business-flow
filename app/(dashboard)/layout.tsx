'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/firebase/auth-context'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { cn } from '@/lib/utils'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth()
  const router = useRouter()
  const [collapsed, setCollapsed] = React.useState(false)

  React.useEffect(() => {
    if (!initializing && !user) router.replace('/login')
  }, [initializing, user, router])

  if (initializing || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      <main
        className={cn(
          'min-h-screen transition-all duration-300 ease-in-out',
          collapsed ? 'pl-[68px]' : 'pl-[240px]',
        )}
      >
        <div className="mx-auto max-w-[1400px] p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
