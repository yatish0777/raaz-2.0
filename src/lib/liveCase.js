// Turns the raw /api/trace result (real TRON transfers) into the same case shape the demo data uses,
// so the workspace, graph, attribution, risk and report screens work unchanged on live data.
import { riskLevel } from './format'

const ROLE = { source: 'inbound', reported: 'suspect', layer: 'intermediary', deposit: 'exchange_deposit', exchange: 'exchange_hot', service: 'intermediary' }
const LABEL = {
  source: 'Unattributed inbound (possible other victim)', reported: 'Reported suspect wallet', layer: 'Layering wallet',
  deposit: 'Exchange deposit address', service: 'High-volume wallet (possible service)',
}
const iso = (ms) => new Date(ms).toISOString()
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }

/** Same fixed formula as the demo data: 93 for a deposit swept into a known hot wallet, -3.5 per hop beyond 2 */
function confidence(hops) {
  const steps = [{ step: 'Deposit address swept into known exchange hot wallet', points: 93 }]
  if (hops > 2) steps.push({ step: `${hops - 2} hop(s) beyond 2 x -3.5`, points: -3.5 * (hops - 2) })
  const pts = steps.reduce((s, x) => s + x.points, 0)
  return { value: Math.min(97, Math.max(52, pts)) / 100, steps }
}

