'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { ChildCard } from '@/components/ChildCard'
import { PushBanner } from '@/components/PushBanner'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/lib/client/api'
import type { ChildrenResponse } from '@/lib/types'

export default function Home() {
  const { session } = useAuth()
  const [data, setData] = useState<ChildrenResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setData(await api<ChildrenResponse>('/api/children')); setError(null) } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => {
    if (!session) return
    load()
    // 回到 App 時重新整理（到班狀態會變）
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [session, load])

  return (
    <AppShell title="我的小孩">
      <PushBanner />
      {error && <div className="card mb-4 text-sm text-red-700">{error} <button className="ml-2 underline" onClick={load}>重試</button></div>}
      {!data && !error && <p className="py-10 text-center text-ink-mute">載入中…</p>}
      {data && data.children.length === 0 && (
        <div className="card space-y-3 py-8 text-center">
          <p className="text-lg font-semibold">還沒有綁定小孩</p>
          <p className="text-sm text-ink-soft">請向補習班老師索取「家長綁定碼」，輸入後就能看到小孩的到班狀態與學習進度。</p>
          <Link href="/bind" className="btn-primary mx-auto">輸入綁定碼</Link>
        </div>
      )}
      <div className="space-y-4">
        {data?.children.map(c => <ChildCard key={c.student.id} child={c} />)}
      </div>
    </AppShell>
  )
}
