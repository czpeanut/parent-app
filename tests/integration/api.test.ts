import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { NextRequest } from 'next/server'
import { startFakeSupabase, type Row } from '../helpers/fake-supabase.mjs'
import { hashCode } from '@/lib/binding'
import { processJobs } from '@/lib/server/notify'
import { createServiceClient } from '@/lib/server/db'
import type { PushSender } from '@/lib/server/push'
import * as me from '@/app/api/me/route'
import * as bind from '@/app/api/bind/route'
import * as children from '@/app/api/children/route'
import * as child from '@/app/api/children/[studentId]/route'
import * as threads from '@/app/api/threads/[studentId]/route'
import * as threadList from '@/app/api/threads/route'
import * as attendance from '@/app/api/attendance/[studentId]/route'
import * as push from '@/app/api/push/route'
import * as notify from '@/app/api/jobs/notify/route'

const PEPPER = 'test-pepper'
const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'
const U = { mom: 'aaaaaaaa-0000-4000-8000-000000000001', dad: 'aaaaaaaa-0000-4000-8000-000000000002', kid: 'aaaaaaaa-0000-4000-8000-000000000003' }
const G_DAD = 'bbbbbbbb-0000-4000-8000-000000000002'
const THREAD = 'cccccccc-0000-4000-8000-000000000001'
const hours = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

let supa: Awaited<ReturnType<typeof startFakeSupabase>>
let studentApp: Server
let upstreamAuth: string | undefined
let tok: Record<'mom' | 'dad' | 'kid', string>

function fixtures(): Record<string, Row[]> {
  return {
    students: [{ id: S1, display_name: '陳一號' }, { id: S2, display_name: '陳二號' }],
    guardians: [{ id: G_DAD, user_id: U.dad, display_name: null, email: 'dad@example.com' }],
    student_guardians: [{ id: 'sg1', student_id: S1, guardian_id: G_DAD, relationship: '父親', status: 'active' }],
    guardian_binding_codes: [
      { id: 'c1', student_id: S1, code_hash: hashCode('ABCDEFGH', PEPPER), expires_at: new Date(Date.now() + 86400_000).toISOString(), attempts: 0, used_at: null },
      { id: 'c2', student_id: S2, code_hash: hashCode('EXPRDCDE', PEPPER), expires_at: hours(1), attempts: 0, used_at: null },
      { id: 'c3', student_id: S2, code_hash: hashCode('ZZZZZZZZ', PEPPER), expires_at: new Date(Date.now() + 86400_000).toISOString(), attempts: 0, used_at: null },
    ],
    message_threads: [{ id: THREAD, student_id: S1, last_message_at: hours(1) }],
    messages: [
      { id: 'm1', thread_id: THREAD, sender_type: 'staff', sender_staff_email: 't@x.com', sender_name: '陳老師', recipient: 'guardians', body: '本週六停課', created_at: hours(3) },
      { id: 'm2', thread_id: THREAD, sender_type: 'guardian', sender_guardian_id: 'other-guardian', sender_name: '別的家長', recipient: 'teacher', body: '別人寫給老師', created_at: hours(2) },
      { id: 'm3', thread_id: THREAD, sender_type: 'guardian', sender_guardian_id: G_DAD, sender_name: '爸爸', recipient: 'director', body: '我寫給主任', created_at: hours(1) },
    ],
    message_reads: [], guardian_bind_attempts: [], guardian_push_subscriptions: [], guardian_notification_prefs: [],
    notification_jobs: [], notification_deliveries: [],
    classes: [{ id: 'cls1', name: '七年甲班' }],
    attendance_events: [
      { id: 'a1', student_id: S1, class_id: 'cls1', event_type: 'check_in', event_time: hours(5) },
      { id: 'a2', student_id: S1, class_id: 'cls1', event_type: 'check_out', event_time: hours(2) },
      { id: 'a3', student_id: S1, class_id: 'cls1', event_type: 'check_in', event_time: hours(24 * 70) },
      { id: 'a4', student_id: S2, class_id: 'cls1', event_type: 'check_in', event_time: hours(1) },
    ],
  }
}

