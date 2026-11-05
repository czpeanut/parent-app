/** 推播文字（交接文件 3.4 的建議格式） */
export type Job = {
  id: string; kind: string; student_id: string; payload: Record<string, unknown> | null
  status?: string; attempts?: number; created_at: string
}
export type PushContent = { title: string; body: string; url: string; tag: string }
export type Category = 'attendance' | 'messages'

const BRAND = '【CODEX STUDY】'

export function taipeiTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function categoryOf(kind: string): Category | null {
  if (kind === 'attendance.check_in' || kind === 'attendance.check_out') return 'attendance'
  if (kind === 'message.new') return 'messages'
  return null
}

/** 把 notification_jobs 一筆轉成推播內容；不認得的 kind 回 null（→ skipped） */
export function formatJob(job: Job): PushContent | null {
  const p = job.payload ?? {}
  const student = str(p.student_name) ?? '您的小孩'
  if (job.kind === 'attendance.check_in' || job.kind === 'attendance.check_out') {
    const time = taipeiTime(str(p.event_time) ?? job.created_at)
    const branch = str(p.branch_name)
    const cls = str(p.class_name)
    const where = [branch, cls ? `（${cls}）` : null].filter(Boolean).join('')
    const body = job.kind === 'attendance.check_in'
      ? `${BRAND}${student} 已於 ${time} 到達${where ? ` ${where}` : ''}`
      : `${BRAND}${student} 已於 ${time} 下課離開${where ? ` ${where}` : ''}`
    return { title: job.kind === 'attendance.check_in' ? `${student} 已到班` : `${student} 已下課`, body, url: `/attendance?child=${job.student_id}`, tag: `att-${job.student_id}` }
  }
  if (job.kind === 'message.new') {
    const sender = str(p.sender_name) ?? '老師'
    const preview = str(p.preview) ?? '傳來一則新訊息'
    return { title: `${student}・${sender}`, body: `${sender}：${preview}`, url: `/messages/${job.student_id}`, tag: `msg-${job.student_id}` }
  }
  return null
}

/** 太舊的到班通知不送（例如補送排程停了好幾小時）：12 小時 */
export const STALE_MS: Record<Category, number> = { attendance: 12 * 3600_000, messages: 7 * 24 * 3600_000 }

export function isStale(job: Job, now = Date.now()): boolean {
  const c = categoryOf(job.kind)
  if (!c) return false
  const t = new Date(job.created_at).getTime()
  return Number.isFinite(t) && now - t > STALE_MS[c]
}
