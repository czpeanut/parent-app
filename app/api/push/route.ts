import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, errorResponse, must } from '@/lib/server/db'
import { ensureGuardian, findGuardian, requireUser } from '@/lib/server/auth'
import { serverEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 前端訂閱推播要用的 VAPID 公鑰（執行期提供，改金鑰不用重新 build） */
export async function GET() {
  const publicKey = serverEnv.vapidPublic()
  return NextResponse.json({ enabled: !!(publicKey && serverEnv.vapidPrivate()), publicKey: publicKey || null })
}

const Sub = z.object({
  endpoint: z.url().max(2000).refine(u => u.startsWith('https://'), 'endpoint 必須是 https'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
})

/** 這台裝置訂閱推播（同一個 endpoint 重複訂閱會改綁到目前的家長） */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const parsed = Sub.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: '訂閱資料格式錯誤' }, { status: 400 })
    const supabase = createServiceClient()
    const g = await ensureGuardian(supabase, user)
    must(await supabase.from('guardian_push_subscriptions').upsert({
      guardian_id: g.id, endpoint: parsed.data.endpoint, keys: parsed.data.keys,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300) || null,
    }, { onConflict: 'endpoint' }))
    return NextResponse.json({ ok: true })
  } catch (e) { return errorResponse(e) }
}

/** 這台裝置取消推播（登出時也會呼叫） */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const parsed = z.object({ endpoint: z.string().min(1).max(2000) }).safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: '資料格式錯誤' }, { status: 400 })
    const supabase = createServiceClient()
    const g = await findGuardian(supabase, user.id)
    if (g) must(await supabase.from('guardian_push_subscriptions').delete().eq('guardian_id', g.id).eq('endpoint', parsed.data.endpoint))
    return NextResponse.json({ ok: true })
  } catch (e) { return errorResponse(e) }
}
