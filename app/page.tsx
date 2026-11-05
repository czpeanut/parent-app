'use client'
import Link from 'next/link'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { ChildSwitcher, useSelectedChild } from '@/components/ChildSwitcher'
import { PushBanner } from '@/components/PushBanner'
import { Ring } from '@/components/Ring'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/lib/client/api'
import { KIND_LABEL, attendanceHeadline, greeting, hm, longDate, rateTone, readinessLevel } from '@/lib/display'
import type { ChildData, ChildrenResponse, Me, ThreadsResponse } from '@/lib/types'

function Home() {
  const { session } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<ChildrenResponse | null>(null)
  const [threads, setThreads] = useState<ThreadsResponse | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sel, choose] = useSelectedChild(data?.children.map(c => c.student.id) ?? [])

  const load = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([api<ChildrenResponse>('/api/children'), api<ThreadsResponse>('/api/threads').catch(() => null)])
      setData(c); setThreads(t); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => {
    if (!session) return
    load()
    api<Me>('/api/me').then(setMe).catch(() => {})
    const onVis = () => { if (document.visibilityState === 'visible') load() }   // 回到 App 時更新到班狀態
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [session, load])

  // 還沒綁定小孩：直接到綁定頁（UI kit 畫面 ⑤）
  useEffect(() => { if (data && data.children.length === 0) router.replace('/bind?first=1') }, [data, router])

  const child = data?.children.find(c => c.student.id === sel) ?? data?.children[0]
  const who = me?.guardian.display_name ?? (child ? `${child.student.display_name}${child.relationship ?? '家長'}` : '')

  return (
    <AppShell>
      <div className="cx-page cx-enter">
        <div>
          <span className="cx-date">{longDate()}</span>
          <div className="cx-title"><h1>{greeting()}</h1>{who && <span>{who}</span>}</div>
        </div>
        {error && <div className="pa-error" role="alert">{error} <button className="pa-link" onClick={load}>重試</button></div>}
        {!data && !error && <div className="pa-loading">載入中…</div>}
        {data && child && (<>
          <ChildSwitcher items={data.children.map(c => ({ id: c.student.id, name: c.student.display_name }))} value={child.student.id} onChange={choose} />
          <Hero child={child} lastMessage={threads?.threads.find(t => t.student.id === child.student.id)?.last ?? null} />
          <PushBanner />
          <Readiness child={child} />
          <Recent child={child} />
        </>)}
      </div>
    </AppShell>
  )
}

function Hero({ child, lastMessage }: { child: ChildData; lastMessage: ThreadsResponse['threads'][number]['last'] }) {
  const a = child.attendance_today
  const head = attendanceHeadline(a)
  const sub = a.events.length
    ? a.events.map(e => `${e.event_type === 'check_in' ? '到班' : '下課'} ${hm(e.event_time)}`).join('・')
    : `${child.student.display_name} 今天還沒有到班紀錄`
  const fromStaff = lastMessage && !lastMessage.mine ? lastMessage : null
  return (
    <section className="cx-hero" aria-label="今天到班">
      <span className="k">今天到班・{child.student.display_name}</span>
      <h2 className="pa-hero-time">{head.text}</h2>
      <span className="sub">{sub}</span>
      {fromStaff && <div className="inset">{fromStaff.sender_name ?? '補習班'}：{fromStaff.body.length > 80 ? `${fromStaff.body.slice(0, 80)}…` : fromStaff.body}</div>}
      <div className="cx-btns">
        <Link className="cx-btn on-hero" href={`/messages/${child.student.id}`}>回覆老師{child.unread > 0 && <span className="cx-dot">{child.unread}</span>}</Link>
        <Link className="cx-btn on-hero ghost" href={`/attendance?child=${child.student.id}`}>到班紀錄</Link>
      </div>
    </section>
  )
}

function Readiness({ child }: { child: ChildData }) {
  if (!child.readiness.length) return null
  return (
    <section>
      <div className="cx-sh"><h2>段考準備進度</h2></div>
      <div className="pa-grid two">
        {child.readiness.map((r, i) => {
          const lv = readinessLevel(r.readiness)
          return (
            <div className="cx-card" key={i}>
              <div className="cx-sh" style={{ margin: 0 }}>
                <h3>{r.scope.title}</h3>
                {r.days_left != null && r.days_left >= 0 && <span className="cx-st">{r.days_left === 0 ? '今天考試' : `還有 ${r.days_left} 天`}</span>}
              </div>
              <div className="pa-ready-head">
                <Ring value={r.readiness} />
                <div>
                  <b>準備進度 {r.readiness}%</b>
                  <span className="cx-muted" style={{ fontSize: 13 }}>已掌握 {r.mastered}／{r.total} 個{r.scope.subject === '數學' ? '題型' : '單元'}</span>
                  <span><span className={`cx-st ${lv.st}`}>{lv.label}</span></span>
                </div>
              </div>
              {r.weakest.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {r.weakest.map(w => {
                    const wl = readinessLevel(w.progress)
                    return (
                      <div className="cx-prog" key={w.name}>
                        <span className="nm">{w.name}<small>還要加強</small></span>
                        <span className="cx-bar"><i className={wl.bar} style={{ width: `${Math.max(0, Math.min(100, w.progress))}%` }} /></span>
                        <span className="pc">{w.progress}%</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="pa-note" style={{ marginTop: 8 }}>範圍內每個題型或單元練到熟練就算完成，依段考出題份量加權；還沒練過的算 0%。</p>
    </section>
  )
}

function Recent({ child }: { child: ChildData }) {
  if (!child.recent_assessments.length) return null
  return (
    <section>
      <div className="cx-sh"><h2>最近測驗</h2></div>
      <div className="cx-list">
        {child.recent_assessments.map((a, i) => (
          <div className="cx-item" key={i}>
            <span className="lead" />
            <span className="tx"><b>{a.title}</b><span>{KIND_LABEL[a.kind] ?? '測驗'}{a.exam_date ? `・${Number(a.exam_date.slice(5, 7))}/${Number(a.exam_date.slice(8, 10))}` : ''}</span></span>
            <span className={`cx-st ${rateTone(a.rate)}`}>{Math.round(a.rate)}%</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Page() {
  return <Suspense><Home /></Suspense>
}
