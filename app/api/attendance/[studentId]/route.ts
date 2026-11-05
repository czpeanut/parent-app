import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, errorResponse, HttpError, must } from '@/lib/server/db'
import { findGuardian, requireLink, requireUser } from '@/lib/server/auth'
import { attendanceStats, type AttendanceEvent } from '@/lib/attendance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 到班紀錄：最近 60 天（台灣時間）的上課／下課，附班級名稱與本月統計 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ studentId: string }> }) {
  try {
    const user = await requireUser(req)
    const { studentId } = await ctx.params
    const supabase = createServiceClient()
    const g = z.guid().safeParse(studentId).success ? await findGuardian(supabase, user.id) : null
    if (!g) throw new HttpError(403, '沒有綁定這位學生')
    await requireLink(supabase, g.id, studentId)
    const student = must(await supabase.from('students').select('id, display_name').eq('id', studentId).single()) as { id: string; display_name: string }
    const since = new Date(Date.now() - 60 * 86400_000).toISOString()
    const rows = must(await supabase.from('attendance_events').select('event_type, event_time, class_id')
      .eq('student_id', studentId).gte('event_time', since).order('event_time', { ascending: false }).limit(500)) as { event_type: 'check_in' | 'check_out'; event_time: string; class_id: string | null }[]
    const classIds = [...new Set(rows.map(r => r.class_id).filter((x): x is string => !!x))]
    const classes = classIds.length ? must(await supabase.from('classes').select('id, name').in('id', classIds)) as { id: string; name: string }[] : []
    const cname = new Map(classes.map(c => [c.id, c.name]))
    const events: AttendanceEvent[] = rows.map(r => ({ event_type: r.event_type, event_time: r.event_time, class_name: r.class_id ? cname.get(r.class_id) ?? null : null }))
    return NextResponse.json({ student, events, stats: attendanceStats(events) })
  } catch (e) { return errorResponse(e) }
}
