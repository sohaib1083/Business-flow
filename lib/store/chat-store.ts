'use client'

import { create } from 'zustand'
import { firebaseAuth } from '@/lib/firebase/client'
import type { DataConnection, QueryMessage, QuerySession, MessageContent } from '@/types/session'
import type { QueryRunResult } from '@/types/query'

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const current = firebaseAuth.currentUser
  const token = current ? await current.getIdToken() : null
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

interface ChatState {
  sessions: QuerySession[]
  activeSessionId: string | null
  messages: QueryMessage[]
  connections: DataConnection[]
  activeConnectionId: string | null
  isLoading: boolean
  isStreaming: boolean
  illustrations: boolean
  error: string | null

  setActiveConnectionId: (id: string | null) => void
  setIllustrations: (on: boolean) => void

  fetchSessions: () => Promise<void>
  fetchConnections: () => Promise<void>
  createSession: (connectionId: string, title?: string) => Promise<QuerySession | null>
  switchSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  sendMessage: (question: string) => Promise<void>
  retryLastQuery: () => Promise<void>
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  connections: [],
  activeConnectionId: null,
  isLoading: false,
  isStreaming: false,
  illustrations: true,
  error: null,

  setActiveConnectionId: (id) => set({ activeConnectionId: id }),
  setIllustrations: (on) => set({ illustrations: on }),

  async fetchSessions() {
    try {
      const res = await apiFetch('/api/sessions')
      if (!res.ok) throw new Error('Failed to load sessions')
      const data = (await res.json()) as { sessions: QuerySession[] }
      set({ sessions: data.sessions })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load sessions' })
    }
  },

  async fetchConnections() {
    try {
      const res = await apiFetch('/api/connections')
      if (!res.ok) throw new Error('Failed to load connections')
      const data = (await res.json()) as { connections: DataConnection[] }
      set({ connections: data.connections })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load connections' })
    }
  },

  async createSession(connectionId, title) {
    try {
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, title }),
      })
      if (!res.ok) throw new Error('Failed to create session')
      const { session } = (await res.json()) as { session: QuerySession }
      set((s) => ({
        sessions: [session, ...s.sessions],
        activeSessionId: session.id,
        activeConnectionId: connectionId,
        messages: [],
      }))
      return session
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to create session' })
      return null
    }
  },

  async switchSession(sessionId) {
    set({ activeSessionId: sessionId, messages: [], isLoading: true })
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Failed to load session')
      const data = (await res.json()) as {
        session: QuerySession
        messages: QueryMessage[]
      }
      set({
        messages: data.messages,
        activeConnectionId: data.session.connectionId,
        isLoading: false,
      })
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load session' })
    }
  },

  async deleteSession(sessionId) {
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete session')
      set((s) => {
        const remaining = s.sessions.filter((x) => x.id !== sessionId)
        const isActive = s.activeSessionId === sessionId
        return {
          sessions: remaining,
          activeSessionId: isActive ? (remaining[0]?.id ?? null) : s.activeSessionId,
          messages: isActive ? [] : s.messages,
          activeConnectionId: isActive ? null : s.activeConnectionId,
        }
      })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete session' })
    }
  },

  async sendMessage(question) {
    const { activeSessionId, activeConnectionId, illustrations } = get()
    if (!activeSessionId || !activeConnectionId) {
      set({ error: 'No active session or connection' })
      return
    }

    const typingId = `tmp_${Date.now()}_typing`
    const userTmp: QueryMessage = {
      id: `tmp_${Date.now()}_user`,
      sessionId: activeSessionId,
      role: 'USER',
      content: { type: 'text', text: question },
      createdAt: new Date().toISOString(),
    }
    const typing: QueryMessage = {
      id: typingId,
      sessionId: activeSessionId,
      role: 'ASSISTANT',
      content: { type: 'text', text: '__TYPING__' },
      createdAt: new Date().toISOString(),
    }

    set((s) => ({
      messages: [...s.messages, userTmp, typing],
      isLoading: true,
      isStreaming: true,
      error: null,
    }))

    try {
      const res = await apiFetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          connectionId: activeConnectionId,
          question,
          illustrations,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Query failed')
      }

      const result = (await res.json()) as QueryRunResult
      const assistantContent: MessageContent = {
        type: 'response',
        summary: result.response.summary,
        responseKind: result.response.kind,
        chartSubtype: result.response.chartSubtype,
        data: result.response.data,
        chartConfig: result.response.chartConfig,
        compiledQuery: result.compiledQuery ?? undefined,
      }

      set((s) => {
        const filtered = s.messages.filter((m) => m.id !== typingId && m.id !== userTmp.id)
        const userMsg: QueryMessage = {
          id: `msg_${result.runId}_u`,
          sessionId: activeSessionId,
          role: 'USER',
          content: { type: 'query', question, runId: result.runId },
          createdAt: new Date().toISOString(),
        }
        const asstMsg: QueryMessage = {
          id: `msg_${result.runId}_a`,
          sessionId: activeSessionId,
          role: 'ASSISTANT',
          content: assistantContent,
          createdAt: new Date().toISOString(),
        }
        return {
          messages: [...filtered, userMsg, asstMsg],
          isLoading: false,
          isStreaming: false,
        }
      })
    } catch (e) {
      set((s) => {
        const filtered = s.messages.filter((m) => m.id !== typingId)
        const errMsg: QueryMessage = {
          id: `err_${Date.now()}`,
          sessionId: activeSessionId,
          role: 'ASSISTANT',
          content: { type: 'error', message: e instanceof Error ? e.message : 'Query failed' },
          createdAt: new Date().toISOString(),
        }
        return {
          messages: [...filtered, errMsg],
          isLoading: false,
          isStreaming: false,
          error: e instanceof Error ? e.message : 'Query failed',
        }
      })
    }
  },

  async retryLastQuery() {
    const { messages } = get()
    const lastUser = [...messages].reverse().find((m) => m.role === 'USER')
    if (!lastUser) return
    const question =
      lastUser.content.type === 'text'
        ? lastUser.content.text
        : lastUser.content.type === 'query'
          ? lastUser.content.question
          : null
    if (!question) return
    set((s) => ({ messages: s.messages.slice(0, -1) }))
    await get().sendMessage(question)
  },
}))

export { apiFetch }
