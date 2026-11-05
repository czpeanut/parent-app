'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { browserSupabase } from '@/lib/supabase-browser'

/** Google 登入／Email 登入連結的回呼頁：supabase-js 會自動用網址上的 code 換 session */
function CallbackInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const [error, setError] = useState<string | null>(sp.get('error_description'))

  useEffect(() => {
    if (error) return
    let n: string | null = null
    try { n = localStorage.getItem('pa:next'); localStorage.removeItem('pa:next') } catch { /* 忽略 */ }
    const next = n && n.startsWith('/') && !n.startsWith('//') ? n : '/'
    const sb = browserSupabase()
    let done = false
    const go = () => { if (!done) { done = true; router.replace(next) } }
    sb.auth.getSession().then(({ data }) => { if (data.session) go() })
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { if (s) go() })
    const t = setTimeout(() => { if (!done) setError('登入連結已失效，或需要在同一個瀏覽器開啟，請回登入頁再試一次') }, 10000)
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [error, router, sp])

  return (
    <div className="pa-solo">
      {error ? (<>
        <div className="pa-error" role="alert">{error}</div>
        <a className="cx-btn pa-wide" href="/login">回登入頁</a>
      </>) : <div className="pa-loading">登入中…</div>}
    </div>
  )
}

export default function CallbackPage() {
  return <Suspense><CallbackInner /></Suspense>
}
