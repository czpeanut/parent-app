import type { AttendanceStatus } from './types'

/** 段考準備進度分級（交接文件：80 以上準備好了、50–79 進行中、50 以下要加緊）→ v2 UI kit 的膠囊與進度條 */
export function readinessLevel(pct: number): { label: string; st: '' | 'good' | 'warn'; bar: '' | 'done' | 'low' } {
  if (pct >= 80) return { label: '準備好了', st: 'good', bar: 'done' }
  if (pct >= 50) return { label: '進行中', st: '', bar: '' }
  return { label: '要加緊', st: 'warn', bar: 'low' }
}

/** 測驗得分率膠囊顏色（同準備進度的門檻） */
export const rateTone = (rate: number) => (rate >= 80 ? 'good' : rate >= 50 ? '' : 'warn')

export const KIND_LABEL: Record<string, string> = { exam: '段考', quiz: '小考', homework: '作業' }

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', ...opts })
const tpDay = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10)

export function hm(iso: string): string {
  return fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** 11/3（二） */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEK[d.getUTCDay()]}）`
}

/** 相對日期：今天／昨天／11/3（二） */
export function relDay(day: string, now = new Date()): string {
  const today = tpDay(now)
  const yesterday = tpDay(new Date(now.getTime() - 86400_000))
  if (day === today) return `今天 ${dayLabel(day).replace(/（.）/, '')}`
  if (day === yesterday) return '昨天'
  return dayLabel(day)
}

/** 訊息時間：今天「18:02」、昨天「昨天 18:02」、其他「11/3（二） 18:02」 */
export function messageTime(iso: string, now = new Date()): string {
  const day = tpDay(new Date(iso))
  if (day === tpDay(now)) return hm(iso)
  if (day === tpDay(new Date(now.getTime() - 86400_000))) return `昨天 ${hm(iso)}`
  return `${dayLabel(day)} ${hm(iso)}`
}

/** 列表右側的短時間：今天「18:20」、昨天「昨天」、其他「11/3」 */
export function shortTime(iso: string, now = new Date()): string {
  const day = tpDay(new Date(iso))
  if (day === tpDay(now)) return hm(iso)
  if (day === tpDay(new Date(now.getTime() - 86400_000))) return '昨天'
  const d = new Date(`${day}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

/** 首頁問候（台灣時間）與日期「11 月 5 日 星期四」 */
export function greeting(now = new Date()): string {
  const h = new Date(now.getTime() + 8 * 3600_000).getUTCHours()   // zh-TW 的單獨小時格式會帶「時」，直接算
  return h < 11 ? '早安' : h < 18 ? '午安' : '晚安'
}
export function longDate(now = new Date()): string {
  const d = new Date(now.getTime() + 8 * 3600_000)
  return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日 星期${WEEK[d.getUTCDay()]}`
}

/** 今天到班主卡的大字 */
export function attendanceHeadline(a: { status: AttendanceStatus; events: { event_type: string; event_time: string }[] }): { text: string; st: 'mute' | 'good' | 'info'; label: string } {
  const last = a.events.at(-1)
  if (a.status === 'in' && last) return { text: `${hm(last.event_time)} 已到班`, st: 'good', label: '在班' }
  if (a.status === 'out' && last) return { text: `${hm(last.event_time)} 已下課`, st: 'info', label: '已下課' }
  return { text: '今天還沒到班', st: 'mute', label: '未到' }
}

export const RECIPIENT_LABEL = { guardians: '給家長', teacher: '給老師', director: '給主任' } as const
