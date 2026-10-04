// Offline test of the live TRON tracer: replays TronGrid-shaped responses from a fixture network.
//   node scripts/test-live-trace.mjs            run the checks
//   node scripts/test-live-trace.mjs --dump F   also write the /api/trace JSON to F (used for UI tests)
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import handler from '../api/trace.js'
import { createClient, isTronAddress, traceTron, USDT_CONTRACT } from '../api/_tron.js'

const fx = JSON.parse(readFileSync(new URL('./fixtures/tron-trace.json', import.meta.url)))
const W = fx.addresses
let requests = []
let lastHeaders = {}

/** Minimal stand-in for TronGrid's /v1/accounts/{a}/transactions/trc20 and CoinGecko */
async function fakeFetch(url, opts = {}) {
  requests.push(url)
  if (url.includes('api.trongrid.io')) lastHeaders = opts.headers || {}
  const u = new URL(url)
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
  if (u.host === 'api.coingecko.com') return json({ tether: { inr: 88.4 } })
  const m = u.pathname.match(/^\/v1\/accounts\/(\w+)\/transactions\/trc20$/)
  if (u.host !== 'api.trongrid.io' || !m) return json({ error: 'not found' }, 404)
  assert.equal(u.searchParams.get('contract_address'), USDT_CONTRACT)
  const [min, max, limit] = ['min_timestamp', 'max_timestamp', 'limit'].map((k) => Number(u.searchParams.get(k)))
  const dir = u.searchParams.get('only_from') ? 'from' : 'to'
  const data = fx.transfers
    .filter((t) => t[dir] === m[1] && t.block_timestamp >= min && t.block_timestamp <= max)
    .sort((a, b) => a.block_timestamp - b.block_timestamp)
    .slice(0, limit)
  return json({ data, success: true, meta: { page_size: data.length } })
}

const first = Math.min(...fx.transfers.map((t) => t.block_timestamp))
const now = first + 3 * 864e5

// address validation
assert.ok(isTronAddress(W.R))
assert.ok(isTronAddress('TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf'))
assert.ok(!isTronAddress(W.R.slice(0, -1) + (W.R.endsWith('a') ? 'b' : 'a')), 'checksum must catch a typo')

// tracer
const client = createClient({ fetch: fakeFetch, maxCalls: 60 })
const tr = await traceTron({ address: W.R, hops: 3, fanout: 3, since: first - 3600e3, now }, client)
const kind = (k) => tr.nodes.filter((n) => n.kind === k).map((n) => n.address)
const byAddr = Object.fromEntries(tr.nodes.map((n) => [n.address, n]))

assert.deepEqual(kind('source').sort(), [W.V1, W.V2, W.V3].sort(), 'all three senders are sources')
assert.deepEqual(kind('deposit'), [W.DEP], 'the wallet that sweeps into Binance is the deposit address')
assert.deepEqual(kind('exchange'), ['TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf'])
assert.equal(byAddr.TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf.entity, 'Binance')
assert.equal(byAddr[W.DEP].hop, 3)
assert.equal(byAddr[W.E].hop, 2)
assert.ok(!byAddr[W.D], 'the smallest outflow is not followed when fanout = 3')
assert.ok(byAddr[W.F] && byAddr[W.F].kind === 'layer', 'money that stops in a private wallet stays a layering wallet')
assert.ok(tr.transfers.some((t) => t.from === W.DEP && t.sweep), 'sweep transfer kept')
assert.ok(!tr.transfers.some((t) => t.from === W.U1), "other users' deposits are not pulled into the graph")
assert.ok(tr.calls <= 12, `few calls (${tr.calls})`)

// budget: a tiny budget stops early with a warning instead of failing
const small = await traceTron({ address: W.R, hops: 3, fanout: 3, since: first - 3600e3, now }, createClient({ fetch: fakeFetch, maxCalls: 3 }))
assert.ok(small.budget_hit && small.warnings.length)

// HTTP handler end-to-end
const run = async (qs) => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(b) { this.body = JSON.parse(b) } }
  await handler({ method: 'GET', url: `/api/trace?${qs}` }, res, { fetchImpl: fakeFetch, env: {}, now })
  return res
}
const bad = await run('address=Tnotreal')
assert.equal(bad.statusCode, 400)
const since = new Date(first - 864e5).toISOString().slice(0, 10)
const ok = await run(`address=${W.R}&hops=3&since=${since}`)
assert.equal(ok.statusCode, 200, JSON.stringify(ok.body))
assert.equal(ok.body.usdt_inr, 88.4)
assert.equal(ok.body.keys.trongrid, false)
assert.ok(requests.every((u) => !u.includes('TRON-PRO-API-KEY')), 'keys never go in the URL')

// with a key set, it goes in the TRON-PRO-API-KEY header
const withKey = { statusCode: 0, setHeader() {}, end() {} }
await handler({ method: 'GET', url: `/api/trace?address=${W.R}&hops=1&since=${since}` }, withKey, { fetchImpl: fakeFetch, env: { TRONGRID_API_KEY: 'k-123' }, now })
assert.equal(withKey.statusCode, 200)
assert.equal(lastHeaders['TRON-PRO-API-KEY'], 'k-123')

const dump = process.argv.indexOf('--dump')
if (dump > 0) writeFileSync(process.argv[dump + 1], JSON.stringify(ok.body, null, 1))
console.log(`live trace tests passed: ${tr.nodes.length} wallets, ${tr.transfers.length} transfers, ${tr.calls} API calls`)
