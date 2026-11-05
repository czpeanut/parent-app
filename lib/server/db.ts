import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serverEnv } from '@/lib/env'

export function createServiceClient() {
  return createClient(serverEnv.supabaseUrl(), serverEnv.serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } })
}
export type Supa = ReturnType<typeof createServiceClient>

export class DbError extends Error {
  constructor(message: string, public code?: string) { super(message) }
}

/** supabase 回傳的 { data, error } → data，error 直接丟出 */
export function must<T>(r: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (r.error) throw new DbError(r.error.message, r.error.code)
  return r.data as T
}

/** 資料表不存在（migration 未執行）時的錯誤代碼 */
const MISSING_TABLE = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST205', 'PGRST204'])

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
  const code = e instanceof DbError ? e.code : (e as { code?: string })?.code
  if (code && MISSING_TABLE.has(code)) {
    return NextResponse.json({ error: '資料庫尚未更新：請在 Supabase SQL Editor 執行 migrations 資料夾中尚未執行的檔案', code: 'migration_required' }, { status: 503 })
  }
  console.error('[api]', e instanceof Error ? e.message : String(e))
  return NextResponse.json({ error: '伺服器錯誤，請稍後再試' }, { status: 500 })
}

/** 台灣時間的日期（YYYY-MM-DD） */
export function taipeiDay(d: Date = new Date()): string {
  return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}
