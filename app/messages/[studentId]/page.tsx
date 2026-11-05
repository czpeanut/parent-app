'use client'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/lib/client/api'
import { messageTime } from '@/lib/display'
import type { ThreadMessage } from '@/lib/types'

type Thread = { student: { id: string; display_name: string }; messages: ThreadMessage[] }

/** 對話（UI kit 畫面 ③）：自己的訊息靠右青綠底；回覆前選「給老師／給主任」 */
export default function Chat({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params)
  const { session } = useAuth()
  const [data, setData] = useState<Thread | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [to, setTo] = useState<'teacher' | 'director'>('teacher')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try { setData(await api<Thread>(`/api/threads/${studentId}`)); setError(null) } catch (e) { setError((e as Error).message) }
  }, [studentId])

  useEffect(() => {
    if (!session) return
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [session, load])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [data?.messages.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setSending(true)
    try {
      const r = await api<{ message: ThreadMessage }>(`/api/threads/${studentId}`, { method: 'POST', body: { to, body: text } })
      setData(d => d ? { ...d, messages: [...d.messages, r.message] } : d)
      setBody(''); setError(null)
    } catch (err) { setError((err as Error).message) } finally { setSending(false) }
  }

  const staffNames = [...new Set((data?.messages ?? []).filter(m => !m.mine && m.sender_name).map(m => m.sender_name as string))].slice(0, 3)

  return (
    <AppShell title={data?.student.display_name ?? '訊息'} sub={staffNames.join('・') || '老師・主任'} back="/messages">
      <div className="cx-page pa-chat-page" style={{ paddingTop: 14 }}>
        {error && <div className="pa-error" role="alert">{error}</div>}
        {!data && !error && <div className="pa-loading">載入中…</div>}
        {data && data.messages.length === 0 && <div className="cx-empty">還沒有訊息。老師傳來的通知會出現在這裡，你也可以在下方留言給老師或主任。</div>}
        {data && data.messages.length > 0 && (
          <div className="cx-chat">
            {data.messages.map(m => (
              <div key={m.id} className={`cx-msg${m.mine ? ' me' : ''}`}>
                <div className="meta">{m.mine ? (m.recipient === 'director' ? '給主任' : '給老師') : m.sender_name ?? '補習班'}・{messageTime(m.created_at)}</div>
                <div className="tx">{m.body}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      {data && (
        <form className="cx-compose pa-compose" onSubmit={send}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="cx-seg" role="radiogroup" aria-label="收件人">
              {(['teacher', 'director'] as const).map(r => (
                <button type="button" role="radio" aria-checked={to === r} key={r} className={to === r ? 'on' : ''} onClick={() => setTo(r)}>{r === 'teacher' ? '給老師' : '給主任'}</button>
              ))}
            </div>
            {to === 'director' && <span className="hint">只有主任看得到</span>}
          </div>
          <div className="row">
            <textarea rows={1} maxLength={2000} placeholder="輸入訊息" aria-label="訊息內容" value={body} onChange={e => setBody(e.target.value)} />
            <button className="cx-btn primary" disabled={sending || !body.trim()}>{sending ? '傳送中' : '傳送'}</button>
          </div>
        </form>
      )}
    </AppShell>
  )
}
