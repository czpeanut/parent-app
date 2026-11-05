import { describe, expect, it } from 'vitest'
import { formatJob, isStale, taipeiTime, categoryOf } from '@/lib/notify-text'
import { hashCode, isWellFormedCode, normalizeCode } from '@/lib/binding'
import { readinessLevel, messageTime } from '@/lib/display'
import { guardianSenderName } from '@/lib/server/messages'

describe('推播文字', () => {
  const base = { id: 'j', student_id: 's1', created_at: '2026-11-04T10:02:00Z' }
  it('上課通知：台灣時間、分校、班級', () => {
    const c = formatJob({ ...base, kind: 'attendance.check_in', payload: { student_name: '陳一號', class_name: '七年甲班', branch_name: '粹學文理 測試校', event_time: '2026-11-04T10:02:00Z' } })
    expect(c?.body).toBe('【CODEX STUDY】陳一號 已於 18:02 到達 粹學文理 測試校（七年甲班）')
    expect(c?.url).toBe('/')
  })
  it('下課通知', () => {
    const c = formatJob({ ...base, kind: 'attendance.check_out', payload: { student_name: '陳一號', event_time: '2026-11-04T13:05:00Z' } })
    expect(c?.body).toBe('【CODEX STUDY】陳一號 已於 21:05 下課離開')
    expect(c?.title).toBe('陳一號 已下課')
  })
  it('老師訊息：連到對話串', () => {
    const c = formatJob({ ...base, kind: 'message.new', payload: { student_name: '陳一號', sender_name: '陳老師', preview: '本週六停課一次' } })
    expect(c?.body).toBe('陳老師：本週六停課一次')
    expect(c?.url).toBe('/messages/s1')
  })
  it('不認得的 kind 回 null', () => {
    expect(formatJob({ ...base, kind: 'other', payload: {} })).toBeNull()
    expect(categoryOf('other')).toBeNull()
  })
  it('到班通知超過 12 小時算過期，訊息 7 天', () => {
    const now = new Date('2026-11-05T00:00:00Z').getTime()
    expect(isStale({ ...base, kind: 'attendance.check_in', payload: {}, created_at: '2026-11-04T10:00:00Z' }, now)).toBe(true)
    expect(isStale({ ...base, kind: 'attendance.check_in', payload: {}, created_at: '2026-11-04T20:00:00Z' }, now)).toBe(false)
    expect(isStale({ ...base, kind: 'message.new', payload: {}, created_at: '2026-11-01T00:00:00Z' }, now)).toBe(false)
  })
  it('台灣時間跨日', () => expect(taipeiTime('2026-11-04T16:30:00Z')).toBe('00:30'))
})

describe('綁定碼', () => {
  it('忽略大小寫、空白、連字號', () => expect(normalizeCode(' abcd-efgh ')).toBe('ABCDEFGH'))
  it('只接受 8 碼、排除 0/O/1/I', () => {
    expect(isWellFormedCode('ABCDEFGH')).toBe(true)
    expect(isWellFormedCode('ABCDEFG0')).toBe(false)
    expect(isWellFormedCode('ABCDEFGO')).toBe(false)
    expect(isWellFormedCode('ABCDEFG1')).toBe(false)
    expect(isWellFormedCode('ABCDEFGI')).toBe(false)
    expect(isWellFormedCode('ABCDEFG')).toBe(false)
  })
  it('sha256(code + pepper) 小寫 hex', () => {
    expect(hashCode('ABCDEFGH', 'pepper')).toBe('ea043ebe4ed383c513dcad2dc2f53c8e6dcf1a93dd855d26fcbcd22548026090')  // printf 'ABCDEFGHpepper' | sha256sum
    expect(hashCode('ABCDEFGH', 'pepper')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashCode('ABCDEFGH', 'pepper')).not.toBe(hashCode('ABCDEFGH', 'other'))
  })
})

describe('顯示', () => {
  it('準備進度分級', () => {
    expect(readinessLevel(80).label).toBe('準備好了')
    expect(readinessLevel(79).label).toBe('進行中')
    expect(readinessLevel(50).label).toBe('進行中')
    expect(readinessLevel(49).label).toBe('要加緊')
  })
  it('訊息時間：今天只顯示時間', () => {
    const now = new Date('2026-11-04T12:00:00Z')
    expect(messageTime('2026-11-04T10:02:00Z', now)).toBe('18:02')
    expect(messageTime('2026-11-02T10:02:00Z', now)).toBe('11/2 18:02')
  })
  it('家長顯示名稱', () => {
    expect(guardianSenderName({ display_name: '王媽媽' }, '陳一號', '母親')).toBe('王媽媽')
    expect(guardianSenderName({ display_name: null }, '陳一號', '母親')).toBe('陳一號的母親')
    expect(guardianSenderName({ display_name: ' ' }, '陳一號', null)).toBe('陳一號的家長')
  })
})
