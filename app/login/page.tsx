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
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-2xl font-black text-white shadow-card">C</div>
        <h1 className="text-2xl font-bold">CODEX STUDY 家長端</h1>
        <p className="mt-2 text-sm text-ink-soft">到班通知、段考準備進度、與老師聯絡</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com"
            value={email} onChange={e => setEmail(e.target.value)} required />
          <button className="btn-primary w-full" disabled={busy}>{busy ? '寄送中…' : '寄送登入碼'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-ink-soft">已寄到 <b>{email}</b>。輸入信中的驗證碼，或直接點信裡的登入連結。</p>
          <label className="label" htmlFor="code">驗證碼</label>
          <input id="code" className="input text-center text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code"
            maxLength={10} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required />
          <button className="btn-primary w-full" disabled={busy || code.length < 6}>{busy ? '驗證中…' : '登入'}</button>
          <button type="button" className="w-full py-2 text-sm text-ink-soft underline" onClick={() => { setStep('email'); setCode('') }}>換一個 Email</button>
        </form>
      )}

      <div className="my-6 flex items-center gap-3 text-xs text-ink-mute"><span className="h-px flex-1 bg-paper-line" />或<span className="h-px flex-1 bg-paper-line" /></div>
      <button className="btn-ghost w-full" onClick={google}>使用 Google 帳號登入</button>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>
}
