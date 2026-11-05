import { createHash } from 'node:crypto'

/**
 * 綁定碼規格（必須與 student-app 的 POST /api/guardian-codes 一致，見 docs/SYNC.md 第 5 節）：
 *   - 8 碼，字元集 ABCDEFGHJKLMNPQRSTUVWXYZ23456789（排除 0/O/1/I）
 *   - 家長輸入時忽略大小寫、空白與連字號（印在綁定單上可寫成 ABCD-EFGH）
 *   - code_hash = sha256(正規化後的碼 + GUARDIAN_CODE_PEPPER)，小寫 hex
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s\-‐-―_]/g, '')
}

export function isWellFormedCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every(c => CODE_ALPHABET.includes(c))
}

export function hashCode(code: string, pepper: string): string {
  return createHash('sha256').update(code + pepper, 'utf8').digest('hex')
}