function claim(args: { n: number }, db: Record<string, Row[]>) {
  const ten = Date.now() - 600_000
  const pick = db.notification_jobs
    .filter(j => ((['pending', 'failed'].includes(j.status) && j.attempts < 5) || (j.status === 'processing' && new Date(j.claimed_at ?? j.created_at).getTime() < ten && j.attempts < 5)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, args.n)
  for (const j of pick) { j.status = 'processing'; j.attempts++; j.claimed_at = new Date().toISOString() }
  return pick.map(j => ({ ...j }))
}

beforeAll(async () => {
  supa = await startFakeSupabase({
    port: 54399,
    users: { 'mom@example.com': { id: U.mom, password: 'x' }, 'dad@example.com': { id: U.dad, password: 'x' }, 'kid@student.local': { id: U.kid, password: 'x' } },
    tables: fixtures(),
    rpc: { claim_notification_jobs: claim },
  })
  tok = { mom: supa.tokenFor('mom@example.com'), dad: supa.tokenFor('dad@example.com'), kid: supa.tokenFor('kid@student.local') }
  studentApp = createServer((req, res) => {
    upstreamAuth = req.headers.authorization
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ date: '2026-11-04', children: req.headers.authorization === `Bearer ${tok.dad}` ? [{
      student: { id: S1, display_name: '陳一號' }, relationship: '父親',
      attendance_today: { status: 'in', events: [{ event_type: 'check_in', event_time: hours(1) }] }, readiness: [], recent_assessments: [],
    }] : [] }))
  })
  await new Promise<void>(r => studentApp.listen(54398, '127.0.0.1', r))
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: supa.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
    STUDENT_APP_URL: 'http://127.0.0.1:54398', GUARDIAN_CODE_PEPPER: PEPPER, NOTIFY_WEBHOOK_SECRET: 'hook-secret',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv',
  })
})
afterAll(async () => { await supa.close(); await new Promise(r => studentApp.close(r)) })

const req = (path: string, o: { token?: string; method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: o.method ?? 'GET',
    headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...o.headers },
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  })
const json = async (r: Response) => ({ status: r.status, data: await r.json() })
const params = (studentId: string) => ({ params: Promise.resolve({ studentId }) })

describe('身份', () => {
  it('沒有 token → 401', async () => expect((await me.GET(req('/api/me'))).status).toBe(401))
  it('學生帳號（@student.local）不能當家長', async () => expect((await me.GET(req('/api/me', { token: tok.kid }))).status).toBe(401))
  it('第一次登入建立 guardians 列，偏好預設全開', async () => {
    const r = await json(await me.GET(req('/api/me', { token: tok.mom })))
    expect(r.status).toBe(200)
    expect(r.data.prefs).toEqual({ attendance: true, messages: true })
    expect(supa.db.guardians.filter(g => g.user_id === U.mom)).toHaveLength(1)
    await me.GET(req('/api/me', { token: tok.mom }))
    expect(supa.db.guardians.filter(g => g.user_id === U.mom)).toHaveLength(1)
  })
  it('改名字與通知偏好', async () => {
    expect((await me.PATCH(req('/api/me', { token: tok.mom, method: 'PATCH', body: { display_name: '陳媽媽', prefs: { attendance: false } } }))).status).toBe(200)
    const r = await json(await me.GET(req('/api/me', { token: tok.mom })))
    expect(r.data.guardian.display_name).toBe('陳媽媽')
    expect(r.data.prefs).toEqual({ attendance: false, messages: true })
    await me.PATCH(req('/api/me', { token: tok.mom, method: 'PATCH', body: { prefs: { attendance: true } } }))
  })
})

describe('綁定碼', () => {
  const momGuardian = () => supa.db.guardians.find(g => g.user_id === U.mom)!
  beforeEach(() => { supa.db.guardian_bind_attempts.length = 0 })

  it('錯誤、格式不對、過期都回同一句話', async () => {
    for (const code of ['ABCDEFGJ', '123', 'EXPR-DCDE']) {
      const r = await json(await bind.POST(req('/api/bind', { token: tok.mom, method: 'POST', body: { code } })))
      expect(r.status).toBe(400)
      expect(r.data.error).toBe('綁定碼錯誤或已過期')
    }
  })
  it('正確的碼（小寫、含連字號）綁定成功，碼標記已使用', async () => {
    const r = await json(await bind.POST(req('/api/bind', { token: tok.mom, method: 'POST', body: { code: 'abcd-efgh', relationship: '母親' } })))
    expect(r.status).toBe(200)
    expect(r.data.student).toEqual({ id: S1, display_name: '陳一號' })
    const link = supa.db.student_guardians.find(l => l.guardian_id === momGuardian().id)!
    expect(link).toMatchObject({ student_id: S1, status: 'active', relationship: '母親' })
    expect(link.verified_at).toBeTruthy()
    expect(supa.db.guardian_binding_codes.find(c => c.id === 'c1')).toMatchObject({ used_by: momGuardian().id })
  })
  it('同一個碼不能再用', async () => {
    expect((await bind.POST(req('/api/bind', { token: tok.dad, method: 'POST', body: { code: 'ABCDEFGH' } }))).status).toBe(400)
  })
  it('同一帳號一小時 10 次就擋（429），連正確的碼也不收', async () => {
    for (let i = 0; i < 10; i++) await bind.POST(req('/api/bind', { token: tok.dad, method: 'POST', body: { code: 'WRONGWRG' } }))
    const r = await bind.POST(req('/api/bind', { token: tok.dad, method: 'POST', body: { code: 'ZZZZZZZZ' } }))
    expect(r.status).toBe(429)
    expect(supa.db.guardian_binding_codes.find(c => c.id === 'c3')!.used_at).toBeNull()
  })
  it('同一 IP 換帳號也擋', async () => {
    for (let i = 0; i < 10; i++) await bind.POST(req('/api/bind', { token: tok.dad, method: 'POST', body: { code: 'WRONGWRG' }, headers: { 'x-forwarded-for': '1.2.3.4' } }))
    expect((await bind.POST(req('/api/bind', { token: tok.mom, method: 'POST', body: { code: 'ZZZZZZZZ' }, headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } }))).status).toBe(429)
  })
})

