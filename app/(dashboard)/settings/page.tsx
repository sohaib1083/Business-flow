'use client'

import * as React from 'react'
import { useAuth } from '@/lib/firebase/auth-context'
import { useChatStore } from '@/lib/store/chat-store'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { illustrations, setIllustrations } = useChatStore()
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium">Profile</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <p className="text-sm">{user?.displayName ?? '—'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <p className="text-sm">{user?.email ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium">Preferences</h2>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="illustrations" className="text-sm">
                Include visualizations
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                When on, answers automatically render as charts or tables when the data suits it.
                Turn off for plain-text answers only.
              </p>
            </div>
            <Switch
              id="illustrations"
              checked={illustrations}
              onCheckedChange={setIllustrations}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Button
            variant="outline"
            onClick={async () => {
              await signOut()
              router.replace('/login')
            }}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
