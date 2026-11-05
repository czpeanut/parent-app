import { categoryOf, formatJob, isStale, type Job } from '@/lib/notify-text'
import { must, type Supa } from './db'
import type { PushSender, PushSub } from './push'

export type JobOutcome = { id: string; status: 'sent' | 'failed' | 'skipped'; detail?: string }

type Prefs = { guardian_id: string; attendance: boolean; messages: boolean }

/**
 * 推播 worker（交接文件第 7 節）：
 *   1. claim_notification_jobs 取件（pending／failed、卡住的 processing），防止兩個 worker 重複送
 *   2. 每筆 job＝一位學生：找出所有 active 家長 → 依偏好過濾 → 送到每台訂閱裝置
 *   3. 已送過的裝置記在 notification_deliveries，重試時不重送
 * 狀態：全部送出 sent；有裝置暫時失敗 failed（下次重試，attempts 到 5 停）；
 *       沒有 active 家長／家長關閉通知／沒有裝置／不認得的 kind／太舊 → skipped
 */
export async function processJobs(supabase: Supa, send: PushSender, limit = 20): Promise<JobOutcome[]> {
  const jobs = (must(await supabase.rpc('claim_notification_jobs', { n: limit })) ?? []) as Job[]
  const out: JobOutcome[] = []
  for (const job of jobs) {
    let r: JobOutcome
    try { r = await processOne(supabase, send, job) } catch (e) {
      r = { id: job.id, status: 'failed', detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }
    }
    const now = new Date().toISOString()
    must(await supabase.from('notification_jobs').update(
      r.status === 'failed' ? { status: 'failed', last_error: r.detail ?? 'unknown' } : { status: r.status, processed_at: now, last_error: r.status === 'skipped' ? r.detail ?? null : null },
    ).eq('id', job.id))
    out.push(r)
  }
  return out
}

async function processOne(supabase: Supa, send: PushSender, job: Job): Promise<JobOutcome> {
  const skip = (detail: string): JobOutcome => ({ id: job.id, status: 'skipped', detail })
  const category = categoryOf(job.kind)
  const content = formatJob(job)
  if (!category || !content) return skip(`unknown kind ${job.kind}`)
  if (isStale(job)) return skip('stale')

  const links = must(await supabase.from('student_guardians').select('guardian_id').eq('student_id', job.student_id).eq('status', 'active')) as { guardian_id: string }[]
  const guardianIds = [...new Set(links.map(l => l.guardian_id))]
  if (!guardianIds.length) return skip('no active guardians')

  const prefs = must(await supabase.from('guardian_notification_prefs').select('guardian_id, attendance, messages').in('guardian_id', guardianIds)) as Prefs[]
  const off = new Set(prefs.filter(p => p[category] === false).map(p => p.guardian_id))
  const wanted = guardianIds.filter(id => !off.has(id))
  if (!wanted.length) return skip('guardians opted out')

  const subs = must(await supabase.from('guardian_push_subscriptions').select('id, guardian_id, endpoint, keys').in('guardian_id', wanted)) as PushSub[]
  if (!subs.length) return skip('no push subscriptions')

  const done = new Set((must(await supabase.from('notification_deliveries').select('subscription_id').eq('job_id', job.id)) as { subscription_id: string }[]).map(d => d.subscription_id))
  const errors: string[] = []
  let delivered = done.size
  for (const sub of subs) {
    if (done.has(sub.id)) continue
    const res = await send(sub, content)
    if (res.ok) {
      delivered++
      must(await supabase.from('notification_deliveries').upsert({ job_id: job.id, subscription_id: sub.id }, { onConflict: 'job_id,subscription_id', ignoreDuplicates: true }))
      must(await supabase.from('guardian_push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id))
    } else if (res.gone) {
      must(await supabase.from('guardian_push_subscriptions').delete().eq('id', sub.id))
    } else {
      errors.push(res.error)
    }
  }
  if (errors.length) return { id: job.id, status: 'failed', detail: errors.join(' | ').slice(0, 500) }
  if (!delivered) return skip('all subscriptions expired')
  return { id: job.id, status: 'sent' }
}
