import { must, type Supa } from './db'
import type { Guardian } from './auth'

/**
 * 家長看得到的訊息（與 student-app lib/services/messages.ts 的規則一致）：
 *   recipient = 'guardians'          → 這位學生所有 active 家長
 *   recipient = 'teacher'/'director' → 只有寫的那位家長
 */
export type GuardianMessage = {
  id: string; sender_type: 'staff' | 'guardian' | 'system'; sender_name: string | null
  recipient: 'guardians' | 'teacher' | 'director'; body: string; created_at: string; mine: boolean
}
type Row = Omit<GuardianMessage, 'mine'> & { sender_guardian_id: string | null }

const COLS = 'id, sender_type, sender_name, sender_guardian_id, recipient, body, created_at'

export async function findThread(supabase: Supa, studentId: string): Promise<{ id: string } | null> {
  return must(await supabase.from('message_threads').select('id').eq('student_id', studentId).maybeSingle()) as { id: string } | null
}

export async function ensureThread(supabase: Supa, studentId: string): Promise<{ id: string }> {
  must(await supabase.from('message_threads').upsert({ student_id: studentId }, { onConflict: 'student_id', ignoreDuplicates: true }))
  return must(await supabase.from('message_threads').select('id').eq('student_id', studentId).single()) as { id: string }
}

/** 對話串裡這位家長看得到的訊息，舊的在前（最多最近 500 則） */
export async function guardianMessages(supabase: Supa, threadId: string, guardianId: string): Promise<GuardianMessage[]> {
  const [toGuardians, mine] = await Promise.all([
    supabase.from('messages').select(COLS).eq('thread_id', threadId).eq('recipient', 'guardians').order('created_at', { ascending: false }).limit(500),
    supabase.from('messages').select(COLS).eq('thread_id', threadId).eq('sender_guardian_id', guardianId).order('created_at', { ascending: false }).limit(500),
  ])
  const byId = new Map<string, Row>()
  for (const r of [...(must(toGuardians) as Row[]), ...(must(mine) as Row[])]) byId.set(r.id, r)
  return [...byId.values()]
    .filter(r => r.recipient === 'guardians' || r.sender_guardian_id === guardianId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-500)
    .map(r => toGuardianMessage(r, guardianId))
}

/** 只挑家長端該看到的欄位（不外露 sender_staff_email、sender_guardian_id） */
function toGuardianMessage(r: Row, guardianId: string): GuardianMessage {
  return {
    id: r.id, sender_type: r.sender_type, sender_name: r.sender_name, recipient: r.recipient,
    body: r.body, created_at: r.created_at, mine: r.sender_guardian_id === guardianId,
  }
}

export async function markGuardianRead(supabase: Supa, threadId: string, guardianId: string) {
  must(await supabase.from('message_reads').upsert(
    { thread_id: threadId, reader_type: 'guardian', reader_key: guardianId, last_read_at: new Date().toISOString() },
    { onConflict: 'thread_id,reader_type,reader_key' },
  ))
}

/** 每位學生：這位家長還沒讀的老師／主任訊息數 */
export async function guardianUnread(supabase: Supa, guardianId: string, studentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!studentIds.length) return out
  const threads = must(await supabase.from('message_threads').select('id, student_id').in('student_id', studentIds)) as { id: string; student_id: string }[]
  if (!threads.length) return out
  const ids = threads.map(t => t.id)
  const reads = must(await supabase.from('message_reads').select('thread_id, last_read_at').eq('reader_type', 'guardian').eq('reader_key', guardianId).in('thread_id', ids)) as { thread_id: string; last_read_at: string }[]
  const lastRead = new Map(reads.map(r => [r.thread_id, r.last_read_at]))
  const msgs = must(await supabase.from('messages').select('thread_id, created_at').in('thread_id', ids).eq('recipient', 'guardians').limit(5000)) as { thread_id: string; created_at: string }[]
  const studentOf = new Map(threads.map(t => [t.id, t.student_id]))
  for (const m of msgs) {
    const lr = lastRead.get(m.thread_id)
    if (lr && new Date(m.created_at) <= new Date(lr)) continue
    const s = studentOf.get(m.thread_id)!
    out.set(s, (out.get(s) ?? 0) + 1)
  }
  return out
}

/** 家長發訊息時的顯示名稱：家長自己設定的名字 → 「陳一號的媽媽」→「陳一號的家長」 */
export function guardianSenderName(guardian: Pick<Guardian, 'display_name'>, studentName: string | null, relationship: string | null): string {
  const own = guardian.display_name?.trim()
  if (own) return own.slice(0, 40)
  return `${studentName ?? '學生'}的${relationship?.trim() || '家長'}`.slice(0, 40)
}

export async function postGuardianMessage(supabase: Supa, p: {
  studentId: string; guardianId: string; senderName: string; to: 'teacher' | 'director'; body: string
}): Promise<GuardianMessage> {
  const thread = await ensureThread(supabase, p.studentId)
  const row = (must(await supabase.from('messages').insert({
    thread_id: thread.id, sender_type: 'guardian', sender_guardian_id: p.guardianId, sender_name: p.senderName,
    recipient: p.to, body: p.body,
  }).select(COLS)) as Row[])[0]
  must(await supabase.from('message_threads').update({ last_message_at: row.created_at }).eq('id', thread.id))
  // 自己寫的訊息不算未讀；順便把對話串標成已讀
  await markGuardianRead(supabase, thread.id, p.guardianId)
  return toGuardianMessage(row, p.guardianId)
}
