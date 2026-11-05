import webpush from 'web-push'
import { serverEnv } from '@/lib/env'
import type { PushContent } from '@/lib/notify-text'

export type PushSub = { id: string; guardian_id: string; endpoint: string; keys: { p256dh: string; auth: string } }
/** ok：送出；gone：裝置已取消訂閱（404/410，要刪掉）；error：暫時失敗（要重試） */
export type SendResult = { ok: true } | { ok: false; gone: boolean; error: string }
export type PushSender = (sub: PushSub, content: PushContent) => Promise<SendResult>

export function webPushConfigured() {
  return !!(serverEnv.vapidPublic() && serverEnv.vapidPrivate())
}

export const webPushSender: PushSender = async (sub, content) => {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(content),
      {
        TTL: 12 * 3600,
        urgency: 'high',
        vapidDetails: { subject: serverEnv.vapidSubject(), publicKey: serverEnv.vapidPublic(), privateKey: serverEnv.vapidPrivate() },
      },
    )
    return { ok: true }
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, gone: status === 404 || status === 410, error: `push ${status ?? ''} ${msg}`.trim().slice(0, 300) }
  }
}
