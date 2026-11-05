import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { serverEnv } from '@/lib/env'
import { must, HttpError, type Supa } from './db'

export type AuthedUser = { id: string; email: string | null; name: string | null; token: string }
export type Guardian = { id: string; user_id: string; display_name: string | null; phone: string | null; email: string | null }

export const bearer = (req: NextRequest) => (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()

/**
 * 驗證家長的 Supabase access token。學生合成帳號（@student.local）一律拒絕：
 * 共用 auth.users，學生帳號不能拿來當家長。
 */
export async function getAuthedUser(req: NextRequest): Promise<AuthedUser | null> {
  const token = bearer(req)
  if (!token) return null
  const supa = createClient(serverEnv.supabaseUrl(), serverEnv.anonKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return null
  const email = user.email ?? null
  if (email && email.toLowerCase().endsWith('@student.local')) return null
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null
  return { id: user.id, email, name, token }
}

export async function requireUser(req: NextRequest): Promise<AuthedUser> {
  const u = await getAuthedUser(req)
  if (!u) throw new HttpError(401, '請先登入')
  return u
}

const GUARDIAN_COLS = 'id, user_id, display_name, phone, email'

/** 找出（沒有就建立）這個帳號的 guardians 列 */
export async function ensureGuardian(supabase: Supa, user: AuthedUser): Promise<Guardian> {
  const found = must(await supabase.from('guardians').select(GUARDIAN_COLS).eq('user_id', user.id).maybeSingle()) as Guardian | null
  if (found) return found
  const rows = must(await supabase.from('guardians')
    .upsert({ user_id: user.id, email: user.email, display_name: user.name }, { onConflict: 'user_id', ignoreDuplicates: true })
    .select(GUARDIAN_COLS)) as Guardian[]
  if (rows?.length) return rows[0]
  // 同時兩個請求建立：另一個先寫入了，重新讀一次
  return must(await supabase.from('guardians').select(GUARDIAN_COLS).eq('user_id', user.id).single()) as Guardian
}

export async function findGuardian(supabase: Supa, userId: string): Promise<Guardian | null> {
  return must(await supabase.from('guardians').select(GUARDIAN_COLS).eq('user_id', userId).maybeSingle()) as Guardian | null
}

export type Link = { student_id: string; relationship: string | null }

/** 家長 active 綁定的小孩 */
export async function activeLinks(supabase: Supa, guardianId: string): Promise<Link[]> {
  return must(await supabase.from('student_guardians').select('student_id, relationship').eq('guardian_id', guardianId).eq('status', 'active')) as Link[]
}

/** 確認家長綁定了這位學生（active），否則 403 */
export async function requireLink(supabase: Supa, guardianId: string, studentId: string): Promise<Link> {
  const row = must(await supabase.from('student_guardians').select('student_id, relationship')
    .eq('guardian_id', guardianId).eq('student_id', studentId).eq('status', 'active').maybeSingle()) as Link | null
  if (!row) throw new HttpError(403, '沒有綁定這位學生')
  return row
}

/** 取用戶端 IP（Vercel 會帶 x-forwarded-for） */
export function clientIp(req: NextRequest): string | null {
  const xf = req.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0].trim() || null
  return req.headers.get('x-real-ip')
}
