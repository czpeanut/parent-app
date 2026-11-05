import { hashCode, isWellFormedCode, normalizeCode } from '@/lib/binding'
import { must, type Supa } from './db'

export const BIND_LIMIT_PER_HOUR = 10
export const BIND_FAIL_MESSAGE = '綁定碼錯誤或已過期'

export type BindResult =
  | { ok: true; student: { id: string; display_name: string }; already: boolean }
  | { ok: false; status: 400 | 429; error: string }

/** 同一帳號或同一 IP 一小時內嘗試超過 10 次就擋（交接文件 6.2-5） */
export async function rateLimited(supabase: Supa, userId: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000).toISOString()
  const byUser = await supabase.from('guardian_bind_attempts').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since)
  if (byUser.error) throw byUser.error
  if ((byUser.count ?? 0) >= BIND_LIMIT_PER_HOUR) return true
  if (!ip) return false
  const byIp = await supabase.from('guardian_bind_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since)
  if (byIp.error) throw byIp.error
  return (byIp.count ?? 0) >= BIND_LIMIT_PER_HOUR
}

type CodeRow = { id: string; student_id: string; expires_at: string; used_at: string | null; attempts: number }

/**
 * 家長輸入綁定碼（交接文件 6.2）：
 *   雜湊比對 → 未使用、未過期 → 標記使用（條件式更新，兩人同時用同一碼只有一人成功）
 *   → upsert student_guardians（active）。失敗一律回同一句話，不透露是哪裡錯。
 */
export async function bindWithCode(supabase: Supa, p: {
  userId: string; guardianId: string; ip: string | null; rawCode: string; relationship: string | null; pepper: string
}): Promise<BindResult> {
  if (await rateLimited(supabase, p.userId, p.ip)) return { ok: false, status: 429, error: '嘗試次數太多，請一小時後再試' }

  const code = normalizeCode(p.rawCode)
  const record = async (success: boolean) => must(await supabase.from('guardian_bind_attempts').insert({ user_id: p.userId, ip: p.ip, success }))
  const fail = async (): Promise<BindResult> => { await record(false); return { ok: false, status: 400, error: BIND_FAIL_MESSAGE } }
  if (!isWellFormedCode(code)) return fail()

  const row = must(await supabase.from('guardian_binding_codes').select('id, student_id, expires_at, used_at, attempts')
    .eq('code_hash', hashCode(code, p.pepper)).maybeSingle()) as CodeRow | null
  if (!row) return fail()
  must(await supabase.from('guardian_binding_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id))
  if (row.used_at || new Date(row.expires_at).getTime() <= Date.now()) return fail()

  const now = new Date().toISOString()
  const claimed = must(await supabase.from('guardian_binding_codes').update({ used_at: now, used_by: p.guardianId })
    .eq('id', row.id).is('used_at', null).select('id')) as { id: string }[]
  if (!claimed?.length) return fail()

  const existing = must(await supabase.from('student_guardians').select('id, status').eq('student_id', row.student_id).eq('guardian_id', p.guardianId).maybeSingle()) as { id: string; status: string } | null
  must(await supabase.from('student_guardians').upsert({
    student_id: row.student_id, guardian_id: p.guardianId, status: 'active', verified_at: now,
    ...(p.relationship ? { relationship: p.relationship } : {}),
  }, { onConflict: 'student_id,guardian_id' }))
  await record(true)

  const student = must(await supabase.from('students').select('id, display_name').eq('id', row.student_id).single()) as { id: string; display_name: string }
  return { ok: true, student, already: existing?.status === 'active' }
}
