import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, errorResponse, must } from '@/lib/server/db'
import { ensureGuardian, requireUser } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Prefs = { attendance: boolean; messages: boolean }

async function loadPrefs(supabase: ReturnType<typeof createServiceClient>, guardianId: string): Promise<Prefs> {
  const row = must(await supabase.from('guardian_notification_prefs').select('attendance, messages').eq('guardian_id', guardianId).maybeSingle()) as Prefs | null
  return { attendance: row?.attendance ?? true, messages: row?.messages ?? true }
}

/** 目前登入的家長（第一次呼叫會建立 guardians 列）＋通知偏好 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const supabase = createServiceClient()
    const g = await ensureGuardian(supabase, user)
    return NextResponse.json({
      guardian: { id: g.id, display_name: g.display_name, phone: g.phone, email: g.email ?? user.email },
      prefs: await loadPrefs(supabase, g.id),
    })
  } catch (e) { return errorResponse(e) }
}

const Patch = z.object({
  display_name: z.string().trim().min(1).max(40).optional(),
  phone: z.string().trim().max(30).regex(/^[0-9+\-\s()]*$/).optional(),
  prefs: z.object({ attendance: z.boolean(), messages: z.boolean() }).partial().optional(),
})

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const parsed = Patch.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: '資料格式錯誤', issues: parsed.error.issues }, { status: 400 })
    const supabase = createServiceClient()
    const g = await ensureGuardian(supabase, user)
    const b = parsed.data
    const profile: Record<string, string | null> = {}
    if (b.display_name !== undefined) profile.display_name = b.display_name
    if (b.phone !== undefined) profile.phone = b.phone || null
    if (Object.keys(profile).length) must(await supabase.from('guardians').update(profile).eq('id', g.id))
    if (b.prefs && Object.keys(b.prefs).length) {
      const cur = await loadPrefs(supabase, g.id)
      must(await supabase.from('guardian_notification_prefs').upsert(
        { guardian_id: g.id, ...cur, ...b.prefs, updated_at: new Date().toISOString() }, { onConflict: 'guardian_id' }))
    }
    return NextResponse.json({ ok: true })
  } catch (e) { return errorResponse(e) }
}
