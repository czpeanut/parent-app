'use client'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/lib/client/api'

const RELATIONSHIPS = ['母親', '父親', '祖父母', '其他']

/** 綁定小孩（UI kit 畫面 ⑤）：第一次登入沒有綁定時直接顯示 */
function Bind() {
  const { session, loading } = useAuth()
  const router = useRouter()
  const first = useSearchParams().get('first') === '1'
  const [code, setCode] = useState('')
  const [rel, setRel] = useState('母親')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; already: boolean } | null>(null)

  useEffect(() => { if (!loading && !session) router.replace('/login?next=/bind') }, [loading, session, router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      const r = await api<{ student: { display_name: string }; already: boolean }>('/api/bind', { method: 'POST', body: { code, relationship: rel } })
      setDone({ name: r.student.display_name, already: r.already }); setCode('')
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  if (loading || !session) return <div className="pa-loading">載入中…</div>
  return (
    <div className="pa-solo cx-enter">
      <span className="cx-logo big-logo">C</span>
      {done ? (<>
        <div><h1>{done.already ? `${done.name} 已經綁定過了` : `已綁定 ${done.name}`}</h1>
          <p className="lead-text">之後 {done.name} 到班、下課，以及老師的訊息都會通知你。</p></div>
        <Link className="cx-btn primary pa-wide" href="/">查看 {done.name}</Link>
        <button className="pa-link" onClick={() => setDone(null)}>再綁定一位小孩</button>
      </>) : (<>
        <div><h1>綁定小孩</h1>
          <p className="lead-text">輸入老師給你的 8 碼綁定碼，就能看到小孩的到班狀態、學習進度，並收到老師訊息。</p></div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
          <label className="pa-field">綁定碼
            <input className="cx-input pa-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12}
              placeholder="ABCD EFGH" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required />
          </label>
          <div className="pa-field">你是小孩的
            <div className="pa-seg-scroll"><div className="cx-seg" role="radiogroup" aria-label="關係">
              {RELATIONSHIPS.map(r => <button type="button" role="radio" aria-checked={rel === r} key={r} className={rel === r ? 'on' : ''} onClick={() => setRel(r)}>{r}</button>)}
            </div></div>
          </div>
          {error && <div className="pa-error" role="alert">{error}</div>}
          <button className="cx-btn primary pa-wide" disabled={busy || code.replace(/[\s-]/g, '').length < 8}>{busy ? '綁定中…' : '綁定'}</button>
        </form>
        <div className="cx-empty">綁定碼 7 天內有效、只能用一次，請向補習班老師索取。一位家長可以綁定多個小孩，之後在「我的 → 綁定小孩」新增。</div>
        {!first && <Link className="pa-link" href="/">回首頁</Link>}
        {first && <Link className="pa-link" href="/me">帳號設定・登出</Link>}
      </>)}
    </div>
  )
}

export default function Page() {
  return <Suspense><Bind /></Suspense>
}
