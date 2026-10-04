// GET /api/trace?address=T...&hops=3&fanout=3&since=2026-09-01
// Live USDT (TRC-20) trace on TRON. Runs on Vercel so the TronGrid / Tronscan keys stay on the server.
//   TRONGRID_API_KEY   recommended (without it TronGrid rate-limits hard)
//   TRONSCAN_API_KEY   optional (adds Tronscan's public exchange tags to the built-in list)
import { BudgetError, createClient, isTronAddress, traceTron } from './_tron.js'

const FALLBACK_USDT_INR = 88

async function usdtInr(fetchImpl) {
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 2500)
    const r = await fetchImpl('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr', { signal: ctl.signal })
    clearTimeout(timer)
    const v = (await r.json())?.tether?.inr
    return { rate: typeof v === 'number' && v > 50 && v < 200 ? v : FALLBACK_USDT_INR, source: typeof v === 'number' ? 'CoinGecko' : 'fallback' }
  } catch {
    return { rate: FALLBACK_USDT_INR, source: 'fallback' }
  }
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', status === 200 ? 'public, s-maxage=300' : 'no-store')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res, { fetchImpl = globalThis.fetch, env = process.env, now = Date.now() } = {}) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' })
  const q = new URL(req.url, 'http://localhost').searchParams
  const address = (q.get('address') || '').trim()
  if (!isTronAddress(address)) return send(res, 400, { error: 'Not a valid TRON address (checksum failed).' })
  const hops = Math.min(4, Math.max(1, Number(q.get('hops')) || 3))
  const fanout = Math.min(5, Math.max(2, Number(q.get('fanout')) || 3))
  const sinceStr = q.get('since')
  const since = sinceStr && /^\d{4}-\d{2}-\d{2}$/.test(sinceStr) ? Date.parse(`${sinceStr}T00:00:00+05:30`) : undefined
  const windowDays = Math.min(180, Math.max(1, Number(q.get('window')) || 30))

  const started = Date.now()
  const client = createClient({
    fetch: fetchImpl, trongridKey: env.TRONGRID_API_KEY, tronscanKey: env.TRONSCAN_API_KEY,
    maxCalls: env.TRONGRID_API_KEY ? 70 : 30, deadline: started + 22000,
  })
  try {
    const [trace, price] = await Promise.all([traceTron({ address, hops, fanout, since, windowDays, now }, client), usdtInr(fetchImpl)])
    return send(res, 200, {
      ...trace, usdt_inr: price.rate, price_source: price.source, took_ms: Date.now() - started,
      keys: { trongrid: Boolean(env.TRONGRID_API_KEY), tronscan: Boolean(env.TRONSCAN_API_KEY) },
    })
  } catch (e) {
    const limited = e.status === 429 || e.status === 403 || e instanceof BudgetError
    const offline = e.name === 'TypeError' // fetch could not connect at all
    return send(res, 502, {
      error: limited ? 'TronGrid rate limit reached.' : offline ? 'Could not reach TronGrid.' : `Live data source failed: ${e.message}`,
      hint: env.TRONGRID_API_KEY ? 'Try again in a minute.' : 'Add TRONGRID_API_KEY in Vercel → Settings → Environment Variables, then redeploy.',
    })
  }
}
