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
    const n = sp.get('next')
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (<>
        <p className="text-red-700">{error}</p>
        <a className="btn-ghost" href="/login">回登入頁</a>
      </>) : <p className="text-ink-mute">登入中…</p>}
    </div>
  )
}

export default function CallbackPage() {
  return <Suspense><CallbackInner /></Suspense>
}
