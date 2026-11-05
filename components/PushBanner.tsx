'use client'
import { useEffect, useState } from 'react'
import { enablePush, pushState, type PushState } from '@/lib/client/push'

/** 還沒開推播的裝置：首頁顯示一張淺青綠提示卡 */
export function PushBanner() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')) }, [])

  if (state === 'needs-install') return (
    <section className="cx-card soft">
      <h3>想收到到班通知？</h3>
      <p style={{ fontSize: 13.5 }}>iPhone 請按 Safari 下方的「分享」→「加入主畫面」，再從主畫面打開，就能開啟通知。</p>
    </section>
  )
  if (state === 'denied') return (
    <section className="cx-card soft">
      <h3>通知已關閉</h3>
      <p style={{ fontSize: 13.5 }}>到手機或瀏覽器的設定允許本網站通知，才收得到到班與老師訊息。</p>
    </section>
  )
  if (state !== 'off') return null
  return (
    <section className="cx-card soft">
      <h3>開啟通知</h3>
      <p style={{ fontSize: 13.5 }}>小孩到班、下課，和老師傳來的訊息，都會馬上通知你。</p>
      <button className="cx-btn sm" style={{ justifySelf: 'start' }} disabled={busy}
        onClick={async () => { setBusy(true); try { setState(await enablePush()) } catch { setState('off') } finally { setBusy(false) } }}>
        {busy ? '設定中…' : '開啟通知'}
      </button>
    </section>
  )
}