export function buildLiveCase(raw, form, { id, nowIso }) {
  const rate = raw.usdt_inr
  const inr = (usdt) => Math.round(usdt * rate)
  const reported = raw.address
  const byAddr = Object.fromEntries(raw.nodes.map((n) => [n.address, n]))

  // in-degree inside the traced graph marks consolidation wallets
  const inFrom = {}
  raw.transfers.forEach((t) => (inFrom[t.to] ??= new Set()).add(t.from))
  const roleOf = (n) => (n.kind === 'layer' && (inFrom[n.address]?.size || 0) >= 2 ? 'consolidation' : ROLE[n.kind] || 'intermediary')

  const transactions = raw.transfers.map((t) => {
    const from = byAddr[t.from]
    const to = byAddr[t.to]
    const kind = t.sweep ? 'exchange_sweep'
      : to?.kind === 'deposit' ? 'exchange_deposit'
        : from?.kind === 'source' ? 'inbound'
          : to?.kind === 'exchange' ? 'exchange_deposit'
            : 'layering'
    return {
      id: t.hash, hash: t.hash, case_id: id, network: 'TRON', from_address: t.from, to_address: t.to,
      amount: Number(t.amount.toFixed(2)), token: 'USDT', kind, inferred: false, value_inr: inr(t.amount),
      hop: to ? to.hop : 0, timestamp: iso(t.timestamp), block: null,
    }
  })

  const nodes = raw.nodes.map((n) => {
    const ins = raw.transfers.filter((t) => t.to === n.address)
    const outs = raw.transfers.filter((t) => t.from === n.address)
    const ts = [...ins, ...outs].map((t) => t.timestamp)
    const inAmt = ins.reduce((s, t) => s + t.amount, 0)
    const outAmt = outs.reduce((s, t) => s + t.amount, 0)
    const role = roleOf(n)
    return {
      address: n.address, network: 'TRON', role, hop: n.hop,
      label: n.kind === 'exchange' ? n.label : role === 'consolidation' ? 'Consolidation wallet' : LABEL[n.kind],
      entity: n.kind === 'exchange' ? n.entity : n.kind === 'deposit' ? raw.nodes.find((x) => x.kind === 'exchange' && raw.transfers.some((t) => t.from === n.address && t.to === x.address))?.entity ?? null : null,
      exchange_id: null, in_amount: Number(inAmt.toFixed(2)), out_amount: Number(outAmt.toFixed(2)), in_inr: inr(inAmt), out_inr: inr(outAmt),
      tx_count: ins.length + outs.length, first_seen: ts.length ? iso(Math.min(...ts)) : null, last_seen: ts.length ? iso(Math.max(...ts)) : null,
      // what is still sitting here, as far as this trace can see: USDT traced in minus everything it sent in the window
      balance: ['intermediary', 'consolidation', 'suspect'].includes(role) && n.sent_in_window != null && !n.sent_capped
        ? Math.max(0, Number((inAmt - n.sent_in_window).toFixed(2))) || null : null,
      label_source: n.label_source || null,
    }
  })

  const pool = transactions.filter((t) => t.to_address === reported).reduce((s, t) => s + t.value_inr, 0)
  const claimed = Number(form.amount) || 0

  // which sender is the complainant? the one whose payments match the amount lost (within 10%);
  // with no amount entered, the largest sender is assumed (and the page says so)
  const senders = nodes.filter((n) => n.role === 'inbound').sort((a, b) => b.out_inr - a.out_inr)
  const sentToReported = (n) => transactions.filter((t) => t.from_address === n.address && t.to_address === reported)
  const victim = claimed ? senders.find((n) => Math.abs(n.out_inr - claimed) / claimed <= 0.1) : senders[0]
  const assumedVictim = Boolean(victim && !claimed)
  if (victim) {
    Object.assign(victim, { role: 'victim', label: assumedVictim ? 'Largest sender (assumed complainant)' : "Complainant's wallet (victim)" })
    sentToReported(victim).forEach((t) => { t.kind = 'victim_payment' })
  }

  // exchange attribution: group deposit addresses by the exchange they sweep into
  const deposits = raw.nodes.filter((n) => n.kind === 'deposit')
  const attrMap = new Map()
  for (const d of deposits) {
    const hot = raw.nodes.find((x) => x.kind === 'exchange' && raw.transfers.some((t) => t.from === d.address && t.to === x.address))
    if (!hot) continue
    const a = attrMap.get(hot.entity) || { hot, deposits: [], hops: d.hop, amount_inr: 0 }
    a.deposits.push(d.address)
    a.hops = Math.min(a.hops, d.hop)
    a.amount_inr += transactions.filter((t) => t.to_address === d.address && t.kind === 'exchange_deposit').reduce((s, t) => s + t.value_inr, 0)
    attrMap.set(hot.entity, a)
  }
  // money sent straight to an exchange-owned wallet (no deposit step seen)
  for (const hot of raw.nodes.filter((n) => n.kind === 'exchange')) {
    if (attrMap.has(hot.entity)) continue
    const direct = transactions.filter((t) => t.to_address === hot.address && t.kind === 'exchange_deposit')
    if (direct.length) attrMap.set(hot.entity, { hot, deposits: [hot.address], hops: hot.hop, amount_inr: direct.reduce((s, t) => s + t.value_inr, 0) })
  }
  const attributions = [...attrMap.entries()].map(([entity, a]) => {
    const conf = confidence(a.hops)
    const lost = claimed || victim?.out_inr || 0 // pro-rata: the complainant's part of everything that entered the reported wallet
    const share = lost && pool ? Math.min(a.amount_inr, Math.round((a.amount_inr * lost) / pool)) : a.amount_inr
    return {
      exchange_id: `LIVE-${entity}`, exchange: entity, type: 'Exchange (public label)', jurisdiction: null,
      fiu_ind_registered: a.hot.fiu_ind_registered ?? null, hops: a.hops, amount_inr: a.amount_inr,
      pct_of_traced_pool: pool ? Math.round((1000 * a.amount_inr) / pool) / 10 : null, victim_attributable_inr: share,
      deposit_addresses: a.deposits, networks: ['TRON'], confidence: conf.value, confidence_steps: conf.steps,
      evidence: [
        'Deposit address swept to a known exchange hot wallet',
        a.hot.label_source === 'tronscan' ? 'Exchange wallet identified from Tronscan public labels' : 'Exchange wallet identified from RAAZ known-wallet list',
      ],
    }
  }).sort((x, y) => x.hops - y.hops || y.amount_inr - x.amount_inr)

  // patterns that can be read straight off real transfers
  const patterns = []
  const outOfReported = new Set(transactions.filter((t) => t.from_address === reported).map((t) => t.to_address))
  if (outOfReported.size >= 3) patterns.push({ type: 'Fan-out distribution', severity: 'High', confidence: 0.85, description: `Reported wallet split funds into ${outOfReported.size} fresh wallets.`, wallets: [reported, ...outOfReported] })
  const others = nodes.filter((n) => n.role === 'inbound')
  if (others.length >= 2) patterns.push({ type: 'Fan-in from unrelated sources', severity: 'Medium', confidence: 0.7, description: `${others.length} other wallets paid into the reported wallet in the same window - possible additional victims.`, wallets: others.map((n) => n.address) })
  const cons = nodes.filter((n) => n.role === 'consolidation')
  if (cons.length) patterns.push({ type: 'Consolidation before cash-out', severity: 'Medium', confidence: 0.8, description: `${cons.length} consolidation wallet(s) re-merge layering branches before the exchange.`, wallets: cons.map((n) => n.address) })
  // time from receiving to forwarding, per layering wallet
  const gaps = []
  for (const n of nodes.filter((x) => x.hop >= 0 && x.role !== 'exchange_hot')) {
    const firstIn = transactions.filter((t) => t.to_address === n.address).map((t) => +new Date(t.timestamp))
    const firstOut = transactions.filter((t) => t.from_address === n.address).map((t) => +new Date(t.timestamp))
    if (firstIn.length && firstOut.length) gaps.push((Math.min(...firstOut) - Math.min(...firstIn)) / 60000)
  }
  const med = median(gaps.filter((g) => g >= 0))
  if (med != null && med < 30) patterns.push({ type: 'Rapid layering (high velocity)', severity: 'High', confidence: 0.8, description: `Median time between hops is under ${Math.max(1, Math.ceil(med))} minutes, consistent with scripted or automated movement.`, wallets: nodes.filter((n) => n.hop >= 0).map((n) => n.address) })
  const parked = nodes.filter((n) => n.balance && n.role !== 'suspect')
  if (!attributions.length) patterns.push({ type: 'Funds dormant in layering wallets', severity: 'Medium', confidence: 0.75, description: 'No exchange deposit observed yet; funds are sitting in layering wallets. Recommend adding to watchlist.', wallets: parked.map((n) => n.address) })

  // rule engine (same rules and points as the demo engine; the ones live mode cannot check say so)
  const fired = (id) => patterns.some((p) => p.type === id)
  const rules = [
    { id: 'sanctioned_address_hop', name: 'Hop touches a sanctioned address (OFAC list)', points: 40, fired: false, evidence: 'Not checked in live mode yet.' },
    { id: 'mixer_interaction', name: 'Mixer / tumbler interaction', points: 30, fired: false, evidence: 'Not checked in live mode yet.' },
    { id: 'smurfing_split', name: 'Smurfing / peel-chain splitting', points: 15, fired: false, evidence: 'Not checked in live mode yet.' },
    { id: 'high_fan_out_node', name: 'High fan-out from the reported wallet', points: 15, fired: fired('Fan-out distribution'), evidence: `Reported wallet sent to only ${outOfReported.size} wallet(s).` },
    { id: 'rapid_layering', name: 'Rapid layering (median < 30 min per hop)', points: 12, fired: fired('Rapid layering (high velocity)'), evidence: med != null && med < 30 ? `Median time between hops is under ${Math.max(1, Math.ceil(med))} minutes.` : 'Hops are spread out; no scripted-speed movement.' },
    { id: 'fan_in_terminal', name: 'Branches converge before cash-out', points: 10, fired: cons.length > 0, evidence: cons.length ? `${cons.length} consolidation wallet(s) re-merge layering branches before the exchange.` : 'No consolidation point before the exchange.' },
    { id: 'unattributed_terminal_node', name: 'Funds end in an unlabelled wallet', points: 10, fired: parked.length > 0, evidence: parked.length ? 'Some traced funds rest in wallets with no exchange label - still movable.' : 'Traced funds reached labelled exchange deposit addresses.' },
  ]
  if (fired('Fan-out distribution')) rules[3].evidence = `Reported wallet split funds into ${outOfReported.size} fresh wallets.`
  const base = 30
  const score = Math.min(100, base + rules.filter((r) => r.fired).reduce((s, r) => s + r.points, 0))
  const risk = {
    score, level: riskLevel(score), model: 'Rule engine (live data)', base, base_reason: 'Wallet reported in a victim complaint', rules, rule_score: score,
    factors: [{ feature: 'Reported in a victim complaint (base)', contribution: base }, ...rules.filter((r) => r.fired).map((r) => ({ feature: r.name, contribution: r.points }))],
  }

  const n0 = attributions[0]
  const toVasp = attributions.reduce((s, a) => s + a.amount_inr, 0)
  const held = nodes.filter((n) => n.balance && n.role !== 'exchange_hot').reduce((s, n) => s + inr(n.balance), 0)
  const firstIn = transactions.filter((t) => t.to_address === reported).map((t) => t.timestamp).sort()[0]
  const amountInr = claimed || victim?.out_inr || pool
  const victimPayments = victim ? sentToReported(victim).length : 0
  const c = {
    id, live: true, ncrp_ack: form.ncrp || 'Not provided', title: `${form.fraudType} - ${form.district || form.state}`, fraud_type: form.fraudType,
    description: form.notes || 'Live trace started from a reported TRON wallet.', victim: { name: form.victimName || 'Not provided', age: null, phone: '-' },
    state: form.state, district: form.district || '-', reported_at: firstIn || nowIso, created_at: nowIso, network: 'TRON', token: 'USDT',
    reported_wallet: reported, victim_wallet: victim?.address ?? null, amount_lost_inr: amountInr, amount_lost_token: Number((amountInr / rate).toFixed(2)),
    payments: victimPayments || 1, status: n0 ? 'Exchange Identified' : 'Tracing',
    priority: score >= 80 ? 'P1' : score >= 60 ? 'P2' : 'P3', risk_score: score, risk_level: risk.level, investigator_id: 'INV01', investigator: 'Ananya Sharma',
    nearest_exchange: n0?.exchange ?? null, nearest_exchange_id: n0?.exchange_id ?? null, exchange_confidence: n0?.confidence ?? null, hops_to_exchange: n0?.hops ?? null,
    traced_to_vasp_inr: toVasp, held_in_wallets_inr: held, frozen_inr: 0, wallets_traced: nodes.length, transactions_traced: transactions.length,
    patterns: patterns.map((p) => p.type), syndicate: null, linked_cases: [], trace_depth: raw.hops, demo_generated: false,
    live_meta: { assumed_victim: assumedVictim, calls: raw.calls, budget_hit: raw.budget_hit, warnings: raw.warnings, window: raw.window, usdt_inr: rate, price_source: raw.price_source, keys: raw.keys },
  }
  const timeline = [
    ...(victim ? [{ at: sentToReported(victim)[0].timestamp, event: 'First payment by complainant to suspect wallet' }] : firstIn ? [{ at: firstIn, event: 'First USDT received by the reported wallet in the trace window' }] : []),
    { at: nowIso, event: `Case opened in RAAZ by Ananya Sharma${form.ncrp ? ` (NCRP ${form.ncrp})` : ''}` },
    { at: nowIso, event: `Live trace on TRON completed (${raw.calls} API calls)` },
    ...(n0 ? [{ at: nowIso, event: `Nearest VASP identified: ${n0.exchange} (${n0.hops} hops, ${Math.round(n0.confidence * 100)}% confidence)` }] : []),
  ]
  return { case: c, nodes, transactions, attributions, patterns, clusters: [], risk, timeline, notice: null, kyc_response: null, pool_inr: pool, live: true }
}
