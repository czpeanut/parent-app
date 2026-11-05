'use client'
import { useEffect, useState } from 'react'
import { enablePush, pushState, type PushState } from '@/lib/client/push'

/** 首頁上方提示：還沒開推播的裝置 */
export function PushBanner() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')) }, [])

  if (!state || state === 'on' || state === 'unsupported') return null
  if (state === 'needs-install') return (
    <div className="card mb-4 border-brand-ring bg-brand-light text-sm">
      <b>想收到到班通知？</b> iPhone 請先按 Safari 下方的「分享」→「加入主畫面」，再從主畫面打開本 App 開啟通知。
    </div>
  )
  if (state === 'denied') return (
    <div className="card mb-4 text-sm text-ink-soft">通知已被封鎖。要收到到班與老師訊息通知，請到瀏覽器或手機設定允許本網站的通知。</div>
  )
  if (state === 'server-off') return null
  return (
    <div className="card mb-4 flex items-center gap-3 border-brand-ring bg-brand-light">
      <p className="flex-1 text-sm"><b>開啟通知</b>：小孩到班、下課與老師訊息會即時通知您。</p>
      <button className="btn-primary px-3 py-2 text-sm" disabled={busy}
        onClick={async () => { setBusy(true); try { setState(await enablePush()) } catch { setState('off') } finally { setBusy(false) } }}>
        {busy ? '…' : '開啟'}
      </button>
    </div>
  )
}
