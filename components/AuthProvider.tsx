'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { browserSupabase } from '@/lib/supabase-browser'
import { disablePush } from '@/lib/client/push'

type Auth = { session: Session | null; loading: boolean; signOut: () => Promise<void> }
const Ctx = createContext<Auth>({ session: null, loading: true, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = browserSupabase()
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { setSession(s); setLoading(false) })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await disablePush().catch(() => {})   // 共用裝置：登出後這台不再收到這位家長的推播
    await browserSupabase().auth.signOut()
  }

  return <Ctx.Provider value={{ session, loading, signOut }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