describe('小孩資料', () => {
  it('轉呼叫 student-app，帶家長自己的 token，補上未讀數', async () => {
    const r = await json(await children.GET(req('/api/children', { token: tok.dad })))
    expect(r.status).toBe(200)
    expect(upstreamAuth).toBe(`Bearer ${tok.dad}`)
    expect(r.data.children).toHaveLength(1)
    expect(r.data.children[0].unread).toBe(1)   // m1（給家長）未讀；m2、m3 是家長寫的不算
  })
})

describe('訊息', () => {
  it('沒綁定的學生 → 403', async () => {
    expect((await threads.GET(req(`/api/threads/${S2}`, { token: tok.dad }), params(S2))).status).toBe(403)
    expect((await threads.POST(req(`/api/threads/${S2}`, { token: tok.dad, method: 'POST', body: { to: 'teacher', body: 'hi' } }), params(S2))).status).toBe(403)
    expect((await threads.GET(req('/api/threads/not-a-uuid', { token: tok.dad }), params('not-a-uuid'))).status).toBe(403)
  })
  it('看得到給家長的與自己寫的，看不到別的家長寫給老師的；讀完標已讀', async () => {
    const r = await json(await threads.GET(req(`/api/threads/${S1}`, { token: tok.dad }), params(S1)))
    expect(r.status).toBe(200)
    expect(r.data.messages.map((m: Row) => m.id)).toEqual(['m1', 'm3'])
    expect(r.data.messages[1].mine).toBe(true)
    expect(JSON.stringify(r.data)).not.toContain('t@x.com')   // 不外露老師 email
    expect(supa.db.message_reads.find(x => x.reader_type === 'guardian' && x.reader_key === G_DAD)?.thread_id).toBe(THREAD)
    const c = await json(await children.GET(req('/api/children', { token: tok.dad })))
    expect(c.data.children[0].unread).toBe(0)
  })
  it('家長傳給老師：寫入 messages、更新 last_message_at；名稱用「小孩的關係」', async () => {
    const r = await json(await threads.POST(req(`/api/threads/${S1}`, { token: tok.dad, method: 'POST', body: { to: 'teacher', body: '  明天請假  ' } }), params(S1)))
    expect(r.status).toBe(200)
    const m = supa.db.messages.find(x => x.id === r.data.message.id)!
    expect(m).toMatchObject({ thread_id: THREAD, sender_type: 'guardian', sender_guardian_id: G_DAD, sender_name: '陳一號的父親', recipient: 'teacher', body: '明天請假' })
    expect(supa.db.message_threads[0].last_message_at).toBe(m.created_at)
  })
  it('還沒有對話串的學生：第一次傳訊息時建立', async () => {
    supa.db.student_guardians.push({ id: 'sg9', student_id: S2, guardian_id: G_DAD, relationship: null, status: 'active' })
    expect((await json(await threads.GET(req(`/api/threads/${S2}`, { token: tok.dad }), params(S2)))).data.messages).toEqual([])
    expect((await threads.POST(req(`/api/threads/${S2}`, { token: tok.dad, method: 'POST', body: { to: 'director', body: '想約時間' } }), params(S2))).status).toBe(200)
    expect(supa.db.message_threads.filter(t => t.student_id === S2)).toHaveLength(1)
  })
  it('內容驗證：空白、超過 2000 字、收件人不對', async () => {
    for (const body of [{ to: 'teacher', body: '   ' }, { to: 'teacher', body: 'x'.repeat(2001) }, { to: 'guardians', body: 'x' }]) {
      expect((await threads.POST(req(`/api/threads/${S1}`, { token: tok.dad, method: 'POST', body }), params(S1))).status).toBe(400)
    }
  })
  it('解除綁定後改成 revoked，看不到訊息', async () => {
    expect((await child.DELETE(req(`/api/children/${S2}`, { token: tok.dad, method: 'DELETE' }), params(S2))).status).toBe(200)
    expect(supa.db.student_guardians.find(l => l.id === 'sg9')!.status).toBe('revoked')
    expect((await threads.GET(req(`/api/threads/${S2}`, { token: tok.dad }), params(S2))).status).toBe(403)
  })
})

