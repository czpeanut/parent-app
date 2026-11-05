'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/lib/client/api'
import { disablePush, enablePush, pushState, type PushState } from '@/lib/client/push'
import type { ChildrenResponse } from '@/lib/types'

type Me = { guardian: { id: string; display_name: string | null; phone: string | null; email: string | null }; prefs: { attendance: boolean; messages: boolean } }

const PUSH_TEXT: Record<PushState, string> = {
  on: '這台裝置已開啟通知',
  off: '這台裝置尚未開啟通知',
  denied: '通知被封鎖，請到瀏覽器或手機設定允許',
  unsupported: '這個瀏覽器不支援推播通知',
  'needs-install': 'iPhone 請先「加入主畫面」，再從主畫面開啟',
  'server-off': '推播服務尚未設定',
}

export default function SettingsPage() {
  const { session, signOut } = useAuth()
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [name, setName] = useState('')
  const [children, setChildren] = useState<ChildrenResponse['children']>([])
  const [push, setPush] = useState<PushState | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    api<Me>('/api/me').then(m => { setMe(m); setName(m.guardian.display_name ?? '') }).catch(e => setMsg((e as Error).message))
    api<ChildrenResponse>('/api/children').then(r => setChildren(r.children)).catch(() => {})
    pushState().then(setPush).catch(() => setPush('unsupported'))
  }, [session])

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2500) }

  const saveName = async () => {
    try { await api('/api/me', { method: 'PATCH', body: { display_name: name.trim() } }); flash('已儲存') } catch (e) { flash((e as Error).message) }
  }
  const setPref = async (k: 'attendance' | 'messages', v: boolean) => {
    if (!me) return
    setMe({ ...me, prefs: { ...me.prefs, [k]: v } })
    try { await api('/api/me', { method: 'PATCH', body: { prefs: { [k]: v } } }) } catch (e) { flash((e as Error).message); setMe(me) }
  }
  const togglePush = async () => {
    try {
      if (push === 'on') { await disablePush(); setPush('off') } else setPush(await enablePush())
    } catch { flash('設定通知失敗，請稍後再試') }
  }
  const unbind = async (id: string, nm: string) => {
    if (!confirm(`確定要解除綁定 ${nm}？解除後將不再收到這位小孩的通知。`)) return
    try { await api(`/api/children/${id}`, { method: 'DELETE' }); setChildren(cs => cs.filter(c => c.student.id !== id)); flash('已解除綁定') } catch (e) { flash((e as Error).message) }
  }

  return (
    <AppShell title="設定">
      <div className="space-y-4">
        <section className="card space-y-3">
          <h2 className="font-semibold">我的資料</h2>
          <p className="text-sm text-ink-soft">{me?.guardian.email ?? session?.user.email}</p>
          <div>
            <label className="label" htmlFor="name">顯示名稱（老師看到的名字）</label>
            <div className="flex gap-2">
              <input id="name" className="input" maxLength={40} placeholder="例：陳小明媽媽" value={name} onChange={e => setName(e.target.value)} />
              <button className="btn-ghost shrink-0" onClick={saveName} disabled={!name.trim()}>儲存</button>
            </div>
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">通知</h2>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{push ? PUSH_TEXT[push] : '檢查中…'}</p>
            {(push === 'on' || push === 'off') && <button className="btn-ghost shrink-0 px-3 py-2 text-sm" onClick={togglePush}>{push === 'on' ? '關閉' : '開啟'}</button>}
          </div>
          {me && (<>
            <Toggle label="上課／下課通知" checked={me.prefs.attendance} onChange={v => setPref('attendance', v)} />
            <Toggle label="老師／主任訊息通知" checked={me.prefs.messages} onChange={v => setPref('messages', v)} />
          </>)}
        </section>

        {children.length > 0 && (
          <section className="card space-y-2">
            <h2 className="font-semibold">已綁定的小孩</h2>
            {children.map(c => (
              <div key={c.student.id} className="flex items-center justify-between py-1">
                <span>{c.student.display_name}{c.relationship && <span className="ml-2 text-xs text-ink-mute">{c.relationship}</span>}</span>
                <button className="text-sm text-red-600 underline" onClick={() => unbind(c.student.id, c.student.display_name)}>解除綁定</button>
              </div>
            ))}
          </section>
        )}

        <button className="btn-ghost w-full" onClick={async () => { await signOut(); router.replace('/login') }}>登出</button>
        {msg && <p role="status" className="text-center text-sm text-ink-soft">{msg}</p>}
      </div>
    </AppShell>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm">{label}</span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="relative h-7 w-12 rounded-full bg-stone-300 transition peer-checked:bg-brand after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  )
}
