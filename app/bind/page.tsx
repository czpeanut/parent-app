'use client'
import Link from 'next/link'
import { useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { api } from '@/lib/client/api'

const RELATIONSHIPS = ['母親', '父親', '祖父母', '其他家人']

export default function BindPage() {
  const [code, setCode] = useState('')
  const [relationship, setRelationship] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; already: boolean } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const r = await api<{ student: { display_name: string }; already: boolean }>('/api/bind', { method: 'POST', body: { code, relationship: relationship || undefined } })
      setDone({ name: r.student.display_name, already: r.already })
      setCode('')
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <AppShell title="綁定小孩">
      {done ? (
        <div className="card space-y-3 py-8 text-center">
          <p className="text-4xl" aria-hidden>🎉</p>
          <p className="text-lg font-semibold">{done.already ? `已經綁定過 ${done.name}` : `已綁定 ${done.name}`}</p>
          <p className="text-sm text-ink-soft">之後到班、下課與老師訊息都會通知您。</p>
          <div className="flex justify-center gap-2">
            <Link href="/" className="btn-primary">查看小孩</Link>
            <button className="btn-ghost" onClick={() => setDone(null)}>再綁一位</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="card space-y-4">
          <p className="text-sm text-ink-soft">請輸入補習班老師提供的 8 碼綁定碼（7 天內有效，只能用一次）。有多位小孩請分別輸入。</p>
          <div>
            <label className="label" htmlFor="code">綁定碼</label>
            <input id="code" className="input text-center font-mono text-2xl uppercase tracking-[0.3em]" autoComplete="off" autoCapitalize="characters"
              spellCheck={false} maxLength={12} placeholder="ABCD-EFGH" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required />
          </div>
          <div>
            <span className="label">您是小孩的</span>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIPS.map(r => (
                <button type="button" key={r} onClick={() => setRelationship(relationship === r ? '' : r)}
                  className={`rounded-full border px-4 py-2 text-sm ${relationship === r ? 'border-brand bg-brand-light font-semibold text-brand-dark' : 'border-paper-line bg-white'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || code.replace(/[\s-]/g, '').length < 8}>{busy ? '綁定中…' : '綁定'}</button>
        </form>
      )}
    </AppShell>
  )
}