describe('訊息列表與到班紀錄', () => {
  it('訊息列表：每位綁定的小孩一列，最後一則、未讀', async () => {
    const r = await json(await threadList.GET(req('/api/threads', { token: tok.dad })))
    expect(r.status).toBe(200)
    const t = r.data.threads.find((x: Row) => x.student.id === S1)
    expect(t.student.display_name).toBe('陳一號')
    expect(t.last.mine).toBe(true)                       // 最後一則是爸爸自己寫的
    expect(JSON.stringify(r.data)).not.toContain('別人寫給老師')
    expect(JSON.stringify(r.data)).not.toContain('t@x.com')
    expect(r.data.threads.some((x: Row) => x.student.id === S2)).toBe(false)   // 已解除綁定
  })
  it('沒有 guardians 列的帳號：空清單', async () => {
    const r = await json(await threadList.GET(req('/api/threads', { token: tok.mom })))
    expect(r.status).toBe(200)
  })
  it('到班紀錄：只回最近 60 天、附班級名稱與統計；沒綁定 → 403', async () => {
    const r = await json(await attendance.GET(req(`/api/attendance/${S1}`, { token: tok.dad }), params(S1)))
    expect(r.status).toBe(200)
    expect(r.data.events.map((e: Row) => e.event_type)).toEqual(['check_out', 'check_in'])
    expect(r.data.events[0].class_name).toBe('七年甲班')
    expect(r.data.stats).toHaveProperty('month_days')
    expect((await attendance.GET(req(`/api/attendance/${S2}`, { token: tok.dad }), params(S2))).status).toBe(403)
    expect((await attendance.GET(req(`/api/attendance/${S1}`, { token: tok.kid }), params(S1))).status).toBe(401)
  })
})

describe('推播訂閱', () => {
  const sub = { endpoint: 'https://push.example.com/dad-phone', keys: { p256dh: 'p', auth: 'a' } }
  it('訂閱、重複訂閱不重複、http endpoint 拒絕', async () => {
    expect((await push.POST(req('/api/push', { token: tok.dad, method: 'POST', body: sub }))).status).toBe(200)
    expect((await push.POST(req('/api/push', { token: tok.dad, method: 'POST', body: sub }))).status).toBe(200)
    expect(supa.db.guardian_push_subscriptions.filter(s => s.endpoint === sub.endpoint)).toHaveLength(1)
    expect((await push.POST(req('/api/push', { token: tok.dad, method: 'POST', body: { ...sub, endpoint: 'http://evil' } }))).status).toBe(400)
  })
  it('取消訂閱只刪自己的', async () => {
    await push.DELETE(req('/api/push', { token: tok.mom, method: 'DELETE', body: { endpoint: sub.endpoint } }))
    expect(supa.db.guardian_push_subscriptions).toHaveLength(1)
    await push.DELETE(req('/api/push', { token: tok.dad, method: 'DELETE', body: { endpoint: sub.endpoint } }))
    expect(supa.db.guardian_push_subscriptions).toHaveLength(0)
  })
  it('公鑰設定', async () => expect((await json(await push.GET())).data).toEqual({ enabled: true, publicKey: 'pub' }))
})

