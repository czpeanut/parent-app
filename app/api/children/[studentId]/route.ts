import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, errorResponse, must } from '@/lib/server/db'
import { findGuardian, requireLink, requireUser } from '@/lib/server/auth'

export const runtime = 'nodejs'

/** 解除綁定：status 改成 revoked（不刪資料） */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ studentId: string }> }) {
  try {
    const user = await requireUser(req)
    const { studentId } = await ctx.params
    if (!z.guid().safeParse(studentId).success) return NextResponse.json({ error: '學生不存在' }, { status: 404 })
    const supabase = createServiceClient()
    const g = await findGuardian(supabase, user.id)
    if (!g) return NextResponse.json({ error: '沒有綁定這位學生' }, { status: 403 })
    await requireLink(supabase, g.id, studentId)
    must(await supabase.from('student_guardians').update({ status: 'revoked' }).eq('guardian_id', g.id).eq('student_id', studentId))
    return NextResponse.json({ ok: true })
  } catch (e) { return errorResponse(e) }
}
