'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const KEY = 'pa:child'

/** 目前選的小孩：網址 ?child= 優先，其次上次選的（存在這台裝置），最後第一位 */
export function useSelectedChild(ids: string[]): [string | null, (id: string) => void] {
  const sp = useSearchParams()
  const [sel, setSel] = useState<string | null>(null)
  const key = ids.join(',')
  useEffect(() => {
    if (!ids.length) { setSel(null); return }
    let saved: string | null = null
    try { saved = localStorage.getItem(KEY) } catch { /* 私密瀏覽 */ }
    const want = sp.get('child') ?? saved
    setSel(want && ids.includes(want) ? want : ids[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sp])
  const choose = useCallback((id: string) => { setSel(id); try { localStorage.setItem(KEY, id) } catch { /* 忽略 */ } }, [])
  return [sel, choose]
}

/** 多個小孩時的分段切換（.cx-seg）；只有一位就不顯示 */
export function ChildSwitcher({ items, value, onChange }: { items: { id: string; name: string }[]; value: string | null; onChange: (id: string) => void }) {
  if (items.length < 2) return null
  return (
    <div className="pa-seg-scroll">
      <div className="cx-seg" role="tablist" aria-label="切換小孩">
        {items.map(c => (
          <button key={c.id} role="tab" aria-selected={value === c.id} className={value === c.id ? 'on' : ''} onClick={() => onChange(c.id)}>{c.name}</button>
        ))}
      </div>
    </div>
  )
}
