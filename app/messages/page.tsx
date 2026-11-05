'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/lib/client/api'
import { shortTime } from '@/lib/display'
import type { ThreadsResponse } from '@/lib/types'

/** 訊息列表：一位小孩一條對話串（UI kit 畫面 ②） */
export default function MessagesList() {
  const { session } = useAuth()
  const [data, setData] = useState<ThreadsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (session) api<ThreadsResponse>('/api/threads').then(setData).catch(e => setError((e as Error).message)) }, [session])

  return (
    <AppShell title="訊息" sub={data ? (data.unread_total ? `${data.unread_total} 則未讀` : '沒有未讀') : undefined}>
      <div className="cx-page cx-enter" style={{ paddingTop: 12 }}>
        {error && <div className="pa-error" role="alert">{error}</div>}
        {!data && !error && <div className="pa-loading">載入中…</div>}
        {data && data.threads.length > 0 && (
          <div className="cx-list">
            {data.threads.map(t => {
              const last = t.last
              const preview = last ? `${last.mine ? `我（${last.recipient === 'director' ? '給主任' : '給老師'}）` : last.sender_name ?? '補習班'}：${last.body}` : '還沒有訊息，點進來可以留言給老師'
              return (
                <Link className="cx-item" href={`/messages/${t.student.id}`} key={t.student.id}>
                  <span className="cx-avatar" aria-hidden>{t.student.display_name.slice(-1)}</span>
                  <span className="tx"><b>{t.student.display_name}</b><span>{preview}</span></span>
                  <span className="pa-item-side">
                    {last && <span className="d">{shortTime(last.created_at)}</span>}
                    {t.unread > 0 && <span className="cx-dot" aria-label={`${t.unread} 則未讀`}>{t.unread}</span>}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
        {data && <div className="cx-empty">{data.threads.length ? '老師或主任傳來的訊息會出現在這裡；你也可以回覆給老師或主任。' : '綁定小孩之後，就能在這裡收到老師的訊息。'}</div>}
      </div>
    </AppShell>
  )
}
