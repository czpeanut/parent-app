'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { useAuth } from '@/components/AuthProvider'
import { Icon } from '@/components/Icon'
import { api } from '@/lib/client/api'
import { disablePush, enablePush, pushState, type PushState } from '@/lib/client/push'
import type { Me, ThreadsResponse } from '@/lib/types'

const PUSH_TEXT: Record<PushState, string> = {
  on: '這台裝置會收到通知',
  off: '這台裝置還沒開啟通知',
  denied: '通知被封鎖，請到手機或瀏覽器設定允許',
  unsupported: '這個瀏覽器不支援通知',
  'needs-install': 'iPhone 請先「加入主畫面」，再從主畫面打開',
  'server-off': '通知服務尚未設定',
}

/** 我的：名字、通知、綁定的小孩、登出 */
export default function MePage() {
  const { session, signOut } = useAuth()
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [name, setName] = useState('')
  const [kids, setKids] = useState<{ id: string; name: string }[]>([])
  const [push, setPush] = useState<PushState | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!session) return
    api<Me>('/api/me').then(m => { setMe(m); setName(m.guardian.display_name ?? '') }).catch(e => setMsg({ ok: false, text: (e as Error).message }))
    api<ThreadsResponse>('/api/threads').then(r => setKids(r.threads.map(t => ({ id: t.student.id, name: t.student.display_name })))).catch(() => {})
    pushState().then(setPush).catch(() => setPush('unsupported'))
  }, [session])

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 2500) }
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await api('/api/me', { method: 'PATCH', body: { display_name: name.trim() } }); flash(true, '已儲存名字') } catch (err) { flash(false, (err as Error).message) }
  }
  const setPref = async (k: 'attendance' | 'messages', v: boolean) => {
    if (!me) return
    const prev = me
    setMe({ ...me, prefs: { ...me.prefs, [k]: v } })
    try { await api('/api/me', { method: 'PATCH', body: { prefs: { [k]: v } } }) } catch (err) { setMe(prev); flash(false, (err as Error).message) }
  }
  const togglePush = async () => {
    try { if (push === 'on') { await disablePush(); setPush('off') } else setPush(await enablePush()) } catch (e) { flash(false, `通知設定失敗：${(e as Error).message || '請再試一次'}`) }
  }
  const unbind = async (id: string, nm: string) => {
    if (!confirm(`解除綁定 ${nm}？解除後不會再收到 ${nm} 的到班與老師訊息。`)) return
    try { await api(`/api/children/${id}`, { method: 'DELETE' }); setKids(k => k.filter(x => x.id !== id)); flash(true, `已解除綁定 ${nm}`) } catch (err) { flash(false, (err as Error).message) }
  }

  return (
    <AppShell title="我的" sub={me?.guardian.email ?? session?.user.email ?? undefined}>
      <div className="cx-page cx-enter" style={{ paddingTop: 12 }}>
        {msg && <div className={msg.ok ? 'pa-ok' : 'pa-error'} role="status">{msg.text}</div>}

        <section>
          <div className="cx-sh"><h2>我的名字</h2></div>
          <form className="cx-card" onSubmit={saveName}>
            <label className="pa-field">老師看到的名字
              <input className="cx-input" maxLength={40} placeholder="例：陳一號媽媽" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <button className="cx-btn sm" style={{ justifySelf: 'start' }} disabled={!name.trim() || name.trim() === (me?.guardian.display_name ?? '')}>儲存</button>
          </form>
        </section>

        <section>
          <div className="cx-sh"><h2>通知</h2></div>
          <div className="cx-menu">
            <div className="pa-row">
              <Icon name="bell" />
              <span className="tx">這台裝置<small>{push ? PUSH_TEXT[push] : '檢查中…'}</small></span>
              {(push === 'on' || push === 'off') && <button className="cx-btn sm" onClick={togglePush}>{push === 'on' ? '關閉' : '開啟'}</button>}
            </div>
            {me && (<>
              <Toggle label="上課／下課" sub="小孩到班、下課時通知" checked={me.prefs.attendance} onChange={v => setPref('attendance', v)} />
              <Toggle label="老師訊息" sub="老師或主任傳訊息時通知" checked={me.prefs.messages} onChange={v => setPref('messages', v)} />
            </>)}
          </div>
        </section>

        <section>
          <div className="cx-sh"><h2>綁定的小孩</h2><Link href="/bind">新增</Link></div>
          <div className="cx-menu">
            {kids.map(k => (
              <div className="pa-row" key={k.id}>
                <span className="cx-avatar" aria-hidden>{k.name.slice(-1)}</span>
                <span className="tx">{k.name}</span>
                <button className="pa-danger-sm" onClick={() => unbind(k.id, k.name)}>解除綁定</button>
              </div>
            ))}
            <Link href="/bind"><Icon name="link" />綁定小孩</Link>
            <button className="danger" onClick={async () => { await signOut(); router.replace('/login') }}><Icon name="logout" />登出</button>
          </div>
        </section>
      </div>
    </AppShell>
  )
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="pa-row" style={{ cursor: 'pointer' }}>
      <span style={{ width: 21 }} aria-hidden />
      <span className="tx">{label}<small>{sub}</small></span>
      <span className="pa-switch"><input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} /><span /></span>
    </label>
  )
}
