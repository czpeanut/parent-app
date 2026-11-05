import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, errorResponse, HttpError, must } from '@/lib/server/db'
import { findGuardian, requireLink, requireUser } from '@/lib/server/auth'
import { findThread, guardianMessages, guardianSenderName, markGuardianRead, postGuardianMessage } from '@/lib/server/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ studentId: string }> }

async function context(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  const { studentId } = await ctx.params
  const supabase = createServiceClient()
  const g = z.guid().safeParse(studentId).success ? await findGuardian(supabase, user.id) : null
  if (!g) throw new HttpError(403, '沒有綁定這位學生')
  const link = await requireLink(supabase, g.id, studentId)
  const student = must(await supabase.from('students').select('id, display_name').eq('id', studentId).single()) as { id: string; display_name: string }
  return { supabase, g, link, student }
}

/** 讀對話串（舊的在前），並標成已讀 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const c = await context(req, ctx)
    const thread = await findThread(c.supabase, c.student.id)
    if (!thread) return NextResponse.json({ student: c.student, messages: [] })
    const messages = await guardianMessages(c.supabase, thread.id, c.g.id)
    await markGuardianRead(c.supabase, thread.id, c.g.id)
    return NextResponse.json({ student: c.student, messages })
  } catch (e) { return errorResponse(e) }
}

const Body = z.object({
  to: z.enum(['teacher', 'director']),
  body: z.string().trim().min(1, '請輸入訊息').max(2000, '訊息最多 2000 字'),
})

/** 家長傳訊息給老師或主任 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const c = await context(req, ctx)
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '資料格式錯誤' }, { status: 400 })
    const message = await postGuardianMessage(c.supabase, {
      studentId: c.student.id, guardianId: c.g.id, to: parsed.data.to, body: parsed.data.body,
      senderName: guardianSenderName(c.g, c.student.display_name, c.link.relationship),
    })
    return NextResponse.json({ ok: true, message })
  } catch (e) { return errorResponse(e) }
}
