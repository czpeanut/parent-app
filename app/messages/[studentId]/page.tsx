'use client'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { AppShell } from '@/components/AppShell'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/lib/client/api'
import { RECIPIENT_LABEL, messageTime } from '@/lib/display'
import type { ThreadMessage } from '@/lib/types'

type Thread = { student: { id: string; display_name: string }; messages: ThreadMessage[] }

export default function MessagesPage({ params }: { params: Promise<{ studentId: string }> }) {
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
      setBody('')
      setError(null)
    } catch (err) { setError((err as Error).message) } finally { setSending(false) }
  }

  return (
    <AppShell title={data ? `${data.student.display_name}・訊息` : '訊息'} back="/" hideNav>
      {error && <p role="alert" className="card mb-3 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-ink-mute">載入中…</p>}
      {data && (
        <div className="space-y-3 pb-36">
          {data.messages.length === 0 && <p className="py-10 text-center text-sm text-ink-mute">還沒有訊息。老師傳來的通知會顯示在這裡，您也可以在下方留言給老師或主任。</p>}
          {data.messages.map(m => (
            <div key={m.id} className={clsx('flex flex-col', m.mine ? 'items-end' : 'items-start')}>
              <p className="mb-1 px-1 text-xs text-ink-mute">
                {m.mine ? `我 → ${m.recipient === 'director' ? '主任' : '老師'}` : m.sender_name ?? '補習班'}
                <span className="ml-2">{messageTime(m.created_at)}</span>
              </p>
              <div className={clsx('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
                m.mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-paper-line bg-white')}>
                {m.body}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {data && (
        <form onSubmit={send} className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-paper-line bg-paper-card px-4 pt-2">
          <div className="mx-auto max-w-xl">
            <div className="mb-2 flex items-center gap-2 text-sm" role="radiogroup" aria-label="傳給">
              <span className="text-ink-soft">傳給</span>
              {(['teacher', 'director'] as const).map(r => (
                <button type="button" role="radio" aria-checked={to === r} key={r} onClick={() => setTo(r)}
                  className={clsx('rounded-full border px-3 py-1', to === r ? 'border-brand bg-brand-light font-semibold text-brand-dark' : 'border-paper-line bg-white')}>
                  {r === 'teacher' ? '帶班老師' : '主任'}
                </button>
              ))}
              {to === 'director' && <span className="text-xs text-ink-mute">只有主任看得到</span>}
            </div>
            <div className="flex items-end gap-2">
              <textarea className="input max-h-40 min-h-[48px] flex-1 resize-none py-2.5" rows={1} maxLength={2000}
                placeholder={`${RECIPIENT_LABEL[to]}的訊息…`} value={body} onChange={e => setBody(e.target.value)} />
              <button className="btn-primary h-12 shrink-0 px-4" disabled={sending || !body.trim()}>{sending ? '…' : '送出'}</button>
            </div>
          </div>
        </form>
      )}
    </AppShell>
  )
}
