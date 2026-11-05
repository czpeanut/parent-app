/**
 * 移除環境變數中複製貼上夾帶的隱形字元（BOM、零寬字元、不換行空白），
 * 否則放進 HTTP header 時會丟 "Cannot convert argument to a ByteString"。（與 student-app 相同）
 */
export function cleanEnv(s?: string): string {
  return (s ?? '').replace(/[﻿​-‍⁠ ]/g, '').trim()
}

/** 伺服器端環境變數（每次呼叫時才讀，方便測試替換） */
export const serverEnv = {
  supabaseUrl: () => cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
  anonKey: () => cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  serviceKey: () => cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  studentAppUrl: () => (cleanEnv(process.env.STUDENT_APP_URL) || 'https://codexstudy.com').replace(/\/+$/, ''),
  codePepper: () => cleanEnv(process.env.GUARDIAN_CODE_PEPPER),
  notifySecret: () => cleanEnv(process.env.NOTIFY_WEBHOOK_SECRET),
  cronSecret: () => cleanEnv(process.env.CRON_SECRET),
  vapidPublic: () => cleanEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  vapidPrivate: () => cleanEnv(process.env.VAPID_PRIVATE_KEY),
  vapidSubject: () => cleanEnv(process.env.VAPID_SUBJECT) || 'mailto:admin@codexstudy.com',
  appUrl: () => cleanEnv(process.env.NEXT_PUBLIC_APP_URL).replace(/\/+$/, ''),
}
