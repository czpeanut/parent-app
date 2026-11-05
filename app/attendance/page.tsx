'use client'
import { Suspense, useEffect, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { ChildSwitcher, useSelectedChild } from '@/components/ChildSwitcher'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/lib/client/api'
import { groupByDay, type AttendanceEvent } from '@/lib/attendance'
import { hm, relDay } from '@/lib/display'
import type { ThreadsResponse } from '@/lib/types'

type Resp = { student: { id: string; display_name: string }; events: AttendanceEvent[]; stats: { month_days: number; week_days: number; avg_hours: number | null } }

/** 到班紀錄（UI kit 畫面 ④）：本月統計＋每天一段；到班推播點進來就是這頁 */
function Attendance() {
  const { session } = useAuth()
  const [kids, setKids] = useState<{ id: string; name: string }[] | null>(null)
  const [sel, choose] = useSelectedChild(kids?.map(k => k.id) ?? [])
  const [data, setData] = useState<Resp | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 小孩清單用訊息列表那支（不用等 student-app），只要 id 與名字
  useEffect(() => {
    if (session) api<ThreadsResponse>('/api/threads').then(r => setKids(r.threads.map(t => ({ id: t.student.id, name: t.student.display_name })))).catch(e => setError((e as Error).message))
  }, [session])
  useEffect(() => {
    if (!sel) return
    setData(null)
    api<Resp>(`/api/attendance/${sel}`).then(r => { setData(r); setError(null) }).catch(e => setError((e as Error).message))
  }, [sel])

  const days = data ? groupByDay(data.events) : []
  return (
    <AppShell title="到班紀錄" sub={data?.student.display_name}>
      <div className="cx-page cx-enter" style={{ paddingTop: 12 }}>
        {kids && <ChildSwitcher items={kids} value={sel} onChange={choose} />}
        {error && <div className="pa-error" role="alert">{error}</div>}
        {kids && kids.length === 0 && <div className="cx-empty">還沒有綁定小孩。</div>}
        {sel && !data && !error && <div className="pa-loading">載入中…</div>}
        {data && (<>
          <section className="cx-card">
            <div className="cx-nums">
              <div><b>{data.stats.month_days}</b><span>本月到班（天）</span></div>
              <div><b>{data.stats.week_days}</b><span>本週到班（天）</span></div>
              <div><b>{data.stats.avg_hours ?? '—'}{data.stats.avg_hours != null && <small style={{ fontSize: 14 }}>h</small>}</b><span>平均時數</span></div>
            </div>
          </section>
          {days.length === 0 && <div className="cx-empty">最近 60 天沒有到班紀錄。老師按「上課」「下課」後會出現在這裡，並通知你。</div>}
          {days.map(d => (
            <section key={d.day}>
              <div className="cx-sh"><h3>{relDay(d.day)}</h3></div>
              <div className="cx-list">
                {d.events.map((e, i) => (
                  <div className="cx-item" key={i}>
                    <span className="tx"><b>{e.event_type === 'check_in' ? '到班' : '離班'}</b><span>{e.class_name ?? '　'}</span></span>
                    <span className="d">{hm(e.event_time)}</span>
                    <span className={`cx-st ${e.event_type === 'check_in' ? 'good' : 'info'}`}>{e.event_type === 'check_in' ? '上課' : '下課'}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>)}
      </div>
    </AppShell>
  )
}

export default function Page() {
  return <Suspense><Attendance /></Suspense>
}
