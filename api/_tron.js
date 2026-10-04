// Live USDT (TRC-20) tracer for TRON. Pure logic: the HTTP client is injected, so it runs the same
// in the Vercel function, the local dev server and the tests (which replay recorded responses).
import { createHash } from 'node:crypto'
import { KNOWN_EXCHANGE_WALLETS, exchangeFromTag } from './_exchanges.js'

export const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const TRONGRID = 'https://api.trongrid.io'
const TRONSCAN = 'https://apilist.tronscanapi.com'
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const DAY = 864e5

/** Base58check validation of a TRON address (T-prefix, 0x41 version byte, 4-byte checksum) */
export function isTronAddress(a) {
  if (typeof a !== 'string' || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return false
  let n = 0n
  for (const c of a) n = n * 58n + BigInt(B58.indexOf(c))
  const bytes = Buffer.from(n.toString(16).padStart(50, '0'), 'hex')
  if (bytes.length !== 25 || bytes[0] !== 0x41) return false
  const h = createHash('sha256').update(createHash('sha256').update(bytes.subarray(0, 21)).digest()).digest()
  return h.subarray(0, 4).equals(bytes.subarray(21))
}

export class BudgetError extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** TronGrid + Tronscan client with a call budget, retry with backoff on 429/5xx, and a tag cache */
export function createClient({ fetch, trongridKey, tronscanKey, maxCalls = 60, deadline = Infinity }) {
  let calls = 0
  const tagCache = new Map()

  async function getJson(url, headers = {}) {
    for (let attempt = 0; ; attempt++) {
      if (calls >= maxCalls || Date.now() > deadline) throw new BudgetError('trace budget reached')
      calls++
      const res = await fetch(url, { headers: { accept: 'application/json', ...headers } })
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(400 * 2 ** attempt + Math.random() * 250)
        continue
      }
      if (!res.ok) {
        const err = new Error(`${new URL(url).host} returned ${res.status}`)
        err.status = res.status
        throw err
      }
      return res.json()
    }
  }

  /** USDT transfers of `address`, sent (dir 'from') or received (dir 'to'), oldest first */
  async function transfers(address, dir, { min, max, limit = 50 }) {
    const q = new URLSearchParams({
      only_confirmed: 'true', limit: String(limit), contract_address: USDT_CONTRACT, order_by: 'block_timestamp,asc',
      min_timestamp: String(Math.floor(min)), max_timestamp: String(Math.floor(max)), [dir === 'from' ? 'only_from' : 'only_to']: 'true',
    })
    const j = await getJson(`${TRONGRID}/v1/accounts/${address}/transactions/trc20?${q}`, trongridKey ? { 'TRON-PRO-API-KEY': trongridKey } : {})
    return (j.data || [])
      .filter((x) => x.type === 'Transfer' && x.token_info?.address === USDT_CONTRACT)
      .map((x) => ({ hash: x.transaction_id, from: x.from, to: x.to, amount: Number(x.value) / 10 ** (x.token_info.decimals ?? 6), timestamp: x.block_timestamp }))
  }

  /** Exchange label for an address: hand-checked list first, then Tronscan's public tag if a key is set */
  async function label(address) {
    const known = KNOWN_EXCHANGE_WALLETS[address]
    if (known) return { ...known, source: 'curated' }
    if (!tronscanKey) return null
    if (tagCache.has(address)) return tagCache.get(address)
    let out = null
    try {
      const j = await getJson(`${TRONSCAN}/api/accountv2?address=${address}`, { 'TRON-PRO-API-KEY': tronscanKey })
      const tag = j.addressTag || j.publicTag || j.addressTagName || null
      const ex = exchangeFromTag(tag)
      out = ex ? { ...ex, source: 'tronscan' } : tag ? { entity: null, label: tag, source: 'tronscan' } : null
    } catch (e) {
      if (e instanceof BudgetError) throw e
      out = null // a failed tag lookup never stops the trace
    }
    tagCache.set(address, out)
    return out
  }

  return { transfers, label, get calls() { return calls } }
}

async function mapLimit(items, n, fn) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift())
  }))
}

function groupByCounterparty(txs, key) {
  const m = new Map()
  for (const t of txs) {
    const g = m.get(t[key]) || { address: t[key], total: 0, first: t.timestamp, txs: [] }
    g.total += t.amount
    g.first = Math.min(g.first, t.timestamp)
    g.txs.push(t)
    m.set(t[key], g)
  }
  return [...m.values()].sort((a, b) => b.total - a.total)
}

/**
 * Follow USDT out of `address` hop by hop.
 * - sources: the biggest senders into the reported wallet in the window (possible victims)
 * - each wallet's outgoing transfers after the money arrived; the top `fanout` recipients by value are followed
 * - a wallet whose outgoing value goes >= 80% to a labelled exchange wallet is an exchange deposit address
 *   (the exchange sweeps per-user deposit addresses into its hot wallets); tracing stops there
 * - a wallet with very many counterparties is flagged as a likely service and not expanded
 */
