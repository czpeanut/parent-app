'use client'
import { browserSupabase } from '@/lib/supabase-browser'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** 呼叫家長端伺服器 API（自動帶登入 token） */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data: { session } } = await browserSupabase().auth.getSession()
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `發生錯誤（${res.status}）`)
  return data as T
}