describe('推播 worker', () => {
  const job = (id: string, o: Row = {}) => ({
    id, kind: 'attendance.check_in', student_id: S1, source_table: 'attendance_events', source_id: null, status: 'pending', attempts: 0,
    payload: { student_name: '陳一號', class_name: '七年甲班', branch_name: '測試校', event_type: 'check_in', event_time: hours(0) },
    created_at: hours(0), ...o,
  })
  const sent: { endpoint: string; body: string }[] = []
  let behaviour: Record<string, 'ok' | 'gone' | 'error'> = {}
  const sender: PushSender = async (s, c) => {
    const b = behaviour[s.endpoint] ?? 'ok'
    if (b === 'ok') { sent.push({ endpoint: s.endpoint, body: c.body }); return { ok: true } }
    return { ok: false, gone: b === 'gone', error: `push ${b}` }
  }
  const status = (id: string) => supa.db.notification_jobs.find(j => j.id === id)!
  const momId = () => supa.db.guardians.find(g => g.user_id === U.mom)!.id

  beforeEach(() => {
    sent.length = 0; behaviour = {}
    supa.db.notification_jobs.length = 0; supa.db.notification_deliveries.length = 0
    supa.db.guardian_push_subscriptions.length = 0; supa.db.guardian_notification_prefs.length = 0
    supa.db.guardian_push_subscriptions.push(
      { id: 'sub-dad', guardian_id: G_DAD, endpoint: 'https://push/dad', keys: { p256dh: 'p', auth: 'a' } },
      { id: 'sub-mom', guardian_id: momId(), endpoint: 'https://push/mom', keys: { p256dh: 'p', auth: 'a' } },
    )
  })

  it('沒有密鑰 → 401', async () => {
    expect((await notify.POST(req('/api/jobs/notify', { method: 'POST' }))).status).toBe(401)
    expect((await notify.POST(req('/api/jobs/notify', { method: 'POST', headers: { 'x-notify-secret': 'wrong' } }))).status).toBe(401)
  })
  it('送給學生所有 active 家長的每台裝置 → sent', async () => {
    supa.db.notification_jobs.push(job('j1'))
    const r = await processJobs(createServiceClient(), sender)
    expect(r).toEqual([{ id: 'j1', status: 'sent' }])
    expect(sent.map(s => s.endpoint).sort()).toEqual(['https://push/dad', 'https://push/mom'])
    expect(sent[0].body).toContain('陳一號 已於')
    expect(status('j1')).toMatchObject({ status: 'sent', attempts: 1 })
    expect(status('j1').processed_at).toBeTruthy()
  })
  it('沒有綁定家長 → skipped；不認得的 kind、太舊 → skipped', async () => {
    supa.db.notification_jobs.push(job('j2', { student_id: S2 }), job('j3', { kind: 'x.y' }), job('j4', { created_at: hours(13) }))
    const r = await processJobs(createServiceClient(), sender)
    expect(r.map(x => x.status)).toEqual(['skipped', 'skipped', 'skipped'])
    expect(status('j2').last_error).toBe('no active guardians')
    expect(sent).toHaveLength(0)
  })
  it('家長關閉到班通知就不送給他；訊息通知照送', async () => {
    supa.db.guardian_notification_prefs.push({ guardian_id: G_DAD, attendance: false, messages: true })
    supa.db.notification_jobs.push(job('j5'), job('j6', { kind: 'message.new', created_at: hours(-0.001), payload: { student_name: '陳一號', sender_name: '陳老師', preview: '停課' } }))
    await processJobs(createServiceClient(), sender)
    expect(sent.map(s => `${s.endpoint} ${s.body}`)).toEqual([
      'https://push/mom 【CODEX STUDY】陳一號 已於 ' + sent[0].body.split('已於 ')[1],
      'https://push/dad 陳老師：停課', 'https://push/mom 陳老師：停課',
    ])
  })
  it('某台失敗 → failed；重試時已送過的不重送', async () => {
    behaviour['https://push/mom'] = 'error'
    supa.db.notification_jobs.push(job('j7'))
    expect((await processJobs(createServiceClient(), sender))[0].status).toBe('failed')
    expect(status('j7').last_error).toContain('push error')
    expect(sent.map(s => s.endpoint)).toEqual(['https://push/dad'])
    behaviour = {}
    expect((await processJobs(createServiceClient(), sender))[0].status).toBe('sent')
    expect(sent.map(s => s.endpoint)).toEqual(['https://push/dad', 'https://push/mom'])
    expect(status('j7').attempts).toBe(2)
  })
  it('裝置已失效（410）→ 刪掉訂閱；全部失效 → skipped', async () => {
    behaviour = { 'https://push/dad': 'gone', 'https://push/mom': 'gone' }
    supa.db.notification_jobs.push(job('j8'))
    expect((await processJobs(createServiceClient(), sender))[0].status).toBe('skipped')
    expect(supa.db.guardian_push_subscriptions).toHaveLength(0)
  })
  it('attempts 到 5 就不再取件', async () => {
    supa.db.notification_jobs.push(job('j9', { status: 'failed', attempts: 5 }))
    expect(await processJobs(createServiceClient(), sender)).toEqual([])
  })
})
