'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { Icon, type IconName } from './Icon'
import { api } from '@/lib/client/api'

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: '首頁', icon: 'home' },
  { href: '/messages', label: '訊息', icon: 'message' },
  { href: '/attendance', label: '到班', icon: 'calendar' },
  { href: '/me', label: '我的', icon: 'user' },
]

const isActive = (href: string, path: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`))

/**
 * v2 外殼（docs/v2-ui-kit 第 4 節）：手機＝頂部列＋底部浮動四格分頁列；≥1180px＝左側欄。
 * title 有值時頂部列顯示頁面名稱（＋小字），否則顯示品牌。back 有值時顯示返回鍵並隱藏分頁列（對話頁）。
 */
export function AppShell({ title, sub, back, children }: { title?: string; sub?: string; back?: string; children: ReactNode }) {
  const { session, loading } = useAuth()
  const router = useRouter()
  const path = usePathname()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!loading && !session) router.replace(`/login?next=${encodeURIComponent(path)}`)
  }, [loading, session, router, path])

  useEffect(() => {
    if (!session) return
    api<{ unread_total: number }>('/api/threads').then(r => setUnread(r.unread_total)).catch(() => {})
  }, [session, path])

  if (loading || !session) return <div className="pa-loading">載入中…</div>
  const initial = (session.user.email ?? '我').slice(0, 1).toUpperCase()

  return (
    <div className="cx-shell">
      <aside className="cx-side" aria-label="主選單">
        <Link href="/" className="head"><span className="cx-logo">C</span><span className="cx-brand">CODEX STUDY<small>家長</small></span></Link>
        {NAV.map(n => (
          <Link key={n.href} href={n.href} className={`cx-nav${isActive(n.href, path) ? ' is-active' : ''}`}>
            <Icon name={n.icon} />{n.label}
            {n.href === '/messages' && unread > 0 && <span className="cx-dot" style={{ marginLeft: 'auto' }}>{unread}</span>}
          </Link>
        ))}
      </aside>

      <header className="cx-top">
        {back && <Link href={back} className="pa-back" aria-label="返回"><Icon name="back" /></Link>}
        {!back && !title && <span className="cx-logo">C</span>}
        <span className="cx-brand">{title ?? 'CODEX STUDY'}<small>{title ? sub : '家長'}</small></span>
        {!back && <Link href="/me" className="cx-avatar" style={{ marginLeft: 'auto', textDecoration: 'none' }} aria-label="我的">{initial}</Link>}
      </header>

      <main className="cx-main">{children}</main>

      {!back && (
        <nav className="cx-tabs" style={{ ['--tabs' as string]: NAV.length }} aria-label="主選單">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} className={`cx-tab${isActive(n.href, path) ? ' is-active' : ''}`} aria-current={isActive(n.href, path) ? 'page' : undefined}>
              <Icon name={n.icon} />{n.label}
              {n.href === '/messages' && unread > 0 && <span className="cx-dot">{unread}</span>}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
