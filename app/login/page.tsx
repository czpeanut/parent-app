'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { browserSupabase } from '@/lib/supabase-browser'
import { useAuth } from '@/components/AuthProvider'

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/')

function LoginInner() {
  const { session } = useAuth()
  const router = useRouter()
  const sp = useSearchParams()
  const next = safeNext(sp.get('next'))
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (session) router.replace(next) }, [session, router, next])

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const addr = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setError('請輸入正確的 Email')
    if (addr.endsWith('@student.local')) return setError('這是學生帳號，請改用家長自己的 Email')
    setBusy(true)
    const { error } = await browserSupabase().auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true, emailRedirectTo: callback() } })
    setBusy(false)
    if (error) return setError(error.message.includes('rate') ? '寄送太頻繁，請稍等一分鐘再試' : '寄送失敗，請稍後再試')
    setStep('code')
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await browserSupabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('驗證碼錯誤或已過期')
  }

  const google = async () => {
    setError(null)
    const { error } = await browserSupabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback() } })
    if (error) setError('Google 登入失敗，請稍後再試')
  }

  return (
    <div className="pa-solo cx-enter">
      <span className="cx-logo big-logo">C</span>
      <div>
        <span className="cx-label">CODEX STUDY・家長</span>
        <h1 style={{ marginTop: 6 }}>登入</h1>
        <p className="lead-text">看小孩的到班狀態、段考準備進度，和老師聯絡。</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} style={{ display: 'grid', gap: 16 }}>
          <label className="pa-field">Email
            <input className="cx-input" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <button className="cx-btn primary pa-wide" disabled={busy}>{busy ? '寄送中…' : '寄登入碼給我'}</button>
        </form>
      ) : (
        <form onSubmit={verify} style={{ display: 'grid', gap: 16 }}>
          <p className="cx-muted" style={{ fontSize: 14 }}>登入碼已寄到 <b style={{ color: 'var(--color-text)' }}>{email}</b>。輸入信裡的 6 位數登入碼，或直接點信裡的登入連結。</p>
          <label className="pa-field">登入碼
            <input className="cx-input pa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required />
          </label>
          <button className="cx-btn primary pa-wide" disabled={busy || code.length < 6}>{busy ? '登入中…' : '登入'}</button>
          <button type="button" className="pa-link" onClick={() => { setStep('email'); setCode('') }}>換一個 Email</button>
        </form>
      )}

      <div className="pa-or">或</div>
      <button className="cx-btn pa-wide" onClick={google}>用 Google 帳號登入</button>
      {error && <div className="pa-error" role="alert">{error}</div>}
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>
}
