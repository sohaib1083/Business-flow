'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Database,
  History,
  LogOut,
  MessageSquare,
  Settings,
} from 'lucide-react'
import { useAuth } from '@/lib/firebase/auth-context'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/connections', label: 'Connections', icon: Database },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarNavProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export function SidebarNav({ collapsed, onToggleCollapse }: SidebarNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-sidebar transition-all duration-300',
        collapsed ? 'w-[68px]' : 'w-[240px]',
      )}
    >
      <div className="flex items-center justify-between px-4 py-5 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">BF</span>
            </div>
            <span className="font-semibold text-sm">Buisness Flow</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <div className="px-2 pb-3">
            <p className="text-xs font-medium truncate">{user.displayName ?? 'You'}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors',
            collapsed && 'justify-center px-0',
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
