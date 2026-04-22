import Groq from 'groq-sdk'

let client: Groq | null = null

export function getGroq(): Groq {
  if (client) return client
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')
  client = new Groq({ apiKey })
  return client
}

export const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function groqComplete(params: {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  json?: boolean
}): Promise<string> {
  const res = await getGroq().chat.completions.create({
    model: GROQ_MODEL,
    messages: params.messages,
    temperature: params.temperature ?? 0.2,
    max_tokens: params.maxTokens ?? 1024,
    response_format: params.json ? { type: 'json_object' } : undefined,
  })
  return res.choices[0]?.message?.content?.trim() ?? ''
}

/** Strip Markdown code fences and parse JSON, with forgiving handling. */
export function parseJsonLoose<T>(raw: string): T {
  let text = raw.trim()
  if (text.startsWith('```json')) text = text.slice(7)
  else if (text.startsWith('```')) text = text.slice(3)
  if (text.endsWith('```')) text = text.slice(0, -3)
  return JSON.parse(text.trim()) as T
}
