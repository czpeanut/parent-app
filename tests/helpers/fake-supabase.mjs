// 假 Supabase（測試用，取自 student-app e2e/fake-supabase.mjs）：涵蓋 Auth、PostgREST、RPC 端點。
// 資料存在記憶體，查詢支援 eq / neq / in / is / gt / gte / lt / lte / order / limit / select（不做欄位投影）。
// 用法：const supa = await startFakeSupabase({ port, users, tables, rpc })
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

/**
 * @param {object} o
 * @param {number} o.port
 * @param {Record<string, {id: string, password: string}>} o.users  email → 帳號
 * @param {Record<string, object[]>} o.tables                       表名 → 資料列
 * @param {Record<string, (args: object, db: object) => unknown>} [o.rpc]
 * @param {Record<string, string[][]>} [o.unique]                    表名 → 唯一鍵（一般 insert 撞到回 23505，跟正式資料庫一樣）
 */
export async function startFakeSupabase({ port, users, tables, rpc = {}, unique = {} }) {
  const db = structuredClone(tables)
  const tokens = new Map()          // access_token → email
  const storage = new Map()         // bucket/path → Buffer
  const log = []                    // 寫入紀錄，測試可檢查

  const tokenFor = email => { const t = `tok-${users[email].id}`; tokens.set(t, email); return t }
  for (const e of Object.keys(users)) tokenFor(e)
  const authUser = email => ({ id: users[email].id, aud: 'authenticated', role: 'authenticated', email, user_metadata: {}, app_metadata: {} })
  const whoAmI = req => tokens.get((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))

  const parseVal = v => {
    if (v === 'null') return null
    if (v === 'true') return true
    if (v === 'false') return false
    return v.replace(/^"(.*)"$/, '$1')
  }
  const cmp = (a, b) => (a == null ? '' : String(a)).localeCompare(b == null ? '' : String(b), 'en', { numeric: true })
  function match(row, key, expr) {
    const neg = expr.startsWith('not.')
    const e = neg ? expr.slice(4) : expr
    const dot = e.indexOf('.')
    const op = e.slice(0, dot), raw = e.slice(dot + 1)
    const v = row[key]
    let ok
    switch (op) {
      case 'eq': ok = String(v) === String(parseVal(raw)); break
      case 'neq': ok = String(v) !== String(parseVal(raw)); break
      case 'is': ok = parseVal(raw) === null ? v == null : v === parseVal(raw); break
      case 'in': ok = raw.replace(/^\(|\)$/g, '').split(',').filter(Boolean).map(parseVal).map(String).includes(String(v)); break
      case 'gt': ok = cmp(v, parseVal(raw)) > 0; break
      case 'gte': ok = cmp(v, parseVal(raw)) >= 0; break
      case 'lt': ok = cmp(v, parseVal(raw)) < 0; break
      case 'lte': ok = cmp(v, parseVal(raw)) <= 0; break
      case 'ilike': case 'like': ok = new RegExp('^' + parseVal(raw).replace(/[%*]/g, '.*') + '$', 'i').test(String(v ?? '')); break
      default: ok = true
    }
    return neg ? !ok : ok
  }
  const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and'])
  function filterRows(rows, sp) {
    let out = rows.filter(r => [...sp.entries()].every(([k, v]) => RESERVED.has(k) || match(r, k, v)))
    const order = sp.get('order')
    if (order) {
      for (const part of order.split(',').reverse()) {
        const [col, dir] = part.split('.')
        out = [...out].sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[col], b[col]))
      }
    }
    const off = Number(sp.get('offset') ?? 0)
    const lim = sp.get('limit') ? Number(sp.get('limit')) : undefined
    return out.slice(off, lim === undefined ? undefined : off + lim)
  }

  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks)
    const bodyText = raw.toString('utf8')
    const send = (code, data, headers = {}) => {
      res.writeHead(code, {
        'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*', ...headers,
      })
      res.end(data === undefined ? '' : JSON.stringify(data))
    }
    if (req.method === 'OPTIONS') return send(200, {})
    const u = new URL(req.url, 'http://x')
    const p = u.pathname

    // ── Auth ──
    if (p === '/auth/v1/token') {
      const { email, password } = JSON.parse(bodyText || '{}')
      const x = users[email]
      if (!x || x.password !== password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
      return send(200, { access_token: tokenFor(email), refresh_token: 'r-' + x.id, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: authUser(email) })
    }
    if (p === '/auth/v1/logout') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end() }
    if (p === '/auth/v1/user') {
      const e = whoAmI(req)
      if (req.method === 'PUT') return e ? send(200, authUser(e)) : send(401, {})
      return e ? send(200, authUser(e)) : send(401, { msg: 'bad token' })
    }
    if (p.startsWith('/auth/v1/admin/users')) {
      if (req.method === 'POST') {
        const b = JSON.parse(bodyText || '{}'); const id = randomUUID()
        users[b.email] = { id, password: b.password }; log.push({ op: 'admin.createUser', email: b.email })
        return send(200, { id, email: b.email, user: { id, email: b.email } })
      }
      return send(200, {})
    }

    // ── RPC ──
    if (p.startsWith('/rest/v1/rpc/')) {
      const name = p.slice('/rest/v1/rpc/'.length)
      const args = bodyText ? JSON.parse(bodyText) : {}
      log.push({ op: 'rpc', name, args })
      const out = rpc[name] ? rpc[name](args, db) : null
      return out === null || out === undefined ? (res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }), res.end()) : send(200, out)
    }

    // ── PostgREST ──
    if (p.startsWith('/rest/v1/')) {
      const table = p.slice('/rest/v1/'.length)
      db[table] ??= []
      const rows = db[table]
      const prefer = req.headers.prefer ?? ''
      const wantsObject = (req.headers.accept ?? '').includes('vnd.pgrst.object')
      const reply = (list, status = 200) => {
        const headers = { 'Content-Range': `0-${Math.max(0, list.length - 1)}/${list.length}` }
        if (req.method === 'HEAD') { res.writeHead(200, { ...headers, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' }); return res.end() }
        if (wantsObject) {
          if (list.length !== 1) return send(406, { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned`, details: `Results contain ${list.length} rows` })
          return send(status, list[0], headers)
        }
        return send(status, list, headers)
      }
      if (req.method === 'GET' || req.method === 'HEAD') return reply(filterRows(rows, u.searchParams))
      if (req.method === 'POST') {
        const input = JSON.parse(bodyText || '[]')
        const list = Array.isArray(input) ? input : [input]
        const conflict = u.searchParams.get('on_conflict')?.split(',')
        const upsert = prefer.includes('resolution=merge-duplicates') || prefer.includes('resolution=ignore-duplicates')
        const out = []
        for (const r of list) {
          const existing = conflict && upsert ? rows.find(x => conflict.every(c => String(x[c]) === String(r[c]))) : null
          if (existing) {
            if (prefer.includes('merge-duplicates')) Object.assign(existing, r)
            out.push(existing)
          } else {
            if (conflict && !upsert && rows.find(x => conflict.every(c => String(x[c]) === String(r[c])))) {
              return send(409, { code: '23505', message: 'duplicate key value violates unique constraint' })
            }
            for (const cols of unique[table] ?? []) {
              if (cols.every(c => r[c] != null) && rows.find(x => cols.every(c => String(x[c]) === String(r[c])))) {
                return send(409, { code: '23505', message: `duplicate key value violates unique constraint (${cols.join(',')})` })
              }
            }
            const row = { id: randomUUID(), created_at: new Date().toISOString(), ...r }
            rows.push(row); out.push(row)
          }
        }
        log.push({ op: 'insert', table, rows: out })
        return prefer.includes('return=representation') ? reply(out, 201) : (res.writeHead(201, { 'Access-Control-Allow-Origin': '*' }), res.end())
      }
      if (req.method === 'PATCH') {
        const patch = JSON.parse(bodyText || '{}')
        const hit = filterRows(rows, u.searchParams)
        for (const r of hit) Object.assign(r, patch)
        log.push({ op: 'update', table, patch, count: hit.length })
        return prefer.includes('return=representation') ? reply(hit) : (res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }), res.end())
      }
      if (req.method === 'DELETE') {
        const hit = new Set(filterRows(rows, u.searchParams))
        db[table] = rows.filter(r => !hit.has(r))
        log.push({ op: 'delete', table, count: hit.size })
        return prefer.includes('return=representation') ? reply([...hit]) : (res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }), res.end())
      }
    }

    // ── Storage ──
    if (p.startsWith('/storage/v1/object/sign/')) {
      const key = p.slice('/storage/v1/object/sign/'.length)
      return send(200, { signedURL: `/object/public/${key}?token=t` })
    }
    if (p.startsWith('/storage/v1/object/')) {
      const key = p.replace(/^\/storage\/v1\/object\/(public\/|authenticated\/)?/, '')
      if (req.method === 'POST' || req.method === 'PUT') { storage.set(key, raw); log.push({ op: 'upload', key }); return send(200, { Key: key }) }
      if (storage.has(key)) { res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' }); return res.end(storage.get(key)) }
      return send(404, { error: 'not found' })
    }
    send(404, { error: `fake supabase: ${req.method} ${p}` })
  })

  await new Promise(r => server.listen(port, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${port}`, db, log, storage, tokenFor, close: () => new Promise(r => server.close(r)) }
}
