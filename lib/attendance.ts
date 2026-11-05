/** 到班紀錄的純函式（伺服器統計、前端分組共用）。日期一律以台灣時間為界。 */
export type AttendanceEvent = { event_type: 'check_in' | 'check_out'; event_time: string; class_name: string | null }

export const taipeiDate = (iso: string | Date) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10)

/** 依台灣日期分組（新的日期在前，每天裡面新的在前） */
export function groupByDay(events: AttendanceEvent[]): { day: string; events: AttendanceEvent[] }[] {
  const map = new Map<string, AttendanceEvent[]>()
  for (const e of [...events].sort((a, b) => b.event_time.localeCompare(a.event_time))) {
    const d = taipeiDate(e.event_time)
    map.set(d, [...(map.get(d) ?? []), e])
  }
  return [...map.entries()].map(([day, events]) => ({ day, events }))
}

/**
 * 本月統計：到班天數（有 check_in 的日子）、本週到班天數（週一起算）、平均時數（同一天第一次到班到最後一次下課，有成對的日子才算）。
 * 沒有課表資料，所以不算「缺席」。
 */
export function attendanceStats(events: AttendanceEvent[], now = new Date()): { month_days: number; week_days: number; avg_hours: number | null } {
  const today = taipeiDate(now)
  const month = today.slice(0, 7)
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7   // 週一＝0
  const weekStart = new Date(Date.parse(`${today}T00:00:00Z`) - dow * 86400_000).toISOString().slice(0, 10)
  const days = new Map<string, { inT?: number; outT?: number }>()
  for (const e of events) {
    const d = taipeiDate(e.event_time), t = Date.parse(e.event_time)
    const cur = days.get(d) ?? {}
    if (e.event_type === 'check_in') cur.inT = Math.min(cur.inT ?? Infinity, t)
    else cur.outT = Math.max(cur.outT ?? -Infinity, t)
    days.set(d, cur)
  }
  const attended = [...days.entries()].filter(([, v]) => v.inT !== undefined)
  const monthDays = attended.filter(([d]) => d.startsWith(month))
  const spans = monthDays.map(([, v]) => v.outT !== undefined && v.outT > v.inT! ? (v.outT - v.inT!) / 3600_000 : null).filter((x): x is number => x !== null)
  return {
    month_days: monthDays.length,
    week_days: attended.filter(([d]) => d >= weekStart && d <= today).length,
    avg_hours: spans.length ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10 : null,
  }
}
