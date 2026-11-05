'use client'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cleanEnv } from './env'

let client: SupabaseClient | null = null

/** 瀏覽器用的 Supabase client（只用來登入；資料一律走家長端伺服器 API） */
export function browserSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL), cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}
