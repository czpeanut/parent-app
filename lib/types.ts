/** student-app GET /api/guardian/children 的回應（家長端 /api/children 另外加上 unread） */
export type AttendanceStatus = 'none' | 'in' | 'out'
export type Readiness = {
  scope: { title: string; subject: string; exam_date: string | null }
  days_left: number | null; readiness: number; mastered: number; total: number
  weakest: { name: string; progress: number }[]
}
export type ChildData = {
  student: { id: string; display_name: string }
  relationship: string | null
  attendance_today: { status: AttendanceStatus; events: { event_type: 'check_in' | 'check_out'; event_time: string }[] }
  readiness: Readiness[]
  recent_assessments: { title: string; kind: 'exam' | 'quiz' | 'homework'; exam_date: string | null; rate: number }[]
  unread: number
}
export type ChildrenResponse = { date: string | null; children: ChildData[] }

export type ThreadMessage = {
  id: string; sender_type: 'staff' | 'guardian' | 'system'; sender_name: string | null
  recipient: 'guardians' | 'teacher' | 'director'; body: string; created_at: string; mine: boolean
}
