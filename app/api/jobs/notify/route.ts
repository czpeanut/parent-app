import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient, errorResponse } from '@/lib/server/db'
import { processJobs } from '@/lib/server/notify'
import { webPushConfigured, webPushSender } from '@/lib/server/push'
import { serverEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * 推播 worker 入口（交接文件第 7 節）。
 *   POST：Supabase Database Webhook（notification_jobs INSERT）或 pg_cron，header `x-notify-secret: NOTIFY_WEBHOOK_SECRET`
 *   GET ：Vercel Cron，header `Authorization: Bearer CRON_SECRET`
 * 每次最多處理 3 批 × 20 筆；webhook 帶進來的那一筆不直接用，一律用 claim 取件（防重複）。
 */
function authorized(req: NextRequest): boolean {
  const notify = serverEnv.notifySecret()
  const cron = serverEnv.cronSecret()
  const header = req.headers.get('x-notify-secret') ?? ''
  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  return (!!notify && (same(header, notify) || same(auth, notify))) || (!!cron && same(auth, cron))
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!webPushConfigured()) return NextResponse.json({ error: '推播尚未設定（VAPID 金鑰）' }, { status: 503 })
  try {
    const supabase = createServiceClient()
    const counts = { sent: 0, failed: 0, skipped: 0 }
    for (let batch = 0; batch < 3; batch++) {
      const results = await processJobs(supabase, webPushSender, 20)
      for (const r of results) counts[r.status]++
      if (results.length < 20) break
    }
    return NextResponse.json({ ok: true, ...counts })
  } catch (e) { return errorResponse(e) }
}

export const POST = run
export const GET = run
