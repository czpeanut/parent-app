'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import { useAuth } from './AuthProvider'

const NAV = [
  { href: '/', label: '小孩', icon: '🏠' },
  { href: '/bind', label: '綁定', icon: '🔗' },
  { href: '/settings', label: '設定', icon: '⚙️' },
]

/** 登入後頁面的外框：未登入導到 /login；上方標題、下方導覽列 */
export function AppShell({ title, back, hideNav, children }: { title: string; back?: string; hideNav?: boolean; children: ReactNode }) {
  const { session, loading } = useAuth()
  const router = useRouter()
  const path = usePathname()

  useEffect(() => {
    if (!loading && !session) router.replace(`/login?next=${encodeURIComponent(path)}`)
  }, [loading, session, router, path])

  if (loading || !session) return <div className="flex min-h-dvh items-center justify-center text-ink-mute">載入中…</div>

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="safe-top sticky top-0 z-10 border-b border-paper-line bg-paper/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4">
          {back && <Link href={back} className="-ml-2 rounded-lg px-2 py-1 text-xl text-ink-soft" aria-label="返回">‹</Link>}
          <h1 className="truncate text-lg font-bold">{title}</h1>
        </div>
      </header>
      <main className={clsx('flex-1 px-4 pt-4', hideNav ? 'pb-4' : 'pb-24')}>{children}</main>
      {!hideNav && <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-paper-line bg-paper-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl">
          {NAV.map(n => {
            const active = n.href === '/' ? path === '/' || path.startsWith('/messages') : path.startsWith(n.href)
            return (
              <Link key={n.href} href={n.href} className={clsx('flex flex-1 flex-col items-center py-2 text-xs', active ? 'font-semibold text-brand-dark' : 'text-ink-mute')}>
                <span className="text-xl leading-6" aria-hidden>{n.icon}</span>{n.label}
              </Link>
            )
          })}
        </div>
      </nav>}
    </div>
  )
}