export async function traceTron({ address, hops = 3, fanout = 3, since, windowDays = 30, now = Date.now() }, client) {
  const t0 = since ?? now - windowDays * DAY
  const t1 = Math.min(now, t0 + windowDays * DAY)
  const nodes = new Map()
  const transfers = new Map()
  const warnings = []
  let budgetHit = false

  const node = (addr, hop, kind, extra = {}) => {
    const cur = nodes.get(addr)
    if (cur) return cur
    const n = { address: addr, hop, kind, ...extra }
    nodes.set(addr, n)
    return n
  }
  const addTx = (t) => transfers.set(`${t.hash}:${t.to}`, t)
  const markExchange = (n, lab) => Object.assign(n, { kind: 'exchange', entity: lab.entity || lab.label, label: lab.label, label_source: lab.source, fiu_ind_registered: lab.fiu_ind_registered ?? null })

  const root = node(address, 0, 'reported')
  const ownLabel = await client.label(address)
  if (ownLabel?.entity) warnings.push(`The reported wallet itself is labelled ${ownLabel.label}.`)

  // 1. who paid into the reported wallet
  let arrival = t0
  try {
    const inbound = await client.transfers(address, 'to', { min: t0, max: t1, limit: 50 })
    if (inbound.length) arrival = Math.min(...inbound.map((t) => t.timestamp))
    root.received_in_window = Number(inbound.reduce((s, t) => s + t.amount, 0).toFixed(6))
    for (const g of groupByCounterparty(inbound, 'from').slice(0, 6)) {
      node(g.address, -1, 'source')
      g.txs.forEach(addTx)
    }
    if (!inbound.length) warnings.push('No USDT received by this wallet in the time window.')
  } catch (e) {
    if (!(e instanceof BudgetError)) throw e
    budgetHit = true
  }

  // 2. breadth-first through outgoing transfers
  let frontier = [{ n: root, since: arrival }]
  const ancestors = new Set([address])
  for (let h = 0; h <= hops && frontier.length; h++) {
    const next = []
    await mapLimit(frontier, 4, async ({ n, since: from }) => {
      let out
      try {
        out = await client.transfers(n.address, 'from', { min: from, max: t1, limit: 50 })
      } catch (e) {
        if (!(e instanceof BudgetError)) throw e
        budgetHit = true
        n.truncated = true
        return
      }
      n.outgoing_in_window = out.length
      const groups = groupByCounterparty(out.filter((t) => t.to !== n.address && t.to !== USDT_CONTRACT), 'to')
      n.sent_in_window = Number(groups.reduce((s, g) => s + g.total, 0).toFixed(6)) // lets the UI estimate what is still parked here
      if (out.length >= 50) n.sent_capped = true
      // behaviour signals used by the risk rules (normal wallets pay few people slowly; mule wallets split fast)
      n.recipients_in_window = groups.length
      n.recipients_within_2h = groups.filter((g) => g.first - from <= 2 * 3600e3).length
      n.first_out_gap_min = groups.length ? Math.round((Math.min(...groups.map((g) => g.first)) - from) / 60000) : null
      if (!groups.length) return

      // label the biggest recipients (curated list is free; Tronscan lookups only for the top few)
      const labels = new Map()
      for (const g of groups.slice(0, fanout + 2)) {
        try { labels.set(g.address, await client.label(g.address)) } catch (e) { if (e instanceof BudgetError) { budgetHit = true; break } }
      }
      for (const g of groups) if (!labels.has(g.address) && KNOWN_EXCHANGE_WALLETS[g.address]) labels.set(g.address, { ...KNOWN_EXCHANGE_WALLETS[g.address], source: 'curated' })
      const isEx = (g) => Boolean(labels.get(g.address)?.entity)
      const total = groups.reduce((s, g) => s + g.total, 0)
      const toExchanges = groups.filter(isEx)
      const exShare = toExchanges.reduce((s, g) => s + g.total, 0) / total

      // deposit address: almost everything it sends goes to an exchange's own wallets
      if (n.hop >= 1 && toExchanges.length && exShare >= 0.8) {
        n.kind = 'deposit'
        for (const g of toExchanges) {
          markExchange(node(g.address, n.hop + 1, 'exchange'), labels.get(g.address))
          g.txs.forEach((t) => addTx({ ...t, sweep: true }))
        }
        return
      }
      if (groups.length > 25 && out.length >= 50) {
        n.kind = n.kind === 'reported' ? n.kind : 'service'
        n.high_volume = true
        if (n.kind === 'service') return
      }
      if (h === hops) { n.depth_end = true; return }

      const follow = [...toExchanges, ...groups.filter((g) => !isEx(g))].filter((g) => !ancestors.has(g.address)).slice(0, fanout)
      for (const g of follow) {
        g.txs.forEach(addTx)
        const existed = nodes.has(g.address)
        const child = node(g.address, n.hop + 1, 'layer')
        if (isEx(g)) { markExchange(child, labels.get(g.address)); continue }
        if (!existed) next.push({ n: child, since: g.first })
      }
    })
    next.forEach(({ n }) => ancestors.add(n.address))
    frontier = next
  }
  if (budgetHit) warnings.push('Trace stopped early to stay within the API budget; deeper hops were not followed.')

  return {
    address, network: 'TRON', token: 'USDT', window: { from: new Date(t0).toISOString(), to: new Date(t1).toISOString() },
    hops, fanout, nodes: [...nodes.values()], transfers: [...transfers.values()].sort((a, b) => a.timestamp - b.timestamp),
    calls: client.calls, budget_hit: budgetHit, warnings,
  }
}
