import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, errorResponse } from '@/lib/server/db'
import { clientIp, ensureGuardian, requireUser } from '@/lib/server/auth'
import { bindWithCode } from '@/lib/server/bind'
import { serverEnv } from '@/lib/env'

export const runtime = 'nodejs'

const Body = z.object({
  code: z.string().min(1).max(40),
  relationship: z.string().trim().max(20).optional(),
})

/** 家長輸入綁定碼綁定小孩（交接文件 6.2） */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: '請輸入綁定碼' }, { status: 400 })
    const pepper = serverEnv.codePepper()
    if (!pepper) return NextResponse.json({ error: '綁定功能尚未設定（GUARDIAN_CODE_PEPPER）' }, { status: 503 })
    const supabase = createServiceClient()
    const g = await ensureGuardian(supabase, user)
    const r = await bindWithCode(supabase, {
      userId: user.id, guardianId: g.id, ip: clientIp(req), rawCode: parsed.data.code,
      relationship: parsed.data.relationship || null, pepper,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, student: r.student, already: r.already })
  } catch (e) { return errorResponse(e) }
}
