import type { AttendanceStatus } from './types'

/** 段考準備進度的顏色與文字（交接文件第 2 節：80 以上準備好了、50–79 進行中、50 以下要加緊） */
export function readinessLevel(pct: number): { label: string; tone: 'good' | 'mid' | 'low' } {
  if (pct >= 80) return { label: '準備好了', tone: 'good' }
  if (pct >= 50) return { label: '進行中', tone: 'mid' }
  return { label: '要加緊', tone: 'low' }
}

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = { none: '今天還沒到班', in: '在班上課中', out: '已下課' }

export const KIND_LABEL: Record<string, string> = { exam: '段考', quiz: '小考', homework: '作業' }

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', ...opts })

export function hm(iso: string): string {
  return fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** 訊息時間：今天只顯示時間，其他顯示月/日＋時間（台灣時間） */
export function messageTime(iso: string, now = new Date()): string {
  const day = (d: Date) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const d = new Date(iso)
  if (day(d) === day(now)) return hm(iso)
  return `${fmt({ month: 'numeric', day: 'numeric' }).format(d)} ${hm(iso)}`
}

export const RECIPIENT_LABEL = { guardians: '給家長', teacher: '給老師', director: '給主任' } as const
