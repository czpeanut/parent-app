import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, errorResponse } from '@/lib/server/db'
import { findGuardian, requireUser } from '@/lib/server/auth'
import { guardianUnread } from '@/lib/server/messages'
import { serverEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Child = { student: { id: string; display_name: string } } & Record<string, unknown>

/**
 * 轉呼叫 student-app 的 GET /api/guardian/children（帶家長自己的 token，server-to-server），
 * 再補上家長端自己算的未讀訊息數。
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req)
    let upstream: Response
    try {
      upstream = await fetch(`${serverEnv.studentAppUrl()}/api/guardian/children`, {
        headers: { authorization: `Bearer ${user.token}`, accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      })
    } catch {
      return NextResponse.json({ error: '暫時連不上 CODEX STUDY，請稍後再試' }, { status: 502 })
    }
    if (upstream.status === 401) return NextResponse.json({ error: '請重新登入' }, { status: 401 })
    if (!upstream.ok) return NextResponse.json({ error: '暫時讀不到小孩的資料，請稍後再試' }, { status: 502 })
    const data = await upstream.json() as { date?: string; children?: Child[] }
    const children = data.children ?? []

    const supabase = createServiceClient()
    const g = await findGuardian(supabase, user.id)
    const unread = g ? await guardianUnread(supabase, g.id, children.map(c => c.student.id)) : new Map<string, number>()
    return NextResponse.json({
      date: data.date ?? null,
      children: children.map(c => ({ ...c, unread: unread.get(c.student.id) ?? 0 })),
    })
  } catch (e) { return errorResponse(e) }
}
