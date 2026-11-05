'use client'
import { useEffect, useState } from 'react'
import { enablePush, pushState, type PushState } from '@/lib/client/push'

/** 還沒開推播的裝置：首頁顯示一張淺青綠提示卡；開啟失敗要說原因，不可以默默消失 */
export function PushBanner() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')) }, [])

  const enable = async () => {
    setBusy(true); setError(null)
    try { setState(await enablePush()) } catch (e) {
      setError(`開啟失敗：${(e as Error).message || '請稍後再試'}`)
    } finally { setBusy(false) }
  }

  if (state === 'needs-install') return (
    <section className="cx-card soft">
      <h3>想收到到班通知？</h3>
      <p style={{ fontSize: 13.5 }}>iPhone 請按 Safari 下方的「分享」→「加入主畫面」，再從<b>主畫面的圖示</b>打開，就能開啟通知。</p>
    </section>
  )
  if (state === 'denied') return (
    <section className="cx-card soft">
      <h3>通知已關閉</h3>
      <p style={{ fontSize: 13.5 }}>到手機或瀏覽器的設定允許本網站通知，才收得到到班與老師訊息。</p>
    </section>
  )
  if (state === 'server-off') return (
    <section className="cx-card soft">
      <h3>通知服務尚未設定</h3>
      <p style={{ fontSize: 13.5 }}>補習班還沒開好推播功能（管理者：Vercel 要設 VAPID 金鑰並重新部署）。</p>
    </section>
  )
  if (state === 'unsupported') return (
    <section className="cx-card soft">
      <h3>這個瀏覽器收不到通知</h3>
      <p style={{ fontSize: 13.5 }}>請改用手機的 Chrome（Android）或 Safari 加入主畫面（iPhone）。</p>
    </section>
  )
  if (state !== 'off') return null
  return (
    <section className="cx-card soft">
      <h3>開啟通知</h3>
      <p style={{ fontSize: 13.5 }}>小孩到班、下課，和老師傳來的訊息，都會馬上通知你。</p>
      {error && <div className="pa-error" role="alert">{error}</div>}
      <button className="cx-btn sm" style={{ justifySelf: 'start' }} disabled={busy} onClick={enable}>
        {busy ? '設定中…' : error ? '再試一次' : '開啟通知'}
      </button>
    </section>
  )
}
