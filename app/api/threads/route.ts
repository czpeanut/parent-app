import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, errorResponse, must } from '@/lib/server/db'
import { activeLinks, findGuardian, requireUser } from '@/lib/server/auth'
import { threadSummaries } from '@/lib/server/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 訊息列表：每位綁定的小孩一條對話串（最後一則、未讀數），新的在前 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const supabase = createServiceClient()
    const g = await findGuardian(supabase, user.id)
    if (!g) return NextResponse.json({ threads: [], unread_total: 0 })
    const links = await activeLinks(supabase, g.id)
    const ids = links.map(l => l.student_id)
    if (!ids.length) return NextResponse.json({ threads: [], unread_total: 0 })
    const students = must(await supabase.from('students').select('id, display_name').in('id', ids)) as { id: string; display_name: string }[]
    const names = new Map(students.map(s => [s.id, s.display_name]))
    const rows = (await threadSummaries(supabase, g.id, ids))
      .map(t => ({ student: { id: t.student_id, display_name: names.get(t.student_id) ?? '' }, last: t.last, unread: t.unread }))
      .sort((a, b) => (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? ''))
    return NextResponse.json({ threads: rows, unread_total: rows.reduce((n, r) => n + r.unread, 0) })
  } catch (e) { return errorResponse(e) }
}
